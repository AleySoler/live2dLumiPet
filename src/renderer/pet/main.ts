import type { ActionRequest, AppConfig, BootInfo, ModelManifest, RuntimeState } from '../../shared/types';
import { clamp } from '../../shared/config';
import { loadCubismCore, Stage } from './Stage';
import { emptyFrame, ExpressionMixer, TrackingLayer, type FaceFrame } from './params';
import type { FaceTracker } from './FaceTracker';

const query = new URLSearchParams(location.search);
const SMOKE = query.has('smoke');
/** 只加载模型、不写任何参数：用于把"我们的驱动"与"模型/库基线"分开排查 */
const RAW = query.has('raw');

const api = window.petAPI;

let boot: BootInfo;
let manifest: ModelManifest;
let cfg: AppConfig;
let stage: Stage;
let model: any = null;
let core: any = null;
/** 模型自带的 physics 实例（会被包一层 dt 上限），关闭物理时置空 internalModel.physics */
let physicsRef: any = null;
/** 已经应用过的蒙版分辨率，避免重复重建蒙版管理器 */
let appliedMaskSize = 0;
let tracking: TrackingLayer;
let mixer: ExpressionMixer | null = null;
let tracker: FaceTracker | null = null;

let lastFace: FaceFrame | null = null;
/** 本帧真正喂给参数层的数据（可能是摄像头帧，也可能是鼠标合成帧） */
let lastAppliedFrame: FaceFrame | null = null;
/** 当前动作驱动的参数（追踪层要跳过它们） */
const motionLock = new Set<string>();
const motionParamCache = new Map<string, Set<string>>();
/** 动作锁的超时兜底（motionFinish 可能不触发） */
let motionLockTimer: ReturnType<typeof setTimeout> | null = null;
let faceAt = 0;
let trackingActive = false;
let trackingError: string | null = null;
let frameDt = 1 / 60;
const cursor = { x: 0, y: 0, inside: false, sw: 0, sh: 0 };
let ignoringMouse = true;
let probe: { x: number; y: number } | null = null;
let dragging = false;
let dragStart = { x: 0, y: 0 };let currentMotion: string | null = null;
let lostMotionFired = false;
let loadError: string | null = null;
let fps = 0;
let previewOn = false;
let previewCanvas: HTMLCanvasElement | null = null;
let lastPreviewAt = 0;
/** 需要隐藏的 drawable 序号（模型自带的冗余零件补丁） */
const hiddenDrawables = new Set<number>();
/**
 * 这两个 ArtMesh 是模型鼻子位置的两个占位网格：
 * 它们的 UV 采样出来的是一片纯黑，于是脸上会落下一个约 20px 的黑色圆角方块。
 * 逐层隐藏验证过：只隐藏这两个，该处就变回干净的皮肤色（252,214,213）。
 */
const NOSE_PLACEHOLDER_IDS = ['ArtMesh682', 'ArtMesh246'];
/**
 * 模型自带的边缘反光（rim light）网格。
 * 注意：模型里还有 ArtMesh668/670/675/678_Skinning 四个同样带 "_Skinning" 后缀的 part，
 * 但它们是正常的身体图层（尾巴本体、裙摆等），实测一起隐藏会把整条尾巴删掉，
 * 所以这里只收名字明确为「边缘反光」的那一个。
 */
const EDGE_GLOW_PART_IDS = ['ArtMesh669_Skinning'];
/** 眼球/眼白 part，用来算双眼中心 */
const EYE_PART_IDS = ['Part43', 'Part35', 'Part140', 'Part145', 'Part49', 'Part36', 'Part141', 'Part146'];
/** 边缘反光的 drawable 序号 */
const glowDrawables: number[] = [];
let glowPartNames = '';

const motionIndex = new Map<string, { group: string; index: number }>();
const motionLabel = new Map<string, string>();
/**
 * 注意：下面这些状态必须全部声明在顶层 await 之前。
 * 模块里的顶层 await 会让"后面才声明的 let/const"在 loadModel() 执行时处于 TDZ，
 * 一旦在函数里被访问就会抛 "Cannot access 'xxx' before initialization"。
 */
let lastPatchKey = '';
/** 拖动期间收到的 resize 先记下来，松手后再补做（避免边拖边缩放） */
let needRefit = false;
let lastDpr = window.devicePixelRatio;
let testImageResolve: ((d: string) => void) | null = null;
const testImagePromise = new Promise<string | null>((res) => {
  testImageResolve = res;
  setTimeout(() => res(null), 20000);
});

/* ------------------------------------------------------------------ */
/* DOM                                                                 */
/* ------------------------------------------------------------------ */
const stageEl = document.getElementById('stage') as HTMLDivElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const statusEl = document.getElementById('status') as HTMLDivElement;

function setStatus(text: string, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.color = isError ? '#ff8181' : '#e6f0ff';
  statusEl.style.opacity = text ? '1' : '0';
}
function setError(err: string) {
  loadError = err;
  console.error('[pet]', err);
  setStatus('模型加载失败：' + err, true);
}

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */
boot = await api.boot('pet');
manifest = boot.manifest;
cfg = boot.config;

buildMotionIndex();

setStatus('加载 Cubism Core…');
try {
  await loadCubismCore();
} catch (err) {
  setError(String(err));
  throw err;
}

stage = new Stage({ container: stageEl, onError: (e) => setError(e), resolution: cfg.misc.renderScale ?? 1 });

/** 当前是否应该渲染模型：没有任何模型、或用户在「模型」页关掉了它，都算未启用 */
function shouldLoadModel() {
  return !!boot?.hasModel && cfg.misc.modelEnabled !== false;
}

if (!boot.hasModel) {
  // 无模型模式：不加载、不报错，窗口保持全透明，控制台照常可用
  setStatus('');
  console.log('[pet] 无模型模式');
} else if (!shouldLoadModel()) {
  setStatus('');
  console.log('[pet] 模型已关闭（设置里未启用）');
} else {
  try {
    await loadModel();
  } catch (err) {
    setError(String(err));
  }
}

/** 卸载模型：销毁 PIXI 对象并清空舞台（不是隐藏窗口） */
function unloadModel() {
  try {
    stage?.model?.destroy();
  } catch {
    /* ignore */
  }
  stage?.clearModel?.();
  model = null;
  core = null;
  physicsRef = null;
  mixer = null;
  setStatus('');
  refreshHud();
}

