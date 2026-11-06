#!/usr/bin/env node
/**
 * prepare-assets.mjs
 * ---------------------------------------------------------------
 * 1. 下载/缓存 Cubism Core（Web 版运行时）
 * 2. 从 node_modules 复制 MediaPipe vision wasm，并缓存 face_landmarker.task
 * 3. 把 VTube Studio 模型(github 规范) 归一化成 public/model/<id>/ 下的
 *    ASCII 路径资源树，并生成增强版 model3.json + manifest.json
 *
 * 产物进入 public/，会被 Vite 原样复制到 dist/renderer/。
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const CACHE = path.join(ROOT, '.cache');
const MODEL_SRC = path.join(ROOT, 'assets', 'model-src', 'deepseek-chan');
const MODEL_OUT = path.join(PUBLIC, 'model', 'deepseek-chan');

const CUBISM_CORE_URL = 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js';
const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const log = (...a) => console.log('[assets]', ...a);

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function fetchToFile(url, dest, { minBytes = 1024, headers = {} } = {}) {
  if (fs.existsSync(dest) && fs.statSync(dest).size >= minBytes) {
    log('cached', path.relative(ROOT, dest));
    return false;
  }
  await ensureDir(path.dirname(dest));
  log('download', url);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      ...headers,
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`下载失败 ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < minBytes) throw new Error(`下载内容过小 (${buf.length}B) ${url}`);
  await fsp.writeFile(dest, buf);
  log('saved', path.relative(ROOT, dest), (buf.length / 1024).toFixed(0) + 'KB');
  return true;
}

/* ------------------------------------------------------------------ *
 * 1. Cubism Core
 * ------------------------------------------------------------------ */
async function prepareCubismCore() {
  const cache = path.join(CACHE, 'live2dcubismcore.min.js');
  await fetchToFile(CUBISM_CORE_URL, cache, { minBytes: 50_000 });
  const dest = path.join(PUBLIC, 'vendor', 'live2dcubismcore.min.js');
  await ensureDir(path.dirname(dest));
  await fsp.copyFile(cache, dest);
  const head = fs.readFileSync(dest, 'utf8').slice(0, 200);
  if (!/Live2D|Cubism/i.test(head)) throw new Error('Cubism Core 内容异常，前 200 字节不包含 Live2D/Cubism 标识');
  return dest;
}

/* ------------------------------------------------------------------ *
 * 2. MediaPipe
 * ------------------------------------------------------------------ */
async function prepareMediaPipe() {
  const pkgDir = path.join(ROOT, 'node_modules', '@mediapipe', 'tasks-vision');
  const wasmSrc = path.join(pkgDir, 'wasm');
  const wasmOut = path.join(PUBLIC, 'vendor', 'mediapipe', 'wasm');
  if (!fs.existsSync(wasmSrc)) throw new Error('缺少 @mediapipe/tasks-vision，请先 npm install');
  await ensureDir(wasmOut);
  for (const f of await fsp.readdir(wasmSrc)) {
    if (!/\.(js|wasm)$/.test(f)) continue;
    await fsp.copyFile(path.join(wasmSrc, f), path.join(wasmOut, f));
  }
  const files = await fsp.readdir(wasmOut);
  const taskCache = path.join(CACHE, 'face_landmarker.task');
  await fetchToFile(FACE_MODEL_URL, taskCache, { minBytes: 1_000_000 });
  await fsp.copyFile(taskCache, path.join(PUBLIC, 'vendor', 'mediapipe', 'face_landmarker.task'));
  log('mediapipe wasm:', files.join(', '));
}

/* ------------------------------------------------------------------ *
 * 3. 模型归一化
 * ------------------------------------------------------------------ */
const pad = (n) => String(n).padStart(2, '0');

async function readJson(p) {
  return JSON.parse(await fsp.readFile(p, 'utf8'));
}
async function writeJson(p, data) {
  await ensureDir(path.dirname(p));
  await fsp.writeFile(p, JSON.stringify(data, null, 2), 'utf8');
}

