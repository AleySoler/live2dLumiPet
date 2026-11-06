import { app, dialog, ipcMain, screen, session, shell } from 'electron';
import type { ActionRequest, AppConfig, BootInfo, CustomHotkey, DeepPartial, RuntimeState } from '../shared/types';
import { ConfigStore, NO_MODEL_ID, emptyManifest, listModels, readManifest, rendererRoot, resolveModel, userModelsDir } from './store';
import { deleteModel, importModelZip } from './importer';
import type { WindowManager } from './windows';
import type { ShortcutManager } from './shortcuts';
import type { TrayController } from './tray';

interface Ctx {
  config: ConfigStore;
  windows: WindowManager;
  shortcuts: ShortcutManager;
  tray: TrayController;
  onConfigChanged: (patch: DeepPartial<AppConfig>) => void;
  resetModelState: () => void;
}

let lastState: RuntimeState | null = null;

export function registerIpc(ctx: Ctx) {
  const { config, windows, shortcuts } = ctx;

  /** 当前运行态的启动信息；换模型后要重新推给控制台，否则界面还显示旧模型 */
  const bootInfo = (mode: 'pet' | 'control'): BootInfo => {
    const manifest = config.getManifest();
    const model = resolveModel(config.get().modelId);
    const hasModel = listModels().length > 0;
    return {
      mode,
      config: config.get(),
      manifest,
      modelBase: model.urlBase,
      appVersion: app.getVersion(),
      assetRoot: rendererRoot(),
      modelsDir: userModelsDir(),
      hasModel,
      platform: process.platform,
    };
  };

  ipcMain.handle('app:boot', (_e, mode: 'pet' | 'control'): BootInfo => bootInfo(mode));

  ipcMain.handle('config:get', () => config.get());

  // 说明：所有 config.update() 都会触发 ConfigStore 的 'changed' 事件，
  // 由 index.ts 里的唯一入口统一落地（广播 / 窗口 / 热键 / 托盘）。
  // 这里不要再手工调用一次，否则会重复重注册全局热键。
  ipcMain.handle('config:update', (_e, patch: DeepPartial<AppConfig>) => config.update(patch));

  ipcMain.handle('config:reset', () => config.reset());

  ipcMain.handle('hotkeys:status', () => shortcuts.getStatuses());

  ipcMain.handle('hotkeys:fire', (_e, id: string) => {
    fireHotkeyById(ctx, id);
  });

  ipcMain.handle('hotkeys:add', (_e, hk: Omit<CustomHotkey, 'id'>) => {
    const list = [...(config.get().customHotkeys ?? [])];
    const id = `custom-${Date.now().toString(36)}`;
    list.push({ ...hk, id });
    return config.update({ customHotkeys: list });
  });

  ipcMain.handle('hotkeys:remove', (_e, id: string) => {
    const list = (config.get().customHotkeys ?? []).filter((h) => h.id !== id);
    return config.update({ customHotkeys: list });
  });

  ipcMain.handle('action:request', (_e, req: ActionRequest) => {
    windows.sendToPet('action:fire', req);
  });

  /** 换模型后把新的 manifest/base 推给控制台，否则界面一直显示旧模型 */
  const pushBoot = () => {
    windows.sendToControl('app:boot', bootInfo('control'));
  };

  ipcMain.handle('models:list', () => ({
    models: listModels(),
    current: config.get().modelId,
  }));

  ipcMain.handle('models:set', (_e, id: string) => {
    const found = listModels().find((m) => m.id === id);
    if (!found) throw new Error(`模型不存在：${id}`);
    const manifest = readManifest(found.dir);
    // 换 manifest 而不只是改 modelId，否则热键/参数映射还留在旧模型上
    const next = config.useModel(id, manifest);
    windows.sendToPet('ui:command', 'reload-model');
    windows.sendToControl('config:changed', next);
    pushBoot();
    return next;
  });

  /** 选一个 zip 并导入；返回新模型的信息 */
  ipcMain.handle('models:import', async () => {
    const parent = windows.controlWindowForDialog() ?? undefined;
    const picked = await dialog.showOpenDialog(parent as never, {
      title: '导入 Live2D 模型（.zip）',
      filters: [{ name: '模型压缩包', extensions: ['zip'] }],
      properties: ['openFile'],
    });
    if (picked.canceled || !picked.filePaths.length) return null;
    const result = await importModelZip(picked.filePaths[0]);
    // 之前处于无模型模式的话，导入后直接启用它，用户不用再点一次「使用」
    if (config.get().modelId === NO_MODEL_ID) {
      config.useModel(result.manifest.id, result.manifest);
      config.update({ misc: { modelEnabled: true } });
      windows.sendToPet('ui:command', 'reload-model');
      windows.sendToControl('config:changed', config.get());
      pushBoot();
    }
    return {
      id: result.manifest.id,
      name: result.manifest.name,
      warnings: result.warnings,
      counts: result.manifest.counts,
    };
  });

  ipcMain.handle('models:delete', async (_e, id: string) => {
    const found = listModels().find((m) => m.id === id);
    if (!found) throw new Error(`模型不存在：${id}`);
    if (found.kind === 'builtin') throw new Error('内置模型不能删除');
    await deleteModel(id);
    // 删掉的正好是当前模型 → 回退到另一个模型；一个都不剩就进无模型模式
    if (config.get().modelId === id) {
      const fallback = listModels().find((m) => m.kind === 'builtin') ?? listModels()[0];
      if (fallback) {
        const manifest = readManifest(fallback.dir);
        config.useModel(fallback.id, manifest);
        windows.sendToPet('ui:command', 'reload-model');
      } else {
        config.useModel(NO_MODEL_ID, emptyManifest());
        windows.sendToPet('ui:command', 'unload-model');
      }
      windows.sendToControl('config:changed', config.get());
      pushBoot();
    }
    return { models: listModels(), current: config.get().modelId };
  });

  /* ---- 桌宠窗口 ---- */
  ipcMain.on('pet:ignore-mouse', (_e, ignore: boolean) => {
    // 鼠标控制关闭时，只允许渲染层把窗口"继续放开"，不允许它恢复可交互
    if (!ignore && !config.get().pet.mouseControl) return;
    windows.setIgnoreMouse(!!ignore);
  });
  // 拖动由主进程自己按 60Hz 读光标驱动，渲染层只发开始/结束（坐标参数已废弃）
  ipcMain.on('pet:drag-start', () => windows.beginDrag());
  ipcMain.on('pet:drag-end', () => windows.endDrag());

  ipcMain.handle('pet:scale', (_e, factor: number) => {
    const cur = config.get().pet.scale;
    const next = Math.min(1.8, Math.max(0.35, Math.round(cur * factor * 100) / 100));
    config.update({ pet: { scale: next } });
    return next;
  });

  ipcMain.on('pet:menu', () => ctx.tray.popup());
  // 控制台和托盘共用同一个"重置模型状态"实现
  ipcMain.on('pet:reset-state', () => ctx.resetModelState());

  /* 摄像头预览帧：pet 渲染进程 -> control 面板 */
  let previewOn = false;
  ipcMain.on('preview:set', (_e, on: boolean) => {
    previewOn = !!on;
    windows.sendToPet('preview:set', previewOn);
  });
  ipcMain.on('preview:frame', (_e, dataUrl: string) => {
    if (previewOn) windows.sendToControl('preview:frame', dataUrl);
  });

  ipcMain.on('state:report', (_e, state: RuntimeState) => {
    lastState = state;
    windows.sendToControl('state:update', state);
  });
  ipcMain.handle('state:get', () => lastState);

  /* ---- 应用 ---- */
  ipcMain.on('control:open', () => windows.createControl());
  ipcMain.on('app:quit', () => app.quit());

  ipcMain.handle('app:open-external', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) return shell.openExternal(url);
    return Promise.resolve();
  });

  ipcMain.handle('screen:info', () => {
    const d = screen.getPrimaryDisplay();
    return { workArea: d.workArea, size: d.size, scaleFactor: d.scaleFactor };
  });

  /* 摄像头权限：只放行 media */
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media';
  });
}

function fireHotkeyById(ctx: Ctx, id: string) {
  const manifest = ctx.config.getManifest();
  const cfg = ctx.config.get();
  const vts = manifest.hotkeys.find((h) => h.id === id);
  if (vts) {
    ctx.windows.sendToPet('action:fire', {
      kind: vts.kind,
      assetId: vts.assetId,
      hotkeyId: vts.id,
      label: vts.label,
    } satisfies ActionRequest);
    return;
  }
  const custom = (cfg.customHotkeys ?? []).find((h) => h.id === id);
  if (custom) {
    ctx.windows.sendToPet('action:fire', {
      kind: custom.kind,
      assetId: custom.assetId,
      hotkeyId: custom.id,
      label: custom.name,
    } satisfies ActionRequest);
  }
}

export function fireHotkeyForShortcut(ctx: Ctx, id: string) {
  fireHotkeyById(ctx, id);
}