async function loadModel() {
  setStatus('加载模型…');
  const url = boot.modelBase + manifest.settings;
  model = await stage.load(url, { motionPreload: 'ALL' });
  const im = model.internalModel as any;
  core = im.coreModel;
  physicsRef = null; // 重新加载时旧的 physics 实例已经失效
  motionLock.clear();
  tracking = new TrackingLayer(cfg.params);
  mixer = new ExpressionMixer(() => refreshHud());
  mixer?.setBase(boot.modelBase);
  mixer.attach(core);
  mixer?.setFadeScale(cfg.misc.fadeScale ?? 1);
  void mixer?.preload(manifest.expressions);

  // 我们自己接管眨眼与追踪，关掉 SDK 内置的那套，避免相互覆盖
  im.eyeBlink = undefined;
  if (!RAW) im.on('afterMotionUpdate', onAfterMotionUpdate);

  // draw 阶段（update 之后）改 drawable 不透明度：既用于隐藏多余零件，也用于调节边缘反光强度
  const origDraw = im.draw.bind(im);
  im.draw = (gl: any) => {
    const ops = (core as any).getModel?.()?.drawables?.opacities ?? (core as any)._model?.drawables?.opacities;
    if (ops) {
      for (const idx of hiddenDrawables) ops[idx] = 0;
      if (cfg.misc.hideEdgeGlow && glowDrawables.length) {
        for (const idx of glowDrawables) ops[idx] = 0;
      } else {
        const k = cfg.misc.edgeGlow ?? 1;
        if (k < 0.999 && glowDrawables.length) {
          for (const idx of glowDrawables) ops[idx] = ops[idx] * k;
        }
      }
    }
    return origDraw(gl);
  };
  im.motionManager.on('motionStart', (group: string, index: number) => {
    currentMotion = `${group}#${index}`;
    for (const [id, loc] of motionIndex) {
      if (loc.group === group && loc.index === index) {
        currentMotion = motionLabel.get(id) ?? currentMotion;
        break;
      }
    }
    if (group === 'Action') lostMotionFired = false;
    void lockMotionParams(group, index);
  });
  im.motionManager.on('motionFinish', () => {
    currentMotion = null;
    motionLock.clear();
  });

  stage.fit(cfg.pet.scale);
  applyMaskResolution();
  applyModelPatches();
  setupPhysics();
  // 视觉回归用：冻结待机动作与眨眼，两次截图姿态完全一致才好对比
  if (query.has('freeze')) {
    try {
      im.motionManager.stopAllMotions();
      if (im.motionManager.groups) delete im.motionManager.groups.idle;
    } catch {
      /* ignore */
    }
    cfg = { ...cfg, misc: { ...cfg.misc, cursorLook: false, autoBlink: false } };
  }
  stage.onFrame = (dt, now) => {
    frameDt = dt;
    fps = stage.fps;
    // 关键：每帧推进一次人脸推理（内部自带限频），否则 lastFrame 永远是空的
    if (trackingActive && tracker) tracker.detect(now);
  };
  stage.onAfterRender(drainProbe);
  stage.start();
  setStatus('');
  refreshHud();
  if (SMOKE) void runSmoke();
  if (query.has('dump')) dumpParams();
  if (query.has('glowmap')) dumpGlowMap();
  if (query.has('shadowdiag')) void shadowDiag();
  if (query.has('lean')) void applyLeanOnly();
  if (query.has('motionsanity')) void motionSanity();

  if (query.has('pick')) void pickDiag();
  return model;
}

/** 诊断：?pick=x,y — 找出覆盖该像素的 part 及其颜色（配合 ?lean 看前倾时的阴影） */
async function pickDiag() {
  await new Promise((r) => setTimeout(r, 1400));
  if (query.has('lean')) {
    const lean = manifest.expressions.find((e) => e.label.includes('前倾'));
    if (lean) await mixer?.set(lean.id, true);
    await new Promise((r) => setTimeout(r, 1200));
  }
  const raw = (query.get('pick') ?? '').split(',');
  const x = Number(raw[0] ?? 0);
  const y = Number(raw[1] ?? 0);
  const res = await findCulpritPart(x, y);
  console.log('PICK ' + JSON.stringify({ x, y, res }));
}

/** 诊断：逐个播放 Action 动作，结束后检查 motionLock 是否清空（防止追踪被永久锁死） */
async function motionSanity() {
  await new Promise((r) => setTimeout(r, 1500));
  const acts = manifest.motions.filter((m) => m.group === 'Action');
  const rows: any[] = [];
  for (let i = 0; i < acts.length; i++) {
    const im = model.internalModel as any;
    im.motionManager.startMotion('Action', i);
    await new Promise((r) => setTimeout(r, 300));
    const during = motionLock.size;
    await new Promise((r) => setTimeout(r, 1800));
    im.motionManager.stopAllMotions();
    await new Promise((r) => setTimeout(r, 300));
    rows.push({ motion: acts[i].label, lockDuring: during, lockAfter: motionLock.size });
  }
  console.log('MOTION_SANITY ' + JSON.stringify(rows));
}

/** 只保留「前倾」这一个表情，用于 A/B 对比阴影 */
async function applyLeanOnly() {
  await new Promise((r) => setTimeout(r, 1200));
  const lean = manifest.expressions.find((e) => e.label.includes('前倾'));
  if (lean) await mixer?.set(lean.id, true);
}

/**
 * 动作开始播放时，把该动作驱动的参数登记进 motionLock。
 *
 * 不这么做的话，追踪层每帧都会写 ParamAngleX/Y/Z、ParamBodyAngle*、眨眼这些参数，
 * 把动作的输出当场覆盖掉 —— 观感上就是"动作错乱"或"按了没反应"。
 * 内置模型之所以没这问题，是因为它的追踪写的是作者自建的 OX/OY/OZ，
 * 而 VTS 参数表直接映射到 ParamAngleX 的模型就会正面冲突。
 */
async function lockMotionParams(group: string, index: number) {
  // 待机动作是常驻循环，锁住它等于永久屏蔽追踪 —— 它本来就该和追踪共存
  if (group === 'Idle') {
    motionLock.clear();
    return;
  }
  // 先清空：上一支动作的锁不能带进下一支（中断/不触发 finish 时会残留）
  motionLock.clear();
  if (motionLockTimer) {
    clearTimeout(motionLockTimer);
    motionLockTimer = null;
  }
  try {
    const list = manifest.motions.filter((m) => m.group === group);
    const m = list[index];
    if (!m) return;
    let ids = motionParamCache.get(m.file);
    if (!ids) {
      const obj = await fetch(boot.modelBase + m.file).then((r) => r.json());
      ids = new Set<string>();
      for (const c of obj?.Curves ?? []) {
        if (c?.Target === 'Parameter' && typeof c.Id === 'string') ids.add(c.Id);
      }
      motionParamCache.set(m.file, ids);
    }
    for (const id of ids) motionLock.add(id);
    // 兜底：即使 motionFinish 没触发（被新动作打断 / stopAll），锁也会到期释放
    const ttl = Math.max(500, (m.duration || 2) * 1000 + 800);
    motionLockTimer = setTimeout(() => {
      motionLock.clear();
      motionLockTimer = null;
    }, ttl);
  } catch (err) {
    console.warn('[pet] 读取动作参数失败', err);
    motionLock.clear();
  }
}

/**
 * 诊断：看看「前倾」时下巴阴影到底是哪几个网格、混合模式和不透明度是多少。
 * 用法：electron . --smoke --dump 时附带 ?shadowdiag=1（见 smoke.ts 的 dump 分支）
 */
async function shadowDiag() {
  try {
    const lean = manifest.expressions.find((e) => e.label.includes('前倾'));
    if (lean) await mixer?.set(lean.id, true);
    await new Promise((r) => setTimeout(r, 1200));
    const parts = ['Part8', 'Part109'];
    const dump = parts.map((p) => ({ part: p, info: inspectPart(p) }));
    // 再顺带记录这两个 part 下每个网格的当前世界 Y（用来区分下巴/腰部）
    console.log('SHADOW_DIAG ' + JSON.stringify(dump));
  } catch (err) {
    console.log('SHADOW_DIAG_ERR ' + String(err));
  }
}