/** VTube Studio 的按键 token -> Electron accelerator 片段 */
const VTS_MODIFIER = {
  Alt: 'Alt',
  LeftAlt: 'Alt',
  RightAlt: 'Alt',
  Control: 'Ctrl',
  LeftControl: 'Ctrl',
  RightControl: 'Ctrl',
  Shift: 'Shift',
  LeftShift: 'Shift',
  RightShift: 'Shift',
  Command: 'Super',
  LeftCommand: 'Super',
  RightCommand: 'Super',
};
const VTS_KEY = {
  N0: '0', N1: '1', N2: '2', N3: '3', N4: '4',
  N5: '5', N6: '6', N7: '7', N8: '8', N9: '9',
  Numpad0: 'num0', Numpad1: 'num1', Numpad2: 'num2', Numpad3: 'num3', Numpad4: 'num4',
  Numpad5: 'num5', Numpad6: 'num6', Numpad7: 'num7', Numpad8: 'num8', Numpad9: 'num9',
  Space: 'Space',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  UpArrow: 'Up',
  DownArrow: 'Down',
  LeftArrow: 'Left',
  RightArrow: 'Right',
  Enter: 'Enter',
  Return: 'Enter',
  Tab: 'Tab',
  Escape: 'Escape',
  Backspace: 'Backspace',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  LeftBracket: '[',
  RightBracket: ']',
  Backslash: '\\',
  Minus: '-',
  Equals: '=',
  Backquote: '`',
};

function vtsTokenToAccelerator(tok) {
  if (!tok) return null;
  if (VTS_MODIFIER[tok]) return VTS_MODIFIER[tok];
  if (VTS_KEY[tok]) return VTS_KEY[tok];
  if (/^F\d{1,2}$/.test(tok)) return tok;
  if (/^[A-Z]$/.test(tok)) return tok;
  if (/^[a-z]$/.test(tok)) return tok.toUpperCase();
  if (/^\d$/.test(tok)) return tok;
  return null;
}

function vtsTriggersToAccelerator(triggers) {
  const parts = [];
  for (const raw of [triggers?.Trigger1, triggers?.Trigger2, triggers?.Trigger3]) {
    const a = vtsTokenToAccelerator(raw);
    if (!a) continue;
    if (!parts.includes(a)) parts.push(a);
  }
  return parts.length ? parts.join('+') : null;
}

