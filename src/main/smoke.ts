import { app, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { ConfigStore } from './store';
import type { ModelManifest } from '../shared/types';
import type { WindowManager } from './windows';

/**
 * 端到端自检：真实拉起渲染进程 + 真实加载模型，跑一遍
 * 表情 / 动作 / 参数驱动 / 截图，任一环节失败即退出码 1。
 */
export async function runSmokeTest(opts: {
  config: ConfigStore;
  windows: WindowManager;
  manifest: ModelManifest;
}) {
  const outDir = path.join(app.getAppPath(), 'smoke-out');
  fs.mkdirSync(outDir, { recursive: true });
  const diag = process.argv.includes('--diag');
  const raw = process.argv.includes('--raw');
  const shotOnly = process.argv.includes('--shot');
  const shotControl = process.argv.includes('--shot-control');
  const dump = process.argv.includes('--dump');
  const nose = process.argv.includes('--nose');
  const glowmap = process.argv.includes('--glowmap');

  if (dump || glowmap) {
    const w = opts.windows.createPet(dump ? '?dump=1&shadowdiag=1' : '?glowmap=1');
    await new Promise((r) => setTimeout(r, 9000));
    const img = await w.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, dump ? 'dump.png' : 'glowmap.png'), img.toPNG());
    setTimeout(() => app.exit(0), 200);
    return;
  }

  if (shotControl) {
    const cw = opts.windows.createControl();
    await new Promise((r) => setTimeout(r, 7000));

    // 真实走一遍模型切换的 IPC：列表 → 切到用户模型 → 切回原模型
    // 同时验证控制台界面是否跟着换（快捷键页副标题、模型与数据里的模型名）
    try {
      const before = opts.config.get().modelId;
      const ids = (await cw.webContents.executeJavaScript(
        `window.petAPI.listModels().then(r => r.models.map(m => m.id))`,
      )) as string[];
      const target = ids.find((id) => id !== before);

      const readUi = async () => {
        await cw.webContents.executeJavaScript(`window.__setTab('hotkeys'); true`);
        await new Promise((r) => setTimeout(r, 450));
        const hk = (await cw.webContents.executeJavaScript(
          `document.querySelector('.main p.sub')?.textContent || ''`,
        )) as string;
        // 设置页要先挂载，__setSettingsTab 才会被注册
        await cw.webContents.executeJavaScript(`window.__setTab('settings'); true`);
        await new Promise((r) => setTimeout(r, 450));
        await cw.webContents.executeJavaScript(`window.__setSettingsTab && window.__setSettingsTab('model'); true`);
        await new Promise((r) => setTimeout(r, 500));
        const modelName = (await cw.webContents.executeJavaScript(
          `document.querySelector('.main')?.textContent || ''`,
        )) as string;
        return { hk: hk.slice(0, 60), modelName: modelName.slice(0, 300) };
      };

      const uiBefore = await readUi();
      let switched: string | null = null;
      let uiAfter = uiBefore;
      if (target) {
        await cw.webContents.executeJavaScript(`window.petAPI.setModel(${JSON.stringify(target)}).then(() => true)`);
        await new Promise((r) => setTimeout(r, 2000));
        switched = opts.config.get().modelId;
        uiAfter = await readUi();
        await cw.webContents.executeJavaScript(`window.petAPI.setModel(${JSON.stringify(before)}).then(() => true)`);
        await new Promise((r) => setTimeout(r, 1200));
        await readUi();
      }
      const uiChanged = uiBefore.hk !== uiAfter.hk && uiBefore.modelName !== uiAfter.modelName;
      console.log(
        'MODEL_WIRING ' +
          JSON.stringify({
            before,
            ids,
            target: target ?? null,
            switched,
            restored: opts.config.get().modelId,
            uiBefore,
            uiAfter,
            uiChanged,
            ok: !target || (switched === target && opts.config.get().modelId === before && uiChanged),
          }),
      );
    } catch (err) {
      console.log('MODEL_WIRING ' + JSON.stringify({ ok: false, error: String(err) }));
    }

    for (const tab of ['overview', 'tracking', 'models', 'hotkeys', 'params']) {
      await cw.webContents.executeJavaScript(
        `window.__setTab && window.__setTab(${JSON.stringify(tab)}); true`,
      );
      await new Promise((r) => setTimeout(r, 900));
      const img = await cw.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, `control-${tab}.png`), img.toPNG());
      console.log('SHOT control-' + tab);
    }
    // 设置页的每个二级分类都截一张
    await cw.webContents.executeJavaScript(`window.__setTab && window.__setTab('settings'); true`);
    await new Promise((r) => setTimeout(r, 700));
    for (const sub of ['render', 'behavior', 'window', 'system', 'model']) {
      await cw.webContents.executeJavaScript(
        `window.__setSettingsTab && window.__setSettingsTab(${JSON.stringify(sub)}); true`,
      );
      await new Promise((r) => setTimeout(r, 700));
      const img = await cw.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, `control-settings-${sub}.png`), img.toPNG());
      console.log('SHOT control-settings-' + sub);
    }
    setTimeout(() => app.exit(0), 200);
    return;
  }

  const qs = new URLSearchParams();
  if (!shotOnly) qs.set('smoke', '1');
  if (diag) qs.set('diag', '1');
  if (raw) qs.set('raw', '1');
  if (process.argv.includes('--freeze')) qs.set('freeze', '1');
  if (process.argv.includes('--lean')) qs.set('lean', '1');
  if (process.argv.includes('--motionsanity')) qs.set('motionsanity', '1');
  const pickArg = process.argv.indexOf('--pick');
  if (pickArg > 0 && process.argv[pickArg + 1]) qs.set('pick', process.argv[pickArg + 1]);
  const ttest = process.argv.includes('--ttest');
  if (ttest) qs.set('ttest', '1');
  if (nose) qs.set('nose', '1');
  const win = opts.windows.createPet('?' + qs.toString());

  if (ttest) {
    const facePath = path.join(app.getAppPath(), 'assets', 'test', 'portrait.jpg');
    if (fs.existsSync(facePath)) {
      const b64 = fs.readFileSync(facePath).toString('base64');
      win.webContents.once('did-finish-load', () => {
        setTimeout(() => win.webContents.send('tracking:test-image', 'data:image/jpeg;base64,' + b64), 1500);
      });
    } else {
      console.warn('[smoke] 缺少测试人脸图片', facePath);
    }
  }

  if (shotOnly) {
    await new Promise((r) => setTimeout(r, 6000));
    const image = await win.webContents.capturePage();
    const tag = process.argv.includes('--tag') ? process.argv[process.argv.indexOf('--tag') + 1] : '';
    const file = path.join(outDir, `${raw ? 'shot-raw' : 'shot'}${tag ? '-' + tag : ''}.png`);
    fs.writeFileSync(file, image.toPNG());
    console.log('SHOT ' + file);
    setTimeout(() => app.exit(0), 200);
    return;
  }

  // 顺带验证"配置改动 -> 窗口生效"这条链路（托盘/控制台共用它）
  const wiring: { ok: boolean; before: boolean; afterOff: boolean } = { ok: false, before: false, afterOff: false };
  (async () => {
    await new Promise((r) => setTimeout(r, 4500));
    wiring.before = opts.windows.isIgnoringMouse();
    opts.config.update({ pet: { mouseControl: false } });
    await new Promise((r) => setTimeout(r, 300));
    wiring.afterOff = opts.windows.isIgnoringMouse();
    opts.config.update({ pet: { mouseControl: true } });
    wiring.ok = wiring.afterOff === true;
  })();

  const report = await new Promise<any>((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'timeout waiting for renderer' }), 180_000);
    ipcMain.once('smoke:report', (_e, payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
  await new Promise((r) => setTimeout(r, 500));

  // 等两帧再截图，保证模型已经画上去
  await new Promise((r) => setTimeout(r, 600));
  const shots: string[] = [];
  try {
    const image = await win.webContents.capturePage();
    const file = path.join(outDir, 'pet.png');
    fs.writeFileSync(file, image.toPNG());
    shots.push(file);
  } catch (err) {
    console.error('[smoke] 截图失败', err);
  }

  const summary = {
    ok: !!report?.ok && wiring.ok,
    report,
    wiring,
    screenshots: shots,
    model: {
      id: opts.manifest.id,
      expressions: opts.manifest.expressions.length,
      motions: opts.manifest.motions.length,
      hotkeys: opts.manifest.hotkeys.length,
      paramMap: opts.manifest.paramMap.length,
    },
    config: {
      hotkeys: Object.keys(opts.config.get().hotkeys).length,
    },
  };
  const line = 'SMOKE_RESULT ' + JSON.stringify(summary);
  console.log(line);
  fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(summary, null, 2), 'utf8');
  setTimeout(() => app.exit(summary.ok ? 0 : 1), 200);
}