/** 回归：表情对参数的语义（默认值基线 / 互斥档位 / 关闭回默认） */
async function checkExpressionSemantics() {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const read = (id: string) => Number(core.getParameterValueById(id).toFixed(3));
  const byLabel = (label: string) => manifest.expressions.find((e) => e.label === label);
  const steps: any[] = [];
  const rec = (name: string, ok: boolean, extra: any) => steps.push({ name, ok, ...extra });

  // 1. 无表情时，模型默认值必须原样保留
  const base = { Clothes1: read('Clothes1'), Clothes5: read('Clothes5'), Clothes2: read('Clothes2') };
  rec('defaults-untouched', base.Clothes1 === 1 && base.Clothes5 === 1, base);

  // 2. 体型互斥档位：体型1 -> 默认体型 -> 关闭默认体型
  const t1 = byLabel('体型1');
  const t0 = byLabel('默认体型');
  // 表情默认过渡 0.5s，断言等待必须盖过它（+ 余量）
  const WAIT = 700;
  if (t1 && t0) {
    await mixer?.set(t1.id, true);
    await sleep(WAIT);
    const v1 = read('Clothes2');
    await mixer?.set(t0.id, true);
    await sleep(WAIT);
    const v0 = read('Clothes2');
    await mixer?.set(t0.id, false);
    await sleep(WAIT);
    const back = read('Clothes2');
    rec('body-radio', Math.abs(v1 - 0.4) < 0.06 && Math.abs(v0) < 0.06 && Math.abs(back - 0.4) < 0.06, { v1, v0, back });
    await mixer?.set(t1.id, false);
    await sleep(WAIT);
  } else {
    rec('body-radio', false, { error: '体型1/默认体型 表情缺失' });
  }

  // 3. 裙子 / 尾巴：默认 1，切一次变 0，关掉回 1
  const skirt = byLabel('裙子切换');
  const tail = byLabel('尾巴开关');
  const skirtTest = async (exp: typeof skirt, param: string) => {
    if (!exp) return { ok: false, error: '缺少表情' };
    const d0 = read(param);
    await mixer?.set(exp.id, true);
    await sleep(WAIT);
    const d1 = read(param);
    await mixer?.set(exp.id, false);
    await sleep(WAIT);
    const d2 = read(param);
    return { ok: Math.abs(d0 - 1) < 0.06 && Math.abs(d1) < 0.06 && Math.abs(d2 - 1) < 0.06, d0, d1, d2 };
  };
  const s1 = await skirtTest(skirt, 'Clothes1');
  rec('skirt-toggle', s1.ok, s1);
  const s2 = await skirtTest(tail, 'Clothes5');
  rec('tail-toggle', s2.ok, s2);

  // 4. 动作写过的参数不能被表情层清掉（Movement3 归动作/表情共同所有）
  if (t1) {
    await mixer?.set(t1.id, true);
    await sleep(WAIT);
  }
  const m3 = read('Movement3');
  await mixer?.clear();
  await sleep(WAIT);
  rec('no-param-fighting', m3 === 0, { Movement3: m3 });

  // 5. 过渡时长：0.5s 的淡入，120ms 时权重不该已经到 1（防止"换裙子太快"回归）
  const fadeExp = byLabel('裙子切换') ?? manifest.expressions[0];
  if (fadeExp) {
    await mixer?.set(fadeExp.id, true);
    await sleep(130);
    const w130 = mixer?.debugWeight(fadeExp.id) ?? 0;
    await sleep(700);
    const wDone = mixer?.debugWeight(fadeExp.id) ?? 0;
    await mixer?.set(fadeExp.id, false);
    await sleep(700);
    rec('fade-duration', w130 < 0.7 && wDone > 0.98, { w130: Number(w130.toFixed(2)), wDone: Number(wDone.toFixed(2)) });
  }

  return { ok: steps.every((s) => s.ok), steps };
}

/**
 * 物理演算：
 *  - 单帧 dt 上限 1/30s。Live2D 物理是按固定步长设计的，掉帧时 dt 变大会让尾巴/裙摆
 *    过冲甚至"穿帮"（用户看到的"尾巴根部时不时冒出蓝色"很可能就是这个）。
 *  - 允许整体关闭物理，用来排查是物理问题还是模型本身。
 */
function setupPhysics() {
  try {
    const im = model.internalModel as any;
    if (!physicsRef && im.physics) {
      physicsRef = im.physics;
      const orig = physicsRef.evaluate.bind(physicsRef);
      physicsRef.evaluate = (m: any, dt: number) => orig(m, Math.min(dt, 1 / 30));
    }
    if (!physicsRef) return;
    im.physics = cfg.misc.physics === false ? undefined : physicsRef;
  } catch (err) {
    console.warn('[pet] 物理设置失败', err);
  }
}

/**
 * 裁剪蒙版分辨率。
 * Cubism 默认把整张蒙版渲染到 256×256 的纹理里，再用它裁各图层；
 * 本模型画布 3749×7697，256 的蒙版一个像素摊到屏幕约 2px —— 被裁剪的光效层
 * 边缘就会呈现明显的阶梯块（"光效形状没处理好"的观感来源）。
 *
 * 注意：`setClippingMaskBufferSize` 会 release 并重建裁剪管理器，
 * **只能在模型加载完成后、首帧渲染之前调用一次**；运行中再调会把渲染器搞崩，
 * 所以它不挂在配置回调上，改值后需要「重新加载模型」。
 */
function applyMaskResolution() {
  try {
    const im = model.internalModel as any;
    const r = im.renderer;
    if (!r?.setClippingMaskBufferSize) return;
    const size = Math.min(4096, Math.max(256, Math.round(cfg.misc.maskResolution || 256)));
    /**
     * 判断依据必须以渲染器当前值为准。
     * 之前这里还比对了一个 appliedMaskSize 缓存，结果"重新加载模型"之后
     * 渲染器是全新的（内部值回到 256），缓存却还停在 2048 → 直接 early-return，
     * 蒙版永远停在 256。缓存只在拿不到 getter 时作为退路。
     */
    const hasGetter = typeof r.getClippingMaskBufferSize === 'function';
    const cur = hasGetter ? r.getClippingMaskBufferSize() : appliedMaskSize;
    if (size === cur) {
      appliedMaskSize = size;
      return;
    }
    r.setClippingMaskBufferSize(size);
    appliedMaskSize = size;
    console.log('[pet] 裁剪蒙版分辨率 →', size);
  } catch (err) {
    console.warn('[pet] 设置蒙版分辨率失败', err);
  }
}

/** 应用模型补丁：按 id 隐藏多余零件 / 收集边缘反光网格 */
function applyModelPatches() {
  // 配置每次变化都会回调，这里做个去重，避免重复扫描 715 个 drawable
  const key = `${cfg.misc.hideNosePlaceholder}|${cfg.misc.hideEdgeGlow}|${cfg.misc.edgeGlow}`;
  if (key === lastPatchKey && glowDrawables.length) return;
  lastPatchKey = key;
  hiddenDrawables.clear();
  try {
    const cm = core as any;
    if (cfg.misc.hideNosePlaceholder !== false) {
      for (const id of NOSE_PLACEHOLDER_IDS) {
        const idx = cm.getDrawableIndex?.(id);
        if (typeof idx === 'number' && idx >= 0) hiddenDrawables.add(idx);
      }
    }
    // 收集所有 "蒙皮" 光效 part 下的 drawable（模型里叫 xxx_Skinning，其中
    // ArtMesh669_Skinning 的名字就是「边缘反光」）。这些层是贴在轮廓外的柔光，
    // 模型自身的形状没做干净，所以给一个统一开关 + 强度。
    glowDrawables.length = 0;
    const parent: ArrayLike<number> | undefined =
      cm._model?.drawables?.parentPartIndices ?? cm.getModel?.()?.drawables?.parentPartIndices;
    const partIds: string[] = cm._partIds ?? [];
    if (parent) {
      const glowParts = new Set<number>();
      for (const pid of EDGE_GLOW_PART_IDS) {
        const idx = partIds.indexOf(pid);
        if (idx >= 0) glowParts.add(idx);
      }
      for (let i = 0; i < parent.length; i++) if (glowParts.has(parent[i])) glowDrawables.push(i);
      glowPartNames = [...glowParts].map((i) => partIds[i]).join(',');
    }
    console.log(
      `[pet] 补丁: 隐藏鼻子=${[...hiddenDrawables].join(',')} 光效零件=${glowPartNames} 共 ${glowDrawables.length} 个网格`,
    );
  } catch (err) {
    console.warn('[pet] 模型补丁失败', err);
  }
}