async function prepareModel() {
  // 本程序不附带任何模型：仓库里没有 assets/model-src 时跳过归一化，
  // 应用以"无模型模式"启动，由用户自己在「模型」页导入 zip。
  if (!fs.existsSync(MODEL_SRC)) {
    log('跳过内置模型（未找到 ' + path.relative(ROOT, MODEL_SRC) + '），应用将以无模型模式启动');
    return false;
  }
  const vts = await readJson(path.join(MODEL_SRC, '大肥鱼.vtube.json'));
  const base3 = await readJson(path.join(MODEL_SRC, '大肥鱼.model3.json'));
  const cdi3 = await readJson(path.join(MODEL_SRC, '大肥鱼.cdi3.json'));

  await fsp.rm(MODEL_OUT, { recursive: true, force: true });
  await ensureDir(MODEL_OUT);

  /* ---- moc3 / physics / display ---- */
  await fsp.copyFile(path.join(MODEL_SRC, base3.FileReferences.Moc), path.join(MODEL_OUT, 'model.moc3'));
  if (base3.FileReferences.Physics) {
    await fsp.copyFile(path.join(MODEL_SRC, base3.FileReferences.Physics), path.join(MODEL_OUT, 'physics3.json'));
  }
  if (base3.FileReferences.DisplayInfo) {
    await fsp.copyFile(path.join(MODEL_SRC, base3.FileReferences.DisplayInfo), path.join(MODEL_OUT, 'display.json'));
  }

  /* ---- textures ---- */
  await ensureDir(path.join(MODEL_OUT, 'textures'));
  const textures = [];
  for (let i = 0; i < base3.FileReferences.Textures.length; i++) {
    const rel = base3.FileReferences.Textures[i];
    const name = `texture_${pad(i)}.png`;
    await fsp.copyFile(path.join(MODEL_SRC, rel), path.join(MODEL_OUT, 'textures', name));
    textures.push(`textures/${name}`);
  }

  /* ---- 表情 ---- */
  await ensureDir(path.join(MODEL_OUT, 'expressions'));
  const expFiles = (await fsp.readdir(path.join(MODEL_SRC, 'Exp3'))).filter((f) => f.endsWith('.exp3.json'));
  const expressions = []; // { id, file, label, srcName, fadeIn, fadeOut }
  expFiles.sort();
  for (let i = 0; i < expFiles.length; i++) {
    const src = expFiles[i];
    const label = src.replace(/\.exp3\.json$/, '');
    const exp = await readJson(path.join(MODEL_SRC, 'Exp3', src));
    const id = `exp-${pad(i)}`;
    const file = `expressions/${id}.exp3.json`;
    const out = {
      Type: exp.Type ?? 'Live2D Expression',
      Name: label,
      // 模型自带的 exp3 大多没写 FadeInTime；0.2s 对"换裙子"这种整块几何变化太快，
      // 默认拉到 0.5s，面板里还能再乘一个倍率
      FadeInTime: exp.FadeInTime ?? 0.5,
      FadeOutTime: exp.FadeOutTime ?? 0.5,
      Parameters: exp.Parameters ?? [],
    };
    await writeJson(path.join(MODEL_OUT, file), out);
    expressions.push({
      id,
      file,
      label,
      srcName: src,
      fadeIn: out.FadeInTime,
      fadeOut: out.FadeOutTime,
      paramCount: out.Parameters.length,
    });
  }

  /* ---- 动作 ---- */
  await ensureDir(path.join(MODEL_OUT, 'motions'));
  const motionFiles = (await fsp.readdir(path.join(MODEL_SRC, 'Animation'))).filter((f) => f.endsWith('.motion3.json'));
  const motionBySrc = new Map();
  const motions = { Idle: [], Action: [] };
  const motionMeta = [];
  const IDLE_SRC = ['IDLE.motion3.json'];
  let mi = 0;
  for (const src of motionFiles) {
    const isIdle = IDLE_SRC.includes(src);
    const label = src.replace(/\.motion3\.json$/, '');
    const mot = await readJson(path.join(MODEL_SRC, 'Animation', src));
    const id = `mot-${pad(mi++)}`;
    const file = `motions/${id}.motion3.json`;
    const group = isIdle ? 'Idle' : 'Action';
    mot.Meta = mot.Meta ?? {};
    // Action 组是"状态切换"动画，只能播一次；Idle 组循环
    mot.Meta.Loop = isIdle ? true : false;
    mot.Meta.FadeInTime = isIdle ? 0.8 : 0.15;
    mot.Meta.FadeOutTime = isIdle ? 0.8 : 0.15;
    mot.Name = label;
    await writeJson(path.join(MODEL_OUT, file), mot);
    motions[group].push({
      File: file,
      FadeInTime: mot.Meta.FadeInTime,
      FadeOutTime: mot.Meta.FadeOutTime,
      Name: label,
    });
    motionBySrc.set(src, { id, file, label, group, duration: mot.Meta.Duration ?? 0 });
    motionMeta.push({
      id,
      file,
      label,
      group,
      duration: mot.Meta.Duration ?? 0,
      isIdle,
      curveCount: mot.Meta.CurveCount ?? 0,
    });
  }

  /* ---- 增强版 model3.json ---- */
  const settings = {
    Version: 3,
    FileReferences: {
      Moc: 'model.moc3',
      Textures: textures,
      Physics: 'physics3.json',
      DisplayInfo: 'display.json',
      Motions: motions,
      Expressions: expressions.map((e) => ({
        Name: e.label,
        File: e.file,
        FadeInTime: e.fadeIn,
        FadeOutTime: e.fadeOut,
      })),
    },
    Groups: base3.Groups ?? [],
  };
  await writeJson(path.join(MODEL_OUT, 'model3.json'), settings);

  /* ---- 快捷键 ---- */
  const expBySrc = new Map(expressions.map((e) => [e.srcName, e]));
  const hotkeys = [];
  let hkIndex = 0;
  for (const hk of vts.Hotkeys ?? []) {
    const triggers = hk.Triggers ?? {};
    const accelerator = vtsTriggersToAccelerator(triggers);
    const kind =
      hk.Action === 'ToggleExpression' ? 'expression' : hk.Action === 'TriggerAnimation' ? 'motion' : 'clear-expressions';
    let asset = null;
    let assetId = null;
    let label = hk.Name;
    let duration = 0;
    if (kind === 'expression') {
      const exp = expBySrc.get(hk.File);
      if (!exp) {
        log(`  ! 表情文件缺失: ${hk.File} (${hk.Name})`);
        continue;
      }
      asset = exp.file;
      assetId = exp.id;
      label = exp.label;
    } else if (kind === 'motion') {
      const mot = motionBySrc.get(hk.File);
      if (!mot) {
        log(`  ! 动作文件缺失: ${hk.File} (${hk.Name})`);
        continue;
      }
      asset = mot.file;
      assetId = mot.id;
      duration = mot.duration;
    }
    hotkeys.push({
      id: `hk-${pad(hkIndex++)}`,
      name: hk.Name,
      label,
      kind,
      asset,
      assetId,
      duration,
      vtsName: hk.Name,
      vtsAction: hk.Action,
      vtsTriggers: {
        t1: triggers.Trigger1 ?? '',
        t2: triggers.Trigger2 ?? '',
        t3: triggers.Trigger3 ?? '',
      },
      defaultAccelerator: accelerator,
    });
  }

  /* ---- 参数映射（VTube Studio ParameterSettings 原样搬过来） ---- */
  const paramMap = (vts.ParameterSettings ?? [])
    .filter((p) => p.OutputLive2D)
    .map((p) => ({
      name: p.Name,
      input: p.Input || null,
      output: p.OutputLive2D,
      inLower: p.InputRangeLower,
      inUpper: p.InputRangeUpper,
      outLower: p.OutputRangeLower,
      outUpper: p.OutputRangeUpper,
      smoothing: p.Smoothing ?? 0,
      blink: !!p.UseBlinking,
      breath: !!p.UseBreathing,
      clampInput: !!p.ClampInput,
      clampOutput: !!p.ClampOutput,
    }));

  /* ---- 参数中文名（供面板展示） ---- */
  const paramNames = Object.fromEntries((cdi3.Parameters ?? []).map((p) => [p.Id, p.Name]));

  const manifest = {
    id: 'deepseek-chan',
    name: 'DeepSeek-chan / 大肥鱼',
    version: 1,
    settings: 'model3.json',
    vtsModelId: vts.ModelID,
    credit: {
      illustration: 'Kamiya Ryoko（神宫凉子）',
      rigging: '霓虹猫_NeonNeko',
      note: '免费配布模型 / Free Live2D model',
    },
    idle: {
      group: 'Idle',
      lostMotion: motionBySrc.get('脱捕.motion3.json')?.id ?? null,
      idleMotion: motionBySrc.get('IDLE.motion3.json')?.id ?? null,
    },
    expressions,
    motions: motionMeta,
    hotkeys,
    paramMap,
    paramNames,
    counts: {
      parameters: cdi3.Parameters?.length ?? 0,
      parts: cdi3.Parts?.length ?? 0,
      hotkeys: hotkeys.length,
      expressions: expressions.length,
      motions: motionMeta.length,
    },
  };
  await writeJson(path.join(MODEL_OUT, 'manifest.json'), manifest);

  await writeJson(path.join(PUBLIC, 'model', 'index.json'), {
    version: 1,
    models: [
      {
        id: manifest.id,
        name: manifest.name,
        dir: 'deepseek-chan',
        manifest: 'deepseek-chan/manifest.json',
        builtin: true,
      },
    ],
  });

  log(
    `model ok: ${expressions.length} expressions / ${motionMeta.length} motions / ${hotkeys.length} hotkeys / ${paramMap.length} param mappings`,
  );
}

/* ------------------------------------------------------------------ */
async function main() {
  await ensureDir(CACHE);
  await ensureDir(PUBLIC);
  await prepareCubismCore();
  await prepareMediaPipe();
  await prepareModel();
  log('done.');
}

main().catch((err) => {
  console.error('[assets] FAILED:', err);
  process.exit(1);
});
