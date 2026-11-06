import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { ExpressionDef, HotkeyDef, ModelManifest, MotionDef, ParamMapping } from '../shared/types';
import { readZip } from './zip';
import { userModelsDir } from './store';

/**
 * 自定义模型导入。
 *
 * 输入：一个 zip（里面可以是 VTube Studio 导出的模型包，也可以就是模型文件夹的压缩包）。
 * 输出：<userData>/models/<id>/ 下一棵**归一化**的资源树 + manifest.json。
 *
 * 归一化的意义：live2dLumiPet 的渲染层只认 manifest.json 与固定的 ASCII 路径
 * （model.moc3 / textures/texture_NN.png / motions/mot-NN.motion3.json ...），
 * 而用户导入的包路径千奇百怪（中文、空格、深层目录）。
 * 全部拍平成 ASCII 之后，app:// 协议、加载顺序、后续换模型都不会出意外。
 *
 * 自动适配：
 *  - 有 VTube Studio 的 .vtube.json → 完全复用它的 Hotkeys 与 ParameterSettings
 *  - 没有 → 用表情/动作自动生成热键，用 Cubism 标准参数表生成追踪映射
 */

const pad = (n: number) => String(n).padStart(2, '0');
const VTS_NAME_RE = /\.vtube\.json$/i;

const log = (...a: unknown[]) => console.log('[import]', ...a);

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

function isUnder(root: string, target: string) {
  const rel = path.relative(root, target);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** 归一化 id：只保留字母数字下划线连字符 */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // 非 ASCII（中文）转成 hash 后缀，保证目录名是纯 ASCII
  const ascii = base.replace(/[^a-z0-9-]/g, '');
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  const suffix = h.toString(36).slice(0, 6);
  const slug = ascii.replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
  return slug ? `${slug}-${suffix}` : `model-${suffix}`;
}

interface FoundModel {
  /** model3.json 在包内的路径（已归一化） */
  jsonPath: string;
  /** model3.json 所在目录（包内，'' 表示根） */
  dir: string;
}

/** 在 zip 条目里找出真正的模型入口 */
function locateModel3(entries: { name: string; isDir: boolean }[]): FoundModel {
  const candidates = entries
    // 兼容两种命名：xxx.model3.json（Cubism 导出）与 model3.json（本程序归一化后的产物）
    .filter((e) => !e.isDir && /model3\.json$/i.test(e.name) && !/\.vtube\.json$/i.test(e.name))
    // 浅的优先（有些包带 example/ 子目录的示例模型）
    .sort((a, b) => a.name.split('/').length - b.name.split('/').length || a.name.length - b.name.length);
  if (!candidates.length) {
    throw new Error('压缩包里没有找到 .model3.json —— 请确认这是 Live2D Cubism 3/4/5 模型');
  }
  const jsonPath = candidates[0].name;
  const dir = jsonPath.includes('/') ? jsonPath.slice(0, jsonPath.lastIndexOf('/')) : '';
  return { jsonPath, dir };
}

/* ------------------------------------------------------------------ */
/* VTS 按键 token → Electron accelerator                                */
/* ------------------------------------------------------------------ */