/**
 * 双眼中心（窗口内 CSS 坐标）。
 * 用模型自己的"眼球"part 包围盒算，这样无论窗口缩放、模型平移都准确；
 * 拿不到时退回"模型宽度中点 + 21.5% 高度"（本模型实测的眼睛位置）。
 */
function eyeCenterScreen(): { x: number; y: number } {
  const im = model.internalModel as any;
  const cm = im.coreModel;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let found = false;
  try {
    const parent: ArrayLike<number> | undefined =
      cm._model?.drawables?.parentPartIndices ?? cm.getModel?.()?.drawables?.parentPartIndices;
    if (parent) {
      for (const pid of EYE_PART_IDS) {
        const pi = cm.getPartIndex?.(pid);
        if (typeof pi !== 'number' || pi < 0) continue;
        for (let i = 0; i < parent.length; i++) {
          if (parent[i] !== pi) continue;
          if (cm.getDrawableOpacity(i) < 0.25) continue;
          const v = im.getDrawableVertices(i);
          for (let k = 0; k < v.length; k += 2) {
            if (v[k] < minX) minX = v[k];
            if (v[k] > maxX) maxX = v[k];
            if (v[k + 1] < minY) minY = v[k + 1];
            if (v[k + 1] > maxY) maxY = v[k + 1];
          }
          found = true;
        }
      }
    }
  } catch {
    /* 退化到默认值 */
  }
  const p = found && isFinite(minX)
    ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
    : { x: im.width * 0.5, y: im.height * 0.215 };
  im.localTransform.apply(p, p);
  model.transform.worldTransform.apply(p, p);
  return p;
}

/** 诊断：导出所有 drawable 的混合模式/所属 part，用来定位光效层 */
function dumpGlowMap() {
  try {
    const im = model.internalModel as any;
    const cm = im.coreModel;
    const native = cm._model ?? cm.getModel?.();
    const parent: ArrayLike<number> = native.drawables.parentPartIndices;
    const partIds: string[] = cm._partIds ?? [];
    const rows: any[] = [];
    for (let i = 0; i < cm.getDrawableCount(); i++) {
      const blend = cm.getDrawableBlendMode(i);
      const op = cm.getDrawableOpacity(i);
      if (blend === 0 && op < 0.01) continue;
      rows.push({
        i,
        id: cm.getDrawableId(i),
        blend,
        op: Number(op.toFixed(2)),
        part: partIds[parent[i]] ?? '',
      });
    }
    console.log('GLOWMAP ' + JSON.stringify(rows));
  } catch (err) {
    console.log('GLOWMAP_ERR ' + String(err));
  }
}

/** 诊断：导出开关类参数的定义范围与当前值 */
function dumpParams() {
  try {
    const im = model.internalModel as any;
    const cm = im.coreModel;
    const n = cm.getParameterCount();
    const rows: any[] = [];
    const re = /^(Clothes|Movement|key|Lean|Emotion|IDLE|Angle|Position|Param2$|Param34|Param$|ParamSilent)/;
    for (let i = 0; i < n; i++) {
      const id: string = cm._parameterIds?.[i] ?? '';
      if (!re.test(id)) continue;
      rows.push({
        id,
        min: Number(cm.getParameterMinimumValue(i).toFixed(3)),
        max: Number(cm.getParameterMaximumValue(i).toFixed(3)),
        def: Number(cm.getParameterDefaultValue(i).toFixed(3)),
        cur: Number(cm.getParameterValueByIndex(i).toFixed(3)),
      });
    }
    console.log('PARAM_DUMP ' + JSON.stringify(rows));
  } catch (err) {
    console.log('PARAM_DUMP_ERR ' + String(err));
  }
}

function buildMotionIndex() {
  const counters: Record<string, number> = { Idle: 0, Action: 0 };
  for (const m of manifest.motions) {
    const idx = counters[m.group] ?? 0;
    motionIndex.set(m.id, { group: m.group, index: idx });
    motionLabel.set(m.id, m.label);
    counters[m.group] = idx + 1;
  }
}

/* ------------------------------------------------------------------ */
/* 每帧参数层（在动作之后、物理之前）                                    */
/* ------------------------------------------------------------------ */
function onAfterMotionUpdate() {
  if (!core) return;
  const frame = pickFrame();
  lastAppliedFrame = frame;
  tracking.apply(core, frame, frameDt, cfg.tracking, cfg.misc.autoBlink, motionLock);
  mixer?.update(core, frameDt);
}

function pickFrame(): FaceFrame | null {
  const now = performance.now();
  if (cfg.tracking.enabled) {
    const f = tracker?.lastFrame;
    if (f && f.found) {
      lastFace = f;
      faceAt = now;
      lostMotionFired = false;
      return f;
    }
    // 短暂丢失：沿用上一帧避免抖动
    if (lastFace && now - faceAt < Math.max(200, cfg.tracking.lostTimeoutMs)) {
      return lastFace;
    }
    if (!lostMotionFired && cfg.misc.lostIdleMotion && lastFace) {
      lostMotionFired = true;
      const lost = manifest.idle.lostMotion;
      if (lost) void playMotion(lost);
    }
    // 摄像头模式下一律不回落到鼠标注视，否则会出现"开着捕捉模型还跟着鼠标"
    return null;
  }
  if (cfg.misc.cursorLook) return cursorFrame();
  return null;
}

function cursorFrame(): FaceFrame {
  const f = emptyFrame();
  f.found = true;
  f.synthetic = true;
  /**
   * 枢轴 = 模型双眼中心（不是屏幕中心）。
   * 这样"鼠标在哪儿，模型就往哪儿看"才对得上；而除数仍然是半个屏幕，
   * 所以换了枢轴之后，从眼睛到满偏依然需要移动约半个屏宽 —— 手感/范围不变。
   */
  const eye = eyeCenterScreen();
  const range = clamp(cfg.tracking.cursorRange ?? 1, 0.3, 2);
  const halfW = Math.max(1, (cursor.sw || window.innerWidth) / 2);
  const halfH = Math.max(1, (cursor.sh || window.innerHeight) / 2);
  const dx = clamp(((cursor.x - eye.x) / halfW) * range, -1.4, 1.4);
  const dy = clamp(((cursor.y - eye.y) / halfH) * range, -1.4, 1.4);
  f.angleX = clamp(dx * 16, -24, 24);
  f.angleY = clamp(-dy * 12, -20, 20);
  // 注意符号：参数表里 EyeRightX 的输出区间是反的（1.0 → -1.0），
  // 所以这里的 x 要取反，瞳孔才会跟着鼠标往同一侧走。
  f.eyeBallX = clamp(-dx * 1.3, -1, 1);
  f.eyeBallY = clamp(-dy * 1.3, -1, 1);
  f.eyeL = 1;
  f.eyeR = 1;
  f.brow = 0.45;
  return f;
}

/* ------------------------------------------------------------------ */
/* 动作 / 表情                                                         */
/* ------------------------------------------------------------------ */
async function playMotion(id: string) {
  const loc = motionIndex.get(id);
  if (!loc || !model) return false;
  try {
    await model.motion(loc.group, loc.index, 3);
    return true;
  } catch (err) {
    console.warn('[pet] 播放动作失败', id, err);
    return false;
  }
}

async function runAction(req: ActionRequest) {
  if (!mixer) return;
  if (req.kind === 'expression' && req.assetId) {
    await mixer?.toggle(req.assetId);
    refreshHud();
  } else if (req.kind === 'motion' && req.assetId) {
    await playMotion(req.assetId);
  } else if (req.kind === 'clear-expressions') {
    mixer?.clear();
    refreshHud();
  }
}

