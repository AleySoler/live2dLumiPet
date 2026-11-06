import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore, emptyManifest, listModels, migrateLegacyUserData, readManifest, readStoredModelId, resolveModel } from './store';
import { WindowManager } from './windows';
import { ShortcutManager } from './shortcuts';
import { TrayController } from './tray';
import { registerAppScheme, installAppProtocol } from './protocol';
import { fireHotkeyForShortcut, registerIpc } from './ipc';
import { runSmokeTest } from './smoke';
import { setLang } from '../shared/i18n';

const SMOKE = process.argv.includes('--smoke');
const MODE = SMOKE ? 'smoke' : 'normal';

// 单实例：第二次启动只把控制台拉出来
if (!SMOKE) {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  }
}

registerAppScheme();

app.setAppUserModelId('com.live2dlumipet.app');

// 改名后把旧 userData（配置 + 已导入模型）搬过来，必须在读配置之前
migrateLegacyUserData();

/**
 * 透明窗口在部分 Windows 环境（虚拟机 / 远程桌面 / 老显卡）下会整窗不可见，
 * 这是因为 DWM 直通合成失败。下面几个开关用来切换合成后端，实测后再决定默认值。
 */
if (process.argv.includes('--disable-direct-composition')) {
  app.commandLine.appendSwitch('disable-direct-composition');
}
if (process.argv.includes('--no-gpu-compositing')) {
  app.commandLine.appendSwitch('disable-gpu-compositing');
}
if (process.argv.includes('--software')) {
  app.disableHardwareAcceleration();
}

let config: ConfigStore;
let windows: WindowManager;
let shortcuts: ShortcutManager;
let tray: TrayController;

async function bootstrap() {
  await app.whenReady();
  installAppProtocol();

  // 诊断用：--import-zip <路径> 只做导入然后把结果打出来，不动配置
  const izIdx = process.argv.indexOf('--import-zip');
  if (izIdx > 0 && process.argv[izIdx + 1]) {
    const { importModelZip } = await import('./importer');
    try {
      const r = await importModelZip(process.argv[izIdx + 1]);
      console.log(
        'IMPORT_OK ' +
          JSON.stringify({
            id: r.manifest.id,
            name: r.manifest.name,
            counts: r.manifest.counts,
            hotkeys: r.manifest.hotkeys.map((h) => `${h.id}:${h.name}(${h.kind})`),
            paramMap: r.manifest.paramMap.length,
            warnings: r.warnings,
          }),
      );
      app.exit(0);
    } catch (err) {
      console.error('IMPORT_FAIL', (err as Error).message);
      app.exit(1);
    }
    return;
  }

  // 载入模型清单：以"上次使用的模型"为准，回退到第一个内置模型
  const storedId = readStoredModelId();
  const allModels = listModels();
  const picked =
    (storedId && allModels.find((m) => m.id === storedId)) ||
    allModels.find((m) => m.kind === 'builtin') ||
    allModels[0];
  // 没有任何模型时不再抛错退出 —— 进"无模型模式"：照常起控制台，
  // 桌宠窗口空着，用户在「模型」页导入后即可恢复
  const manifest = picked ? readManifest(picked.dir) : emptyManifest();
  if (!picked) console.log('[app] 没有可用模型，进入无模型模式（可在「模型」页导入）');
  if (storedId && picked && picked.id !== storedId) {
    console.warn(`[app] 找不到上次使用的模型 ${storedId}，回退到 ${picked.id}`);
  }

  config = new ConfigStore();
  config.init(manifest);

  windows = new WindowManager(config);

  // 托盘 / IPC / 快捷键 共用这一条应用链路，避免"托盘改了但界面和窗口没跟上"
  const applyConfigChange = (patch: any) => {
    windows.broadcast('config:changed', config.get());
    windows.applyPetConfig();
    tray.refresh();
    if (!patch || 'hotkeys' in patch || 'customHotkeys' in patch) {
      shortcuts.apply();
      windows.sendToControl('hotkeys:status', shortcuts.getStatuses());
    }
    if (!patch || 'misc' in patch) applyLoginItem();
  };

  /** 重置模型状态：回到屏幕中心、取消所有表情与动作、缩放归 1 */
  const resetModelState = () => {
    windows.centerPet();
    windows.sendToPet('ui:command', 'reset-state');
    config.update({ pet: { scale: 1 } });
  };

  const ctx = {
    config,
    windows,
    shortcuts: undefined as unknown as ShortcutManager,
    tray: undefined as unknown as TrayController,
    onConfigChanged: (patch: any) => applyConfigChange(patch),
    resetModelState,
  };

  shortcuts = new ShortcutManager(config, (id) => {
    console.log('[hotkey] fired', id, new Date().toISOString());
    fireHotkeyForShortcut(ctx as any, id);
  });


  tray = new TrayController(
    config,
    windows,
    () => config.update({ pet: { mouseControl: !config.get().pet.mouseControl } }),
    resetModelState,
  );
  ctx.shortcuts = shortcuts;
  ctx.tray = tray;

  // 唯一入口：无论配置从哪改（控制台 IPC / 托盘 / 快捷键），都在这里统一落地
  config.on('changed', (_cfg: unknown, patch: unknown) => applyConfigChange(patch));

  registerIpc(ctx);
  shortcuts.apply();
  tray.ensure();
  applyLoginItem();

  app.on('will-quit', () => shortcuts.dispose());

  if (SMOKE) {
    await runSmokeTest({ config, windows, manifest });
    return;
  }

  // 调试开关透传给桌宠页面（URL query）
  const petQuery = ['--logcursor', '--freeze', '--motionsanity', '--shadowdiag']
    .filter((f) => process.argv.includes(f))
    .map((f) => f.slice(2) + '=1')
    .join('&');
  windows.createPet(petQuery ? '?' + petQuery : '');

  app.on('second-instance', () => {
    windows.createControl();
  });

  app.on('activate', () => {
    windows.createPet();
  });
}

function applyLoginItem() {
  try {
    app.setLoginItemSettings({ openAtLogin: config.get().misc.launchAtLogin, args: [] });
  } catch (err) {
    console.warn('[app] 设置开机自启失败', err);
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (err) => {
  console.error('[main] 未捕获异常', err);
  if (SMOKE) process.exit(1);
});

bootstrap().catch((err) => {
  console.error('[main] 启动失败', err);
  process.exit(1);
});

export type { BrowserWindow };