const VTS_MODIFIER: Record<string, string> = {
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

const VTS_KEY: Record<string, string> = {
  N0: '0', N1: '1', N2: '2', N3: '3', N4: '4',
  N5: '5', N6: '6', N7: '7', N8: '8', N9: '9',
  A: 'A', B: 'B', C: 'C', D: 'D', E: 'E', F: 'F', G: 'G', H: 'H', I: 'I', J: 'J',
  K: 'K', L: 'L', M: 'M', N: 'N', O: 'O', P: 'P', Q: 'Q', R: 'R', S: 'S', T: 'T',
  U: 'U', V: 'V', W: 'W', X: 'X', Y: 'Y', Z: 'Z',
  F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6',
  F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
  // 小键盘：VTS 里很常见（Decimal/NumpadN），Electron 的写法是 num0~num9、numdec…
  Numpad0: 'num0', Numpad1: 'num1', Numpad2: 'num2', Numpad3: 'num3', Numpad4: 'num4',
  Numpad5: 'num5', Numpad6: 'num6', Numpad7: 'num7', Numpad8: 'num8', Numpad9: 'num9',
  Decimal: 'numdec', Add: 'numadd', Subtract: 'numsub', Multiply: 'nummult', Divide: 'numdiv',
  Space: 'Space', Tab: 'Tab', Backspace: 'Backspace', Enter: 'Return', Return: 'Return',
  UpArrow: 'Up', DownArrow: 'Down', LeftArrow: 'Left', RightArrow: 'Right',
  BackQuote: '`', Minus: '-', Equals: '=', Comma: ',', Period: '.', Slash: '/',
  Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\',
};

function vtsTriggersToAccelerator(triggers: Record<string, string> | undefined): string | null {
  if (!triggers) return null;
  const mods: string[] = [];
  let key: string | null = null;
  for (const raw of [triggers.Trigger1, triggers.Trigger2, triggers.Trigger3]) {
    if (!raw) continue;
    if (VTS_MODIFIER[raw]) mods.push(VTS_MODIFIER[raw]);
    else if (VTS_KEY[raw]) key = VTS_KEY[raw];
  }
  if (!key) return null;
  const order = ['Alt', 'Ctrl', 'Shift', 'Super'];
  mods.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return [...mods, key].join('+');
}

/* ------------------------------------------------------------------ */
/* 自动适配：通用参数映射                                              */
/* ------------------------------------------------------------------ */

/**
 * Cubism 标准参数映射表。
 * 没有 VTube Studio 配置的模型，就按 VTS 默认表套一份 —— 覆盖头部角度、眼球、
 * 眨眼、嘴型、眉毛、身体，这些是几乎所有 Live2D 模型都有的标准参数。
 * inXxx/outXxx 的区间与 VTS 默认一致，所以观感和 VTS 里驱动同一模型接近。
 */
function defaultParamMap(c: { outY: number } = { outY: 30 }): ParamMapping[] {
  const m = (
    name: string,
    input: string | null,
    inLower: number,
    inUpper: number,
    outLower: number,
    outUpper: number,
    extra: Partial<ParamMapping> = {},
  ): ParamMapping => ({
    name,
    input,
    output: name,
    inLower,
    inUpper,
    outLower,
    outUpper,
    smoothing: 0,
    blink: false,
    breath: false,
    clampInput: true,
    clampOutput: true,
    ...extra,
  });
  const a = c.outY;
  const body = Math.round(a / 3);
  return [
    m('ParamAngleX', 'FaceAngleX', -30, 30, -a, a),
    m('ParamAngleY', 'FaceAngleY', -30, 30, -a, a),
    m('ParamAngleZ', 'FaceAngleZ', -30, 30, -a, a),
    m('ParamEyeLOpen', 'EyeOpenLeft', 0, 0.8, 0, 1.5, { blink: true }),
    m('ParamEyeROpen', 'EyeOpenRight', 0, 0.8, 0, 1.5, { blink: true }),
    m('ParamEyeBallX', 'EyeRightX', -0.7, 0.7, -1, 1),
    m('ParamEyeBallY', 'EyeRightY', -0.7, 0.7, -1, 1),
    m('ParamMouthOpenY', 'MouthOpen', 0, 1, 0, 1),
    m('ParamMouthForm', 'MouthSmile', 0, 1, 0, 1),
    m('ParamBrowLY', 'Brows', 0, 1, -1, 1),
    m('ParamBrowRY', 'Brows', 0, 1, -1, 1),
    m('ParamBrowLForm', 'BrowInnerUp', 0, 1, -1, 1),
    m('ParamBrowRForm', 'BrowInnerUp', 0, 1, -1, 1),
    m('ParamEyeLSmile', 'mouthSmileL', 0, 1, 0, 1),
    m('ParamEyeRSmile', 'mouthSmileR', 0, 1, 0, 1),
    m('ParamCheek', 'CheekPuff', 0, 1, 0, 1),
    m('ParamBodyAngleX', 'FaceAngleX', -30, 30, -body, body),
    m('ParamBodyAngleY', 'FaceAngleY', -30, 30, -body, body),
    m('ParamBodyAngleZ', 'FaceAngleZ', -30, 30, -body, body),
    m('ParamBreath', null, 0, 1, 0, 1, { breath: true }),
  ];
}

/** 自动热键：表情优先，其次动作，快捷键按常用顺序发 */
const AUTO_ACCEL = [
  'Alt+1', 'Alt+2', 'Alt+3', 'Alt+4', 'Alt+5', 'Alt+6', 'Alt+7', 'Alt+8', 'Alt+9', 'Alt+0',
  'Alt+Q', 'Alt+W', 'Alt+E', 'Alt+R', 'Alt+T', 'Alt+Y', 'Alt+U', 'Alt+I', 'Alt+O', 'Alt+P',
];

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

export interface ImportResult {
  manifest: ModelManifest;
  dir: string;
  warnings: string[];
}

export async function importModelZip(zipPath: string): Promise<ImportResult> {
  const buf = await fsp.readFile(zipPath);
  const entries = readZip(buf);
  if (!entries.length) throw new Error('压缩包是空的');

  const found = locateModel3(entries);
  const rootDir = found.dir;
  const byName = new Map(entries.filter((e) => !e.isDir).map((e) => [e.name, e.data]));

  /** 读包内文件；相对 model3.json 所在目录解析 */
  const readRel = (rel: string): Buffer | null => {
    const clean = rel.replace(/\\/g, '/').replace(/^\.\//, '');
    const full = rootDir ? `${rootDir}/${clean}` : clean;
    const direct = byName.get(full);
    if (direct) return direct;
    // 大小写不敏感兜底（Windows 打的包常见）
    const lower = full.toLowerCase();
    for (const [name, data] of byName) if (name.toLowerCase() === lower) return data;
    return null;
  };
  const readJson = (rel: string) => {
    const b = readRel(rel);
    if (!b) return null;
    try {
      return JSON.parse(b.toString('utf8'));
    } catch {
      return null;
    }
  };

  const model3 = readJson(found.jsonPath.slice(rootDir ? rootDir.length + 1 : 0));
  if (!model3 || !model3.FileReferences) throw new Error('model3.json 结构异常（缺少 FileReferences）');
  const fr = model3.FileReferences;

  const warnings: string[] = [];
  const mocData = fr.Moc ? readRel(fr.Moc) : null;
  if (!mocData) throw new Error(`缺少 moc3 主文件：${fr.Moc ?? '(未声明)'}`);

  // 目录名：用压缩包名（更贴近用户认知），冲突时加后缀
  const zipBase = path.basename(zipPath).replace(/\.zip$/i, '');
  const modelName = String(model3.Name || zipBase);
  let id = slugify(zipBase || modelName);
  const baseDir = path.join(userModelsDir(), id);
  let outDir = baseDir;
  let n = 1;
  while (fs.existsSync(outDir)) outDir = path.join(userModelsDir(), `${id}-${++n}`);
  id = path.basename(outDir);

  await fsp.mkdir(outDir, { recursive: true });

  /* ---- moc3 ---- */
  await fsp.writeFile(path.join(outDir, 'model.moc3'), mocData);

  /* ---- 物理 / 显示信息 ---- */
  let physicsOut: string | null = null;
  if (fr.Physics) {
    const b = readRel(fr.Physics);
    if (b) {
      await fsp.writeFile(path.join(outDir, 'physics3.json'), b);
      physicsOut = 'physics3.json';
    } else warnings.push('声明了物理文件但包里没有，已跳过');
  }
  let display: any = null;
  if (fr.DisplayInfo) {
    const b = readRel(fr.DisplayInfo);
    if (b) {
      await fsp.writeFile(path.join(outDir, 'display.json'), b);
      try {
        display = JSON.parse(b.toString('utf8'));
      } catch {
        /* 忽略 */
      }
    }
  }

  /* ---- 贴图 ---- */
  const textures: string[] = [];
  await fsp.mkdir(path.join(outDir, 'textures'), { recursive: true });
  const texList: string[] = fr.Textures ?? [];
  for (let i = 0; i < texList.length; i++) {
    const b = readRel(texList[i]);
    if (!b) {
      warnings.push(`贴图缺失：${texList[i]}`);
      continue;
    }
    const ext = path.extname(texList[i]).toLowerCase() || '.png';
    const name = `texture_${pad(i)}${ext}`;
    await fsp.writeFile(path.join(outDir, 'textures', name), b);
    textures.push(`textures/${name}`);
  }
  if (!textures.length) throw new Error('一个贴图都没读到，模型无法显示');

  /* ---- 表情 ---- */
  // VTube Studio 的模型大多**不在 model3.json 里声明表情/动作**：
  // 动画文件只是散在 Exp3/ Animation/ 目录里，由 .vtube.json 的热键按路径引用。
  // 所以这里两条路一起走：先用 model3 的声明（能拿到显示名与淡入淡出），
  // 再把目录里没被声明的补上，否则会出现"导入了但一个表情都没有"。
  const relOf = (name: string) => (rootDir ? name.slice(rootDir.length + 1) : name);
  const underRoot = entries.filter((e) => !e.isDir && (!rootDir || e.name.startsWith(rootDir + '/')));
  const expCandidates = new Map<string, { name?: string; fadeIn?: number; fadeOut?: number }>();
  for (const ref of (fr.Expressions ?? []) as { Name?: string; File: string; FadeInTime?: number; FadeOutTime?: number }[]) {
    expCandidates.set(ref.File.replace(/\\/g, '/'), { name: ref.Name, fadeIn: ref.FadeInTime, fadeOut: ref.FadeOutTime });
  }
  for (const e of underRoot) {
    if (!/\.exp3\.json$/i.test(e.name)) continue;
    const rel = relOf(e.name);
    if (!expCandidates.has(rel)) expCandidates.set(rel, {});
  }

  const expressions: ExpressionDef[] = [];
  await fsp.mkdir(path.join(outDir, 'expressions'), { recursive: true });
  let ei = 0;
  for (const [rel, meta] of [...expCandidates.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh'))) {
    const raw = readRel(rel);
    if (!raw) {
      warnings.push(`表情缺失：${rel}`);
      continue;
    }
    let obj: any = {};
    try {
      obj = JSON.parse(raw.toString('utf8'));
    } catch {
      warnings.push(`表情文件损坏：${rel}`);
      continue;
    }
    const label = String(meta.name || obj.Name || path.basename(rel).replace(/\.exp3\.json$/i, ''));
    const idExp = `exp-${pad(ei)}`;
    const file = `expressions/${idExp}.exp3.json`;
    const out = {
      Type: obj.Type ?? 'Live2D Expression',
      Name: label,
      FadeInTime: meta.fadeIn ?? obj.FadeInTime ?? 0.5,
      FadeOutTime: meta.fadeOut ?? obj.FadeOutTime ?? 0.5,
      Parameters: obj.Parameters ?? [],
    };
    await fsp.writeFile(path.join(outDir, file), JSON.stringify(out, null, 2), 'utf8');
    expressions.push({
      id: idExp,
      file,
      label,
      srcName: rel,
      fadeIn: out.FadeInTime,
      fadeOut: out.FadeOutTime,
      paramCount: out.Parameters.length,
    });
    ei++;
  }

  /* ---- 动作 ---- */
  const motionGroups: Record<string, { File: string; FadeInTime?: number; FadeOutTime?: number; Name?: string }[]> =
    fr.Motions ?? {};
  type MotRef = { rel: string; name?: string; fadeIn?: number; fadeOut?: number; idle: boolean };
  const motCandidates = new Map<string, MotRef>();
  for (const [groupName, list] of Object.entries(motionGroups)) {
    const isIdle = /idle|待机|待機/i.test(groupName);
    for (const ref of list ?? []) {
      motCandidates.set(ref.File.replace(/\\/g, '/'), {
        rel: ref.File.replace(/\\/g, '/'),
        name: ref.Name,
        fadeIn: ref.FadeInTime,
        fadeOut: ref.FadeOutTime,
        idle: isIdle,
      });
    }
  }
  for (const e of underRoot) {
    if (!/\.motion3\.json$/i.test(e.name)) continue;
    const rel = relOf(e.name);
    if (motCandidates.has(rel)) continue;
    // 目录名或文件名里带 idle/待机 的算待机循环，其余算一次性动作
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    const base = path.posix.basename(rel);
    motCandidates.set(rel, { rel, idle: /idle|待机|待機/i.test(dir) || /idle|待机|待機/i.test(base) });
  }

  const motions: MotionDef[] = [];
  await fsp.mkdir(path.join(outDir, 'motions'), { recursive: true });
  const outGroups: Record<'Idle' | 'Action', { File: string; FadeInTime: number; FadeOutTime: number; Name: string }[]> = {
    Idle: [],
    Action: [],
  };
  let mi = 0;
  let idleMotionId: string | null = null;
  /** motion id -> 包内原始相对路径，供热键按路径反查 */
  const motionSrcById = new Map<string, string>();
  for (const ref of [...motCandidates.values()].sort((a, b) => a.rel.localeCompare(b.rel, 'zh'))) {
    const raw = readRel(ref.rel);
    if (!raw) {
      warnings.push(`动作缺失：${ref.rel}`);
      continue;
    }
    let obj: any = {};
    try {
      obj = JSON.parse(raw.toString('utf8'));
    } catch {
      warnings.push(`动作文件损坏：${ref.rel}`);
      continue;
    }
    const label = String(ref.name || obj.Name || path.basename(ref.rel).replace(/\.motion3\.json$/i, ''));
    const idMot = `mot-${pad(mi++)}`;
    const file = `motions/${idMot}.motion3.json`;
    const group: 'Idle' | 'Action' = ref.idle ? 'Idle' : 'Action';
    obj.Meta = obj.Meta ?? {};
    // Idle 循环播放；Action 是"状态切换"，只播一次
    obj.Meta.Loop = group === 'Idle';
    obj.Meta.FadeInTime = ref.fadeIn ?? obj.Meta.FadeInTime ?? (group === 'Idle' ? 0.8 : 0.15);
    obj.Meta.FadeOutTime = ref.fadeOut ?? obj.Meta.FadeOutTime ?? (group === 'Idle' ? 0.8 : 0.15);
    obj.Name = label;
    await fsp.writeFile(path.join(outDir, file), JSON.stringify(obj), 'utf8');
    motions.push({
      id: idMot,
      file,
      label,
      group,
      duration: obj.Meta.Duration ?? 0,
      isIdle: group === 'Idle',
      curveCount: obj.Meta.CurveCount ?? 0,
    });
    motionSrcById.set(idMot, ref.rel);
    outGroups[group].push({
      File: file,
      FadeInTime: obj.Meta.FadeInTime,
      FadeOutTime: obj.Meta.FadeOutTime,
      Name: label,
    });
    if (group === 'Idle' && !idleMotionId) idleMotionId = idMot;
  }
  // 一个 Idle 组都没有时，把第一个动作当待机，否则模型会一直僵着
  if (!idleMotionId && motions.length) {
    const first = motions[0];
    first.group = 'Idle';
    first.isIdle = true;
    outGroups.Idle.push(...outGroups.Action.splice(0, 1));
    idleMotionId = first.id;
  }

  /* ---- 归一化 model3.json ---- */
  const settings = {
    Version: 3,
    FileReferences: {
      Moc: 'model.moc3',
      Textures: textures,
      ...(physicsOut ? { Physics: physicsOut } : {}),
      ...(display ? { DisplayInfo: 'display.json' } : {}),
      Motions: outGroups,
      Expressions: expressions.map((e) => ({
        Name: e.label,
        File: e.file,
        FadeInTime: e.fadeIn,
        FadeOutTime: e.fadeOut,
      })),
    },
    Groups: model3.Groups ?? [],
  };
  await fsp.writeFile(path.join(outDir, 'model3.json'), JSON.stringify(settings, null, 2), 'utf8');

  /* ---- VTube Studio 配置（可选） ---- */
  let vts: any = null;
  const vtsEntry = entries.find((e) => !e.isDir && VTS_NAME_RE.test(e.name));
  if (vtsEntry) {
    const data = byName.get(vtsEntry.name);
    if (data) {
      try {
        // 原样留一份到模型目录：以后重新导入 / 核对热键都还拿得到原始对应关系
        await fsp.writeFile(path.join(outDir, 'vtube.json'), data);
        vts = JSON.parse(data.toString('utf8'));
      } catch {
        warnings.push('检测到 .vtube.json 但解析失败，改用自动适配');
      }
    }
  }

  /* ---- 热键 ---- */
  const hotkeys: HotkeyDef[] = [];
  // 热键里的 File 是相对模型根的原始路径；同时用 basename 兜底，
  // 因为有些包的 .vtube.json 写的是绝对/带子目录的老路径
  const expBySrc = new Map(expressions.map((e) => [e.srcName.replace(/\\/g, '/').toLowerCase(), e]));
  const expByBase = new Map(expressions.map((e) => [path.posix.basename(e.srcName).toLowerCase(), e]));
  const motBySrc = new Map<string, MotionDef>();
  const motByBase = new Map<string, MotionDef>();
  {
    const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase();
    for (const m of motions) {
      const src = motionSrcById.get(m.id);
      if (!src) continue;
      motBySrc.set(norm(src), m);
      motByBase.set(path.posix.basename(src).toLowerCase(), m);
    }
  }
  if (vts?.Hotkeys?.length) {
    let idx = 0;
    for (const hk of vts.Hotkeys) {
      const triggers = hk.Triggers ?? {};
      const accelerator = vtsTriggersToAccelerator(triggers);
      const kind: HotkeyDef['kind'] =
        hk.Action === 'ToggleExpression'
          ? 'expression'
          : hk.Action === 'TriggerAnimation'
            ? 'motion'
            : 'clear-expressions';
      let asset: string | null = null;
      let assetId: string | null = null;
      let label: string = hk.Name;
      let duration = 0;
      if (kind === 'expression') {
        const key = String(hk.File ?? '').replace(/\\/g, '/');
        const exp = expBySrc.get(key) ?? expByBase.get(path.posix.basename(key).toLowerCase());
        if (!exp) {
          warnings.push(`热键「${hk.Name}」引用的表情不在包内，已跳过`);
          continue;
        }
        asset = exp.file;
        assetId = exp.id;
        label = exp.label;
      } else if (kind === 'motion') {
        const key = String(hk.File ?? '').replace(/\\/g, '/');
        const mot = motions.find((m) => m.file === key) ?? motByBase.get(path.posix.basename(key).toLowerCase());
        if (!mot) {
          warnings.push(`热键「${hk.Name}」引用的动作不在包内，已跳过`);
          continue;
        }
        asset = mot.file;
        assetId = mot.id;
        label = mot.label;
        duration = mot.duration;
      }
      hotkeys.push({
        id: `hk-${pad(idx++)}`,
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
      } as unknown as HotkeyDef);
    }
  }

  // 没有 VTS 配置（或者 VTS 里没有热键）→ 自动生成
  if (!hotkeys.length) {
    let ai = 0;
    for (const exp of expressions) {
      if (ai >= AUTO_ACCEL.length) break;
      hotkeys.push({
        id: `hk-${pad(ai)}`,
        name: exp.label,
        label: exp.label,
        kind: 'expression',
        asset: exp.file,
        assetId: exp.id,
        duration: 0,
        vtsName: exp.label,
        vtsAction: 'ToggleExpression',
        vtsTriggers: { t1: '', t2: '', t3: '' },
        defaultAccelerator: AUTO_ACCEL[ai],
      } as unknown as HotkeyDef);
      ai++;
    }
    if (!expressions.length) {
      for (const mot of motions.filter((m) => m.group === 'Action')) {
        if (ai >= AUTO_ACCEL.length) break;
        hotkeys.push({
          id: `hk-${pad(ai)}`,
          name: mot.label,
          label: mot.label,
          kind: 'motion',
          asset: mot.file,
          assetId: mot.id,
          duration: mot.duration,
          vtsName: mot.label,
          vtsAction: 'TriggerAnimation',
          vtsTriggers: { t1: '', t2: '', t3: '' },
          defaultAccelerator: AUTO_ACCEL[ai],
        } as unknown as HotkeyDef);
        ai++;
      }
    }
    if (expressions.length && ai < AUTO_ACCEL.length) {
      hotkeys.push({
        id: `hk-${pad(ai)}`,
        name: '清除表情',
        label: '清除表情',
        kind: 'clear-expressions',
        asset: null,
        assetId: null,
        duration: 0,
        vtsName: '清除表情',
        vtsAction: 'ClearExpressions',
        vtsTriggers: { t1: '', t2: '', t3: '' },
        defaultAccelerator: AUTO_ACCEL[ai],
      } as unknown as HotkeyDef);
    }
  }

  /* ---- 参数映射 ---- */
  const paramNames: Record<string, string> = Object.fromEntries(
    (display?.Parameters ?? []).map((p: any) => [p.Id, p.Name]),
  );
  const live2dParams = new Set<string>((display?.Parameters ?? []).map((p: any) => p.Id));
  let paramMap: ParamMapping[];
  let mapSource: string;
  if (vts?.ParameterSettings?.length) {
    paramMap = vts.ParameterSettings.filter((p: any) => p.OutputLive2D).map((p: any) => ({
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
    mapSource = 'VTube Studio 参数表';
  } else {
    const all = defaultParamMap();
    // display.json 里能读到参数表就按实际参数过滤，避免映射到不存在的参数
    paramMap = live2dParams.size ? all.filter((m) => live2dParams.has(m.output)) : all;
    mapSource = live2dParams.size ? 'Cubism 标准参数（按模型实际参数过滤）' : 'Cubism 标准参数';
  }
  if (!paramMap.length) {
    paramMap = defaultParamMap();
    warnings.push('没有读到参数表，已使用默认参数映射');
  }

  /* ---- manifest ---- */
  const manifest: ModelManifest = {
    id,
    name: modelName,
    version: 1,
    settings: 'model3.json',
    vtsModelId: vts?.ModelID,
    credit: {
      illustration: '（导入模型，未提供）',
      rigging: '（导入模型，未提供）',
      note: `导入自 ${path.basename(zipPath)}`,
    },
    idle: {
      group: 'Idle',
      // 丢帧/离开摄像头时播放的动画。这类模型通常命名为「脱捕」，
      // 没有的话回落 null（只是不播这个过渡，不影响其他功能）。
      lostMotion: motions.find((m) => /脱捕|lost/i.test(m.label))?.id ?? null,
      idleMotion: idleMotionId,
    },
    expressions,
    motions,
    hotkeys,
    paramMap,
    paramNames,
    counts: {
      parameters: live2dParams.size,
      hotkeys: hotkeys.length,
      expressions: expressions.length,
      motions: motions.length,
    },
  };
  await fsp.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  log(
    `${modelName} → ${id}: ${expressions.length} 表情 / ${motions.length} 动作 / ${hotkeys.length} 热键 / ${paramMap.length} 参数映射（${mapSource}）`,
  );
  return { manifest, dir: outDir, warnings };
}

/** 删除一个用户模型目录（内置模型不可删） */
export async function deleteModel(id: string) {
  const dir = path.join(userModelsDir(), id);
  const root = userModelsDir();
  if (!isUnder(root, dir)) throw new Error('非法的模型 id');
  if (!fs.existsSync(dir)) throw new Error('模型不存在');
  await fsp.rm(dir, { recursive: true, force: true });
}