/* ------------------------------------------------------------------ */
/* 指针：命中探测 / 拖动 / 缩放                                          */
/* ------------------------------------------------------------------ */
const canControlMouse = () => cfg.pet.mouseControl !== false;

window.addEventListener('mousemove', (e) => {
  cursor.x = e.clientX;
  cursor.y = e.clientY;
  cursor.inside = true;
  // 拖动由主进程自己读光标驱动，这里不再发坐标
  if (!dragging && canControlMouse()) {
    probe = { x: e.clientX, y: e.clientY };
  }
});

window.addEventListener('mouseenter', () => {
  cursor.inside = true;
});
window.addEventListener('mouseleave', () => {
  cursor.inside = false;
});
// 兜底：窗口失焦（比如 Alt+Tab、鼠标松开事件丢失）时结束拖动
window.addEventListener('blur', () => endDragSafe());

function endDragSafe() {
  if (!dragging) return;
  dragging = false;
  api.dragEnd();
  if (needRefit) {
    needRefit = false;
    refitOnResize();
  }
}

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (!canControlMouse()) return;
  dragging = true;
  dragStart = { x: e.screenX, y: e.screenY };
  api.dragStart();
});

window.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  endDragSafe();
});

window.addEventListener('dblclick', () => {
  if (!canControlMouse()) return;
  api.openControl();
});

window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (!canControlMouse()) return;
  if (cfg.pet.rightClickMenu === false) return;
  api.showPetMenu();
});

window.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (!canControlMouse()) return;
    void api.scaleBy(e.deltaY > 0 ? 0.94 : 1.06);
  },
  { passive: false },
);

window.addEventListener('dragstart', (e) => e.preventDefault());

/**
 * 尺寸变化：必须**先** resize 再 fit。
 * 反过来的话 fit() 会拿旧尺寸算缩放，模型就会"莫名其妙地自己变大变小"。
 * 拖动过程中一律不重排，等松手后再补 —— 否则拖动时窗口频繁挪动会触发重排，
 * 表现就是"一边拖一边自己缩放"。
 */
function refitOnResize() {
  if (query.has('logcursor')) {
    console.log(
      `[pet-resize] ${window.innerWidth}x${window.innerHeight} dpr=${window.devicePixelRatio} ` +
        `res=${stage?.app.renderer.resolution} dragging=${dragging}`,
    );
  }
  if (dragging) {
    needRefit = true;
    return;
  }
  stage?.app.renderer.resize(window.innerWidth, window.innerHeight);
  stage?.fit(cfg.pet.scale);
}
window.addEventListener('resize', refitOnResize);// 拖到另一块不同缩放的显示器时 devicePixelRatio 会变，此时要重设分辨率再重新适配
window.addEventListener('resize', () => {
  if (Math.abs(window.devicePixelRatio - lastDpr) < 0.01) return;
  lastDpr = window.devicePixelRatio;
  if (dragging) {
    needRefit = true;
    return;
  }
  const want = cfg.misc.renderScale > 0 ? cfg.misc.renderScale : 0;
  stage?.setResolution(want);
  refitOnResize();
});

function drainProbe() {
  // 拖动期间锁定"可交互"，绝不允许穿透判定在拖动中途把窗口切成忽略鼠标
  if (dragging) {
    probe = null;
    return;
  }
  if (!probe) return;
  const p = probe;
  probe = null;
  const alpha = stage.readAlphaAt(p.x, p.y);
  const shouldIgnore = alpha < 12;
  if (query.has('logcursor')) {
    console.log(`[probe] (${p.x},${p.y}) alpha=${alpha} ignore=${shouldIgnore}`);
  }
  if (shouldIgnore !== ignoringMouse) {
    ignoringMouse = shouldIgnore;
    api.setIgnoreMouse(shouldIgnore);
  }
}

/* ------------------------------------------------------------------ */
/* 追踪控制                                                            */
/* ------------------------------------------------------------------ */
async function startTracking() {
  if (!cfg.tracking.enabled) return;
  try {
    trackingError = null;
    const { FaceTracker: FT } = await import('./FaceTracker');
    tracker = tracker ?? new FT();
    const wasmBase = new URL('vendor/mediapipe/wasm', location.href).href;
    const modelPath = new URL('vendor/mediapipe/face_landmarker.task', location.href).href;
    await tracker.init({ wasmBase, modelPath, deviceId: cfg.tracking.deviceId, mirror: cfg.tracking.mirror, maxFps: 24 });
    await tracker.openCamera({ wasmBase, modelPath, deviceId: cfg.tracking.deviceId, mirror: cfg.tracking.mirror, maxFps: 24 });
    trackingActive = true;
  } catch (err) {
    trackingError = String(err);
    trackingActive = false;
    console.error('[tracking] 启动失败', err);
  }
}

async function stopTracking() {
  trackingActive = false;
  lastFace = null;
  await tracker?.closeCamera();
}

function syncTracking() {
  if (cfg.tracking.enabled && !trackingActive) void startTracking();
  if (!cfg.tracking.enabled && trackingActive) void stopTracking();
}

/* ------------------------------------------------------------------ */
/* 状态上报                                                            */
/* ------------------------------------------------------------------ */
function buildState(): RuntimeState {
  const f = lastFace;
  const applied = lastAppliedFrame;
  return {
    loaded: !!model && !loadError,
    fps: Math.round(fps || stage?.fps || 0),
    trackFps: Math.round(tracker?.detectFps ?? 0),
    tracking: trackingActive,
    faceFound: !!(f && f.found && cfg.tracking.enabled),
    faceConfidence: f?.confidence ?? 0,
    angles: { x: applied?.angleX ?? 0, y: applied?.angleY ?? 0, z: applied?.angleZ ?? 0 },
    eyeOpen: { l: f?.eyeL ?? 1, r: f?.eyeR ?? 1 },
    mouthOpen: f?.mouthOpen ?? 0,
    activeExpressions: mixer ? mixer.activeIds() : [],
    currentMotion,
    trackingLost: !!cfg.tracking.enabled && !(f && f.found),
    error: loadError ?? trackingError,
  };
}

setInterval(() => {
  api.reportState(buildState());
  refreshHud();
  pushPreviewFrame();
  if (query.has('logcursor')) {
    const eye = model ? eyeCenterScreen() : { x: 0, y: 0 };
    console.log(
      `[pet-cursor] cursor=${cursor.x.toFixed(0)},${cursor.y.toFixed(0)} eye=${eye.x.toFixed(0)},${eye.y.toFixed(0)} ` +
        `screen=${cursor.sw}x${cursor.sh} inside=${cursor.inside} ` +
        `angleX=${(lastAppliedFrame?.angleX ?? 0).toFixed(1)} angleY=${(lastAppliedFrame?.angleY ?? 0).toFixed(1)} ` +
        `eyeX=${(lastAppliedFrame?.eyeBallX ?? 0).toFixed(2)}`,
    );
  }
}, 250);

function pushPreviewFrame() {
  if (!previewOn || !tracker || !tracker.stream || !tracker.video.videoWidth) return;
  const now = performance.now();
  if (now - lastPreviewAt < 160) return;
  lastPreviewAt = now;
  const c = previewCanvas ?? (previewCanvas = document.createElement('canvas'));
  const w = 280;
  const h = Math.round((tracker.video.videoHeight / tracker.video.videoWidth) * w) || 210;
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  if (cfg.tracking.mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(tracker.video, 0, 0, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  try {
    api.sendPreview(c.toDataURL('image/jpeg', 0.55));
  } catch {
    /* ignore */
  }
}

function refreshHud() {
  if (!cfg?.misc.showDebugOverlay) {
    if (hud) hud.style.display = 'none';
    return;
  }
  if (!hud) return;
  hud.style.display = 'block';
  const s = buildState();
  hud.textContent = [
    `FPS ${s.fps}`,
    `追踪 ${s.tracking ? (s.faceFound ? '人脸 OK' : '等待人脸') : '关'}`,
    `角度 X${s.angles.x.toFixed(0)} Y${s.angles.y.toFixed(0)} Z${s.angles.z.toFixed(0)}`,
    `眼 ${s.eyeOpen.l.toFixed(2)}/${s.eyeOpen.r.toFixed(2)} 嘴 ${s.mouthOpen.toFixed(2)}`,
    `表情 ${s.activeExpressions.join(',') || '-'}`,
    `动作 ${s.currentMotion ?? '-'}`,
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */
api.onAction((req) => void runAction(req));

api.onConfig((next) => {
  cfg = next;
  tracking?.setParams(next.params);
  mixer?.setFadeScale(next.misc.fadeScale ?? 1);
  if (typeof next.misc.renderScale === 'number') stage?.setResolution(next.misc.renderScale);
  stage?.fit(next.pet.scale);
  // 蒙版分辨率不在这里改：运行中重建裁剪管理器会让渲染器崩溃，改完请「重新加载模型」
  applyModelPatches();
  setupPhysics();
  syncTracking();
  // 模型开关被拨动：关闭就卸载，打开就加载
  const want = shouldLoadModel();
  if (!want && model) unloadModel();
  if (want && !model && boot.hasModel) void reloadModel();
  if (!next.pet.mouseControl) {
    // 关闭鼠标控制 -> 立刻放开鼠标，别等下一次移动
    ignoringMouse = true;
    api.setIgnoreMouse(true);
  }
  refreshHud();
});

api.onCommand((cmd) => {
  if (cmd === 'reload-model') {
    // 主进程在「启用模型」打开或换模型时发这个；无模型/被关闭时改为卸载
    if (shouldLoadModel()) void reloadModel();
    else unloadModel();
  }
  if (cmd === 'unload-model') unloadModel();
  if (cmd === 'reset-state') resetModelState();
});

/** 重置模型状态：取消所有表情与动作（缩放/位置由主进程负责） */
function resetModelState() {
  try {
    mixer?.clearImmediate();
  } catch {
    /* ignore */
  }
  try {
    (model.internalModel as any)?.motionManager?.stopAllMotions?.();
  } catch {
    /* ignore */
  }
  currentMotion = null;
  lostMotionFired = false;
  refreshHud();
}

api.onPreviewSet((on) => {
  previewOn = on;
  if (on) previewCanvas = previewCanvas ?? document.createElement('canvas');
});

/**
 * 主进程轮询过来的光标位置。
 * 桌面驻留场景下窗口默认是穿透态，这个通道是"知道鼠标在哪"的唯一可靠来源。
 */
api.onCursor((p) => {
  cursor.x = p.x;
  cursor.y = p.y;
  cursor.sw = p.sw || cursor.sw;
  cursor.sh = p.sh || cursor.sh;
  cursor.inside = p.inside;
  if (!canControlMouse()) {
    // 鼠标控制关闭：整窗穿透，不做任何命中探测
    if (ignoringMouse !== true) {
      ignoringMouse = true;
      api.setIgnoreMouse(true);
    }
  } else if (p.inside) {
    probe = { x: p.x, y: p.y };
  } else if (ignoringMouse !== true) {
    ignoringMouse = true;
    api.setIgnoreMouse(true);
  }
});

api.onTestImage((d) => testImageResolve?.(d));

async function reloadModel() {
  setStatus('重新加载模型…');
  stage.stop();
  try {
    const fresh = await api.boot('pet');
    manifest = fresh.manifest;
    cfg = fresh.config;
    boot = fresh;
    stage.model?.destroy();
    stage.model = null;
    await loadModel();
  } catch (err) {
    setError(String(err));
  }
}

/* ------------------------------------------------------------------ */
/* 自检                                                                */
/* ------------------------------------------------------------------ */
async function runSmoke() {
  /** 以下几条断言是针对内置 deepseek-chan 的具体网格/参数写的；
   *  换成别的模型时没有意义，直接标为 skipped，避免误报失败。 */
  const isRefModel = manifest.id === 'deepseek-chan';
  const skip = (step: string, why: string) => add(step, true, { skipped: true, why });
  const steps: { step: string; ok: boolean; [k: string]: unknown }[] = [];
  const add = (step: string, ok: boolean, extra: Record<string, unknown> = {}) => steps.push({ step, ok, ...extra });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  try {
    await sleep(300);
    const im = model.internalModel as any;
    add('model-loaded', !!model && im.width > 0, {
      width: im.width,
      height: im.height,
      textures: model.textures?.length ?? 0,
      physics: !!im.physics,
      motions: Object.keys(im.motionManager.definitions ?? {}).length,
      expressions: im.motionManager.expressionManager ? 'present' : 'none',
    });

    // 模型确实画出了东西：取样中心点 alpha
    await stage.nextFrame();
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const a1 = stage.readAlphaAt(cx, cy);
    const a2 = stage.readAlphaAt(8, 8);
    add('render-alpha', a1 > 12 && a2 < 12, { center: a1, corner: a2 });

    // 模型补丁是否生效（鼻子占位 / 边缘反光网格识别）
    if (!isRefModel) skip('model-patches', '该断言只针对内置模型');
  else add('model-patches', hiddenDrawables.size >= 2 && glowDrawables.length > 0, {
      hiddenNose: [...hiddenDrawables],
      glowDrawables: glowDrawables.length,
      eyeCenter: (() => {
        const e = eyeCenterScreen();
        return { x: Math.round(e.x), y: Math.round(e.y) };
      })(),
    });

    // 表情开关
    const expHk = manifest.hotkeys.find((h) => h.kind === 'expression')!;
    await runAction({ kind: 'expression', assetId: expHk.assetId, hotkeyId: expHk.id });
    await sleep(450);
    const expDef = manifest.expressions.find((e) => e.id === expHk.assetId)!;
    const expJson = await fetch(boot.modelBase + expDef.file).then((r) => r.json());
    const pid = expJson.Parameters?.[0]?.Id;
    const pval = pid ? core.getParameterValueById(pid) : null;
    add('expression-on', (mixer?.activeIds() ?? []).includes(expHk.id ? expHk.assetId! : ''), {
      active: mixer?.activeIds() ?? [],
      param: pid,
      value: pval,
      expected: expJson.Parameters?.[0]?.Value,
    });

    // 动作播放
    const motHk = manifest.hotkeys.find((h) => h.kind === 'motion')!;
    const played = await playMotion(motHk.assetId!);
    await sleep(350);
    add('motion-play', played, { id: motHk.assetId, label: motHk.label, current: currentMotion });

    // 参数驱动（模拟人脸）
    const fake: FaceFrame = { ...emptyFrame(), found: true, angleX: 20, angleY: -10, angleZ: 8 };
    lastFace = fake;
    faceAt = performance.now();
    const prevCfg = cfg;
    cfg = { ...cfg, misc: { ...cfg.misc, cursorLook: false }, tracking: { ...cfg.tracking, enabled: true } };
    await sleep(400);
    const ax = core.getParameterValueById('AngleX');
    const ay = core.getParameterValueById('AngleY');
    add('tracking-drive', Math.abs(ax) > 3 && Math.abs(ay) > 2, { AngleX: ax, AngleY: ay });

    // 眼睛响应：闭眼要能闭死、瞪眼要能放大、常态要停在 1.0 附近
    const eyeParam = 'ParamEyeLOpen';
    const setFace = async (patch: Partial<FaceFrame>, wait = 450) => {
      lastFace = { ...emptyFrame(), found: true, eyeL: 1, eyeR: 1, ...patch };
      faceAt = performance.now();
      await sleep(wait);
      return Number(core.getParameterValueById(eyeParam).toFixed(3));
    };
    const closed = await setFace({ eyeL: 0, eyeR: 0, eyeWideL: 0, eyeWideR: 0 });
    const wide = await setFace({ eyeL: 1, eyeR: 1, eyeWideL: 1, eyeWideR: 1 });
    const normal = await setFace({ eyeL: 1, eyeR: 1, eyeWideL: 0, eyeWideR: 0 });
    if (!isRefModel) skip('eye-response', '该断言只针对内置模型');
  else add('eye-response', closed < 0.06 && wide > 1.12 && normal > 0.85 && normal < 1.15, { closed, wide, normal });

    cfg = prevCfg;

    // 表情语义回归：默认值 / 互斥档位 / 关闭后回默认
    if (!isRefModel) skip('expression-semantics', '该断言只针对内置模型');
  else add('expression-semantics', true, await checkExpressionSemantics());

    // 鼻子占位黑块是否已消失
    await stage.sampleAfterFrame(0, 0);
    const faceRegion = stage.readRegion(
      window.innerWidth * 0.34,
      window.innerHeight * 0.15,
      window.innerWidth * 0.32,
      window.innerHeight * 0.12,
    );
    let blackPixels = 0;
    if (faceRegion) {
      for (let i = 0; i < faceRegion.data.length; i += 4) {
        if (faceRegion.data[i + 3] < 200) continue;
        if (faceRegion.data[i] + faceRegion.data[i + 1] + faceRegion.data[i + 2] < 24) blackPixels++;
      }
    }
    if (!isRefModel) skip('nose-clean', '该断言只针对内置模型');
  else add('nose-clean', blackPixels < 40, { blackPixels, hidden: [...hiddenDrawables] });

    // 清理
    mixer?.clear();
    await sleep(300);

    if (query.has('ttest')) {
      const img = await testImagePromise;
      const tt = await runTrackingTest(img);
      add('tracking-test', !!tt.faceFound, tt);
    }

    // 诊断：找出鼻子正中间那个"黑方块"到底是哪个 part
    add('drawable-probe', true, {
      hits: probeDrawables(window.innerWidth / 2, window.innerHeight * 0.3),
      textures: inspectTextures(),
    });
    if (query.has('nose')) {
      add('nose-scan', true, await findNoseDrawable());
    }

    if (query.has('diag')) {      add('nose-inspect', true, {
        nose: inspectPart('Part46'),
        head: inspectPart('Part99'),
        face: inspectPart('Part'),
      });
      if (query.has('parts')) {
        await stage.sampleAfterFrame(0, 0);
        const region = stage.readRegion(
          window.innerWidth * 0.3,
          window.innerHeight * 0.14,
          window.innerWidth * 0.4,
          window.innerHeight * 0.16,
        );
        const dpr = stage.resolution;
        let dark: { x: number; y: number; rgb: number[] } | null = null;
        if (region) {
          for (let yy = 0; yy < region.h; yy++) {
            for (let xx = 0; xx < region.w; xx++) {
              const o = (yy * region.w + xx) * 4;
              const [r, g, b, a] = [region.data[o], region.data[o + 1], region.data[o + 2], region.data[o + 3]];
              if (a < 200) continue;
              const lum = r + g + b;
              if (lum < 90) {
                const sx = window.innerWidth * 0.3 + xx / dpr;
                const sy = window.innerHeight * 0.14 + (region.h - yy) / dpr;
                if (!dark || lum < dark.rgb[0] + dark.rgb[1] + dark.rgb[2]) dark = { x: Math.round(sx), y: Math.round(sy), rgb: [r, g, b] };
              }
            }
          }
        }
        const bx = dark?.x ?? Math.round(window.innerWidth / 2);
        const by = dark?.y ?? Math.round(window.innerHeight * 0.3);
        add('part-scan', true, { at: { bx, by }, dark, culprits: await findCulpritPart(bx, by) });
      }
    }
  } catch (err) {
    add('exception', false, { error: String(err) });
  }
  const ok = steps.length > 0 && steps.every((s) => s.ok);
  api.smokeReport({ ok, steps, error: loadError, fps: Math.round(stage.fps) });
}

/* ------------------------------------------------------------------ */
syncTracking();
refreshHud();
console.log('[pet] 启动完成', manifest.name);

/** 诊断：找出鼻子处那个黑方块由哪个 drawable 画出来 */
async function findNoseDrawable() {
  const im = model.internalModel as any;
  const cm = im.coreModel;
  await stage.sampleAfterFrame(0, 0);
  const region = stage.readRegion(
    window.innerWidth * 0.32,
    window.innerHeight * 0.15,
    window.innerWidth * 0.36,
    window.innerHeight * 0.13,
  );
  if (!region) return { error: '区域读取失败' };
  const dpr = stage.resolution;
  let dark: { x: number; y: number; rgb: number[] } | null = null;
  for (let yy = 0; yy < region.h; yy++) {
    for (let xx = 0; xx < region.w; xx++) {
      const o = (yy * region.w + xx) * 4;
      const a = region.data[o + 3];
      if (a < 200) continue;
      const lum = region.data[o] + region.data[o + 1] + region.data[o + 2];
      if (lum < 90) {
        const sx = window.innerWidth * 0.32 + xx / dpr;
        const sy = window.innerHeight * 0.15 + (region.h - yy) / dpr;
        if (!dark || lum < dark.rgb[0] + dark.rgb[1] + dark.rgb[2]) {
          dark = { x: Math.round(sx), y: Math.round(sy), rgb: [region.data[o], region.data[o + 1], region.data[o + 2]] };
        }
      }
    }
  }
  if (!dark) return { error: '没找到深色像素' };

  // 列出所有包围盒覆盖该点的 drawable
  const pos = model.toModelPosition({ x: dark.x, y: dark.y }, { x: 0, y: 0 });
  const count = cm.getDrawableCount();
  const candidates: { i: number; id: string; area: number }[] = [];
  for (let i = 0; i < count; i++) {
    if (cm.getDrawableOpacity(i) < 0.01) continue;
    const v = im.getDrawableVertices(i);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let k = 0; k < v.length; k += 2) {
      minX = Math.min(minX, v[k]);
      maxX = Math.max(maxX, v[k]);
      minY = Math.min(minY, v[k + 1]);
      maxY = Math.max(maxY, v[k + 1]);
    }
    if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) {
      candidates.push({ i, id: cm.getDrawableId(i), area: Math.round((maxX - minX) * (maxY - minY)) });
    }
  }
  candidates.sort((a, b) => a.area - b.area);

  const before = await stage.sampleAfterFrame(dark.x, dark.y);
  const results: any[] = [];
  for (const c of candidates.slice(0, 60)) {
    hiddenDrawables.add(c.i);
    const after = await stage.sampleAfterFrame(dark.x, dark.y);
    hiddenDrawables.delete(c.i);
    const dist = Math.abs(before[0] - after[0]) + Math.abs(before[1] - after[1]) + Math.abs(before[2] - after[2]);
    if (dist > 30) results.push({ ...c, after, dist });
  }

  // 贪心：先全部隐藏，再逐个放回，看谁一放回就把这块又变黑
  const pool = results.length ? results.map((r) => r.i) : candidates.map((c) => c.i);
  for (const i of pool) hiddenDrawables.add(i);
  const allHidden = await stage.sampleAfterFrame(dark.x, dark.y);
  const essential: string[] = [];
  for (const i of pool) {
    hiddenDrawables.delete(i);
    const back = await stage.sampleAfterFrame(dark.x, dark.y);
    const darkAgain = back[0] + back[1] + back[2] < 120;
    if (darkAgain) {
      hiddenDrawables.add(i);
      essential.push(cm.getDrawableId(i));
    }
  }
  for (const i of pool) hiddenDrawables.delete(i);
  return { at: dark, before, candidates: candidates.length, culprits: results, allHidden, essential };
}

/** 离线自检：用一张静态人脸跑通 MediaPipe 全流程（不需要摄像头） */
async function runTrackingTest(dataUrl: string | null) {
  if (!dataUrl) return { faceFound: false, error: '没有收到测试图片' };
  const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
  const { buildFaceFrame } = await import('./FaceTracker');
  const wasmBase = new URL('vendor/mediapipe/wasm', window.location.href).href;
  const modelPath = new URL('vendor/mediapipe/face_landmarker.task', window.location.href).href;
  const vision = await FilesetResolver.forVisionTasks(wasmBase);
  const lm = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: modelPath, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('测试图片解码失败'));
    i.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const r1 = lm.detectForVideo(canvas, 1000);
  const lm0 = r1.faceLandmarks?.[0];
  const f1 = lm0 ? buildFaceFrame(lm0, r1) : null;

  const flipped = document.createElement('canvas');
  flipped.width = canvas.width;
  flipped.height = canvas.height;
  const c2 = flipped.getContext('2d')!;
  c2.translate(canvas.width, 0);
  c2.scale(-1, 1);
  c2.drawImage(img, 0, 0);
  const r2 = lm.detectForVideo(flipped, 3000);
  const f2 = r2.faceLandmarks?.[0] ? buildFaceFrame(r2.faceLandmarks[0], r2) : null;

  lm.close();
  const r3 = (v: number) => Number(v.toFixed(2));
  return {
    faceFound: !!f1?.found,
    landmarks: lm0?.length ?? 0,
    blendshapes: r1.faceBlendshapes?.[0]?.categories?.length ?? 0,
    hasMatrix: !!r1.facialTransformationMatrixes?.length,
    angles: f1 ? { x: r3(f1.angleX), y: r3(f1.angleY), z: r3(f1.angleZ) } : null,
    flippedAngles: f2 ? { x: r3(f2.angleX), y: r3(f2.angleY), z: r3(f2.angleZ) } : null,
    yawFlipsWithMirror: f1 && f2 ? Math.sign(f1.angleX) !== Math.sign(f2.angleX) : null,
    face: f1
      ? {
          eyeL: r3(f1.eyeL),
          eyeR: r3(f1.eyeR),
          mouthOpen: r3(f1.mouthOpen),
          brow: r3(f1.brow),
          gazeX: r3(f1.eyeBallX),
          gazeY: r3(f1.eyeBallY),
        }
      : null,
  };
}

/** 诊断：某个 part 下所有 drawable 的 UV / 贴图 / 混合模式 */
function inspectPart(partId: string) {
  try {
    const im = model.internalModel as any;
    const cm = im.coreModel;
    const native = cm._model ?? cm.getModel?.();
    const pi = cm.getPartIndex(partId);
    const parent: ArrayLike<number> = native.drawables.parentPartIndices;
    const uvsAll: any[] = native.drawables.vertexUvs;
    const texAll: ArrayLike<number> = native.drawables.textureIndices;
    const out: any[] = [];
    for (let i = 0; i < parent.length; i++) {
      if (parent[i] !== pi) continue;
      const uvs = uvsAll[i];
      let minU = 1e9, maxU = -1e9, minV = 1e9, maxV = -1e9;
      for (let k = 0; k < uvs.length; k += 2) {
        minU = Math.min(minU, uvs[k]);
        maxU = Math.max(maxU, uvs[k]);
        minV = Math.min(minV, uvs[k + 1]);
        maxV = Math.max(maxV, uvs[k + 1]);
      }
      out.push({
        i,
        tex: texAll[i],
        blend: cm.getDrawableBlendMode(i),
        opacity: Number(cm.getDrawableOpacity(i).toFixed(3)),
        uv: [minU.toFixed(4), minV.toFixed(4), maxU.toFixed(4), maxV.toFixed(4)],
      });
    }
    return { partIndex: pi, count: out.length, drawables: out };
  } catch (err) {
    return { error: String(err) };
  }
}

/** 诊断：逐个隐藏 part，看哪个 part 负责那个像素 */
async function findCulpritPart(bx: number, by: number) {
  const im = model.internalModel as any;
  const cm = im.coreModel;
  const n = cm.getPartCount();
  const before = await stage.sampleAfterFrame(bx, by);
  const culprits: any[] = [];
  const ids: string[] = (cm as any)._partIds ?? [];
  for (let i = 0; i < n; i++) {
    const id = ids[i] ?? `#${i}`;
    const op = cm.getPartOpacityByIndex(i);
    cm.setPartOpacityByIndex(i, 0);
    const after = await stage.sampleAfterFrame(bx, by);
    cm.setPartOpacityByIndex(i, op);
    const dist = Math.abs(before[0] - after[0]) + Math.abs(before[1] - after[1]) + Math.abs(before[2] - after[2]);
    if (dist > 30) culprits.push({ id, before, after, dist });
  }
  return { partCount: n, before, culprits };
}

/** 诊断：贴图索引 / 使用情况 */
function inspectTextures() {
  try {
    const im = model.internalModel as any;
    const native = im.coreModel?._model ?? im.coreModel;
    const d = native?.drawables;
    if (!d) return { error: 'no drawables on native model', keys: Object.keys(native ?? {}) };
    const idx = d.textureIndices;
    const arr = idx ? Array.from(idx as ArrayLike<number>) : [];
    const max = arr.length ? Math.max(...arr) : -1;
    const used = [...new Set(arr)].sort();
    return {
      drawableCount: arr.length,
      maxTextureIndex: max,
      usedTextures: used,
      boundTextures: model.textures?.length ?? 0,
      drawableIdsSample: Array.from((d.ids ?? []).slice(0, 5) as ArrayLike<string>),
    };
  } catch (err) {
    return { error: String(err) };
  }
}

/** 诊断：返回屏幕坐标处覆盖的 drawable 列表（按顶点包围盒判断） */function probeDrawables(clientX: number, clientY: number) {
  try {
    const im = model.internalModel as any;
    const cm = im.coreModel;
    const count = cm.getDrawableCount();
    const pos = model.toModelPosition({ x: clientX, y: clientY }, { x: 0, y: 0 });
    const hits: any[] = [];
    for (let i = 0; i < count; i++) {
      const op = cm.getDrawableOpacity(i);
      if (op < 0.01) continue;
      const verts = im.getDrawableVertices(i);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let v = 0; v < verts.length; v += 2) {
        minX = Math.min(minX, verts[v]);
        maxX = Math.max(maxX, verts[v]);
        minY = Math.min(minY, verts[v + 1]);
        maxY = Math.max(maxY, verts[v + 1]);
      }
      if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) {
        let tex: unknown = '?';
        let blend: unknown = '?';
        try {
          tex = typeof cm.getDrawableTextureIndex === 'function' ? cm.getDrawableTextureIndex(i) : cm.drawables?.textureIndices?.[i];
        } catch { /* ignore */ }
        try {
          blend = typeof cm.getDrawableBlendMode === 'function' ? cm.getDrawableBlendMode(i) : 'n/a';
        } catch { /* ignore */ }
        hits.push({
          id: cm.getDrawableId(i),
          opacity: Number(op.toFixed(2)),
          tex,
          blend,
          area: Math.round((maxX - minX) * (maxY - minY)),
        });
      }
    }
    hits.sort((a, b) => a.area - b.area);
    return { modelPos: { x: Math.round(pos.x), y: Math.round(pos.y) }, total: count, hits: hits.slice(0, 8) };
  } catch (err) {
    return { error: String(err) };
  }
}
