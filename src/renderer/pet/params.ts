import type { ParamMapping, TrackingConfig } from '../../shared/types';
import { clamp, smoothingToAlpha } from '../../shared/config';
import type { ExpressionDef } from '../../shared/types';

/** 一帧面部捕捉结果（归一化后，尚未做参数映射） */
export interface FaceFrame {
  found: boolean;
  confidence: number;
  /** 头部欧拉角（度） */
  angleX: number;
  angleY: number;
  angleZ: number;
  eyeL: number;
  eyeR: number;
  /** 瞪眼程度 0..1（ARKit eyeWide），用来把"瞪眼"做出来 */
  eyeWideL: number;
  eyeWideR: number;
  eyeBallX: number;
  eyeBallY: number;
  mouthOpen: number;
  mouthSmile: number;
  mouthSmileL: number;
  mouthSmileR: number;
  brow: number;
  browInnerUp: number;
  cheekPuff: number;
  mouthPucker: number;
  mouthFunnel: number;
  mouthShrug: number;
  tongueOut: number;
  squintL: number;
  squintR: number;
  mouthX: number;
  /** 由鼠标位置合成的"假帧"（摄像机未启用时的注视效果） */
  synthetic?: boolean;
}

export function emptyFrame(): FaceFrame {
  return {
    found: false,
    confidence: 0,
    angleX: 0,
    angleY: 0,
    angleZ: 0,
    eyeL: 1,
    eyeR: 1,
    eyeWideL: 0,
    eyeWideR: 0,
    eyeBallX: 0,
    eyeBallY: 0,
    mouthOpen: 0,
    mouthSmile: 0,
    mouthSmileL: 0,
    mouthSmileR: 0,
    brow: 0.45,
    browInnerUp: 0,
    cheekPuff: 0,
    mouthPucker: 0,
    mouthFunnel: 0,
    mouthShrug: 0,
    tongueOut: 0,
    squintL: 0,
    squintR: 0,
    mouthX: 0,
  };
}

/** CubismModel 的最小可用接口（避免依赖内部类型） */
export interface CoreModel {
  setParameterValueById(id: string, value: number, weight?: number): void;
  addParameterValueById(id: string, value: number, weight?: number): void;
  getParameterValueById(id: string): number;
  getParameterIndex?(id: string): number;
  getParameterDefaultValue?(index: number): number;
  getParameterMinimumValue(id: number): number;
  getParameterMaximumValue(id: number): number;
}

function deadzone(v: number, dz: number) {
  return Math.abs(v) < dz ? 0 : v - Math.sign(v) * dz;
}

/**
 * 面部追踪层：把 FaceFrame 按 VTube Studio 的参数映射表（config.params）
 * 换算成 Live2D 参数，带每通道平滑。
 */
export class TrackingLayer {
  private smoothed = new Map<string, number>();
  private blink: { t: number; next: number; phase: 'idle' | 'closing' | 'opening' } = {
    t: 0,
    next: 2.5,
    phase: 'idle',
  };
  private blinkValue = 0;
  private lastInputs: Record<string, number> = {};

  constructor(private params: ParamMapping[]) {}

  setParams(params: ParamMapping[]) {
    this.params = params;
  }

  getInputs() {
    return this.lastInputs;
  }

  private buildInputs(frame: FaceFrame, cfg: TrackingConfig, blink: number): Record<string, number> {
    // VTS 的 EyeOpen 输入区间是 (0, 0.8) → (0, 1.5)，其中 0.5333 落在输出的 1.0，
    // 也就是"正常睁眼"。所以基准值取 0.5333，闭眼往下压、瞪眼往上抬。
    const BASE = 0.5333;
    const gain = clamp(cfg.gainBlink ?? 1.2, 0.4, 3);
    const blinkMul = 1 - clamp(blink, 0, 1);
    /**
     * 睁眼度：MediaPipe 静止时 eyeBlink 就有 0.1~0.2 的底噪，
     * 直接线性用会导致"睁着眼也像没睁开、闭眼闭不死"。这里做一个 0.12~0.72 的归一段，
     * 再用 gainBlink 放大，才能真的闭死、也才能让眨眼看得出来。
     * blinkMul 是模型自己的兜底眨眼（没有真人脸时）。
     */
    const eyeInput = (open: number, wide: number) => {
      const closure = clamp((1 - clamp(open, 0, 1) - 0.12) / 0.6, 0, 1);
      const closed = clamp(closure * gain, 0, 1);
      const widening = clamp(wide, 0, 1) * gain * 0.3;
      return clamp(BASE * (1 - closed) * blinkMul + widening, 0, 0.8);
    };
    const eyeL = eyeInput(frame.eyeL, frame.eyeWideL);
    const eyeR = eyeInput(frame.eyeR, frame.eyeWideR);
    return {
      FaceAngleX: deadzone((frame.angleX - cfg.neutralX) * cfg.gainX * (cfg.invertX ? -1 : 1), cfg.deadzone),
      FaceAngleY: deadzone((frame.angleY - cfg.neutralY) * cfg.gainY * (cfg.invertY ? -1 : 1), cfg.deadzone),
      FaceAngleZ: deadzone((frame.angleZ - cfg.neutralZ) * cfg.gainZ * (cfg.invertZ ? -1 : 1), cfg.deadzone),
      EyeRightX: clamp(frame.eyeBallX * cfg.gainEye, -0.7, 0.7),
      EyeRightY: clamp(frame.eyeBallY * cfg.gainEye, -0.7, 0.7),
      EyeOpenLeft: eyeL,
      EyeOpenRight: eyeR,
      Brows: clamp(frame.brow, 0, 1),
      BrowInnerUp: clamp(frame.browInnerUp, 0, 1),
      MouthOpen: clamp(frame.mouthOpen * cfg.gainMouth, 0, 1),
      JawOpen: clamp(frame.mouthOpen * cfg.gainMouth, 0, 1),
      MouthSmile: clamp(frame.mouthSmile, 0, 1),
      mouthSmileL: clamp(frame.mouthSmileL, 0, 1),
      mouthSmileR: clamp(frame.mouthSmileR, 0, 1),
      CheekPuff: clamp(frame.cheekPuff, 0, 1),
      MouthPucker: clamp(frame.mouthPucker, -1, 1),
      MouthFunnel: clamp(frame.mouthFunnel, 0, 1),
      MouthShrug: clamp(frame.mouthShrug, 0, 1),
      TongueOut: clamp(frame.tongueOut, 0, 1),
      LEyeSquint: clamp(frame.squintL, 0, 1),
      REyeSquint: clamp(frame.squintR, 0, 1),
      MouthX: clamp(frame.mouthX, -1, 1),
      MouthPressLipOpen: 1 - clamp(frame.mouthOpen * 3, 0, 1),
      MouthRollUpper: 0,
      MouthRollLower: 0,
      nosesNEER: 0,
      VoiceSilence: 1,
    };
  }

  /**
   * 应用追踪参数；frame 为 null 表示丢失追踪。
   *
   * `lock` 是当前动作正在驱动的参数集合：这些参数这一帧不能由追踪写入，
   * 否则动作会被追踪逐帧覆盖 —— 表现为"动作错乱/没效果"。
   * VTube Studio 里动作对它所驱动的参数也有更高优先级。
   */
  apply(
    core: CoreModel,
    frame: FaceFrame | null,
    dt: number,
    cfg: TrackingConfig,
    autoBlink: boolean,
    lock?: Set<string>,
  ) {
    // 自动眨眼：只有在没有实时人脸数据（或用的是鼠标合成帧）时才兜底
    const useFallbackBlink = autoBlink && (!frame || !frame.found || frame.synthetic);
    this.blinkValue = useFallbackBlink ? this.stepBlink(dt) : 0;
    const inputs = frame && frame.found ? this.buildInputs(frame, cfg, this.blinkValue) : {};
    const neutral: Record<string, number> = {
      FaceAngleX: 0,
      FaceAngleY: 0,
      FaceAngleZ: 0,
      EyeRightX: 0,
      EyeRightY: 0,
    };
    this.lastInputs = inputs;

    for (const p of this.params) {
      if (!p.output) continue;
      if (p.disabled) continue;
      if (p.breath) continue; // 呼吸交给 SDK 内置
      // 正在播放的动作拥有该参数 → 这一帧不写，否则动作会被覆盖
      if (lock && lock.has(p.output)) continue;
      let input: number | undefined;
      let raw: number;
      if (!frame || !frame.found) {
        // 丢失追踪：头部/眼球回中，眼睛用兜底眨眼
        const isEye = p.output === 'ParamEyeLOpen' || p.output === 'ParamEyeROpen';
        if (isEye) {
          // 与 buildInputs 同一套基准：0.5333 → 输出 1.0（正常睁眼）
          raw = this.mapRange(p, 0.5333 * (1 - this.blinkValue));
        } else if (p.input && neutral[p.input] !== undefined) {
          input = neutral[p.input];
          raw = this.mapRange(p, input);
        } else {
          continue;
        }
      } else {
        if (!p.input) continue;
        input = inputs[p.input];
        if (input === undefined) continue;
        raw = this.mapRange(p, input);
      }

      // 平滑
      const key = p.output;
      const prev = this.smoothed.get(key);
      const alpha = p.smoothing > 0 ? smoothingToAlpha(p.smoothing, dt) : 1;
      const next = prev === undefined ? raw : prev + (raw - prev) * alpha;
      this.smoothed.set(key, next);
      core.setParameterValueById(key, next);
    }
  }

  private mapRange(p: ParamMapping, input: number): number {
    let v = input;
    if (p.clampInput) v = clamp(v, Math.min(p.inLower, p.inUpper), Math.max(p.inLower, p.inUpper));
    const span = p.inUpper - p.inLower;
    const t = span === 0 ? 0 : (v - p.inLower) / span;
    const out = p.outLower + (p.outUpper - p.outLower) * t;
    return p.clampOutput ? clamp(out, Math.min(p.outLower, p.outUpper), Math.max(p.outLower, p.outUpper)) : out;
  }

  private stepBlink(dt: number) {
    const b = this.blink;
    b.t += dt;
    if (b.phase === 'idle') {
      if (b.t >= b.next) {
        b.phase = 'closing';
        b.t = 0;
      }
      return 0;
    }
    if (b.phase === 'closing') {
      const v = Math.min(1, b.t / 0.07);
      if (v >= 1) {
        b.phase = 'opening';
        b.t = 0;
      }
      return v;
    }
    const v = Math.max(0, 1 - b.t / 0.12);
    if (v <= 0) {
      b.phase = 'idle';
      b.t = 0;
      b.next = 2.2 + Math.random() * 4.5;
    }
    return v;
  }
}

/* ------------------------------------------------------------------ */
/* 表情混合器                                                          */
/* ------------------------------------------------------------------ */

interface ExpParam {
  Id: string;
  Value: number;
  Blend: number | string;
}

interface ActiveExpression {
  id: string;
  /** 激活顺序，越大越"新" */
  seq: number;
  params: ExpParam[];
  weight: number;
  target: number;
  fadeIn: number;
  fadeOut: number;
}

/**
 * 多表情叠加混音器。
 *
 * 三条硬性规则（都是踩过坑换来的）：
 *
 * 1. **基线用模型默认值，不是 0。**
 *    这个模型的 `Clothes1`(裙子) 和 `Clothes5`(尾巴) 默认值都是 1；一律写 0 会让
 *    尾巴直接消失、裙子换成错的那条、裙边出现透明缺口。
 *
 * 2. **没有表情占用某个参数时，一个字都不写。**
 *    否则会覆盖动作层（motion）刚写进去的值 —— 表现就是"竖手指动作手臂没变化"。
 *
 * 3. **同一参数被多个表情占用时，按激活顺序后者覆盖前者（带权重插值）。**
 *    体型1/体型2/默认体型 是同一个 `Clothes2` 的三个互斥档位（0.4 / 1 / 0），
 *    相加永远切不回去；覆盖式插值才能像 VTS 那样"后按的生效、淡出时回到前一个"。
 */
export class ExpressionMixer {
  private defs = new Map<string, ExpressionDef>();
  private cache = new Map<string, ExpParam[]>();
  private inflight = new Map<string, Promise<ExpParam[] | null>>();
  private active = new Map<string, ActiveExpression>();
  /** 参数 -> 模型默认值（懒加载） */
  private defaults = new Map<string, number>();
  /** 上一帧被表情占用的参数，用于退出时恢复默认 */
  private owned = new Set<string>();
  private seq = 1;
  private core: CoreModel | null = null;
  private base = '';
  /** 过渡时长倍率（1 = 用资源自带 FadeIn/FadeOut） */
  private fadeScale = 1;

  constructor(private onChange?: () => void) {}

  setFadeScale(scale: number) {
    this.fadeScale = clamp(scale || 1, 0.2, 5);
  }

  /** 模型加载完成后调用，用于读取参数默认值 */
  attach(core: CoreModel) {
    this.core = core;
    this.defaults.clear();
    this.owned.clear();
  }

  setBase(base: string) {
    this.base = base.endsWith('/') ? base : base + '/';
  }

  register(defs: ExpressionDef[]) {
    this.defs = new Map(defs.map((d) => [d.id, d]));
  }

  async preload(defs: ExpressionDef[]) {
    this.register(defs);
    await Promise.all(defs.map((d) => this.ensure(d.id)));
  }

  private defaultOf(pid: string): number {
    const hit = this.defaults.get(pid);
    if (hit !== undefined) return hit;
    let value = 0;
    try {
      const core = this.core;
      if (core?.getParameterIndex && core.getParameterDefaultValue) {
        const idx = core.getParameterIndex(pid);
        if (typeof idx === 'number' && idx >= 0) value = core.getParameterDefaultValue(idx) ?? 0;
      }
    } catch {
      /* 参数不存在时保持 0 */
    }
    this.defaults.set(pid, value);
    return value;
  }

  /** 并发安全：同一个表情只会真正请求一次，其余调用复用同一个 Promise */
  private ensure(id: string): Promise<ExpParam[] | null> {
    const cached = this.cache.get(id);
    if (cached) return Promise.resolve(cached);
    const running = this.inflight.get(id);
    if (running) return running;

    const def = this.defs.get(id);
    if (!def) return Promise.resolve(null);

    const p = (async () => {
      try {
        const res = await fetch(this.base + def.file);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { Parameters?: ExpParam[] };
        const params = (json.Parameters ?? []).map((x) => ({
          Id: x.Id,
          Value: x.Value,
          Blend: x.Blend ?? 'Add',
        }));
        this.cache.set(id, params);
        // 顺手把默认值读出来，避免首帧抖动
        for (const x of params) this.defaultOf(x.Id);
        return params;
      } catch (err) {
        console.warn('[expression] 加载失败', id, err);
        return null;
      } finally {
        this.inflight.delete(id);
      }
    })();
    this.inflight.set(id, p);
    return p;
  }

  isOn(id: string) {
    const a = this.active.get(id);
    return !!a && a.target === 1;
  }

  activeIds(): string[] {
    return [...this.active.values()].filter((a) => a.target === 1).map((a) => a.id);
  }

  /** 自检用：读取某个表情当前的权重（0..1） */
  debugWeight(id: string): number {
    return this.active.get(id)?.weight ?? 0;
  }

  async set(id: string, on: boolean) {
    if (on) {
      const cur = this.active.get(id);
      if (cur) {
        cur.target = 1;
        return;
      }
      const params = await this.ensure(id);
      if (!params) return;
      const def = this.defs.get(id);
      this.active.set(id, {
        id,
        seq: this.seq++,
        params,
        weight: 0,
        target: 1,
        fadeIn: (def?.fadeIn ?? 0.45) * this.fadeScale,
        fadeOut: (def?.fadeOut ?? 0.45) * this.fadeScale,
      });
    } else {
      const cur = this.active.get(id);
      if (!cur) return;
      cur.target = 0;
    }
    this.onChange?.();
  }

  async toggle(id: string) {
    const cur = this.active.get(id);
    if (!cur) {
      await this.set(id, true);
      return;
    }
    cur.target = cur.target === 1 ? 0 : 1;
    // 重新激活时刷新顺序，保证"后按的覆盖先按的"
    if (cur.target === 1) cur.seq = this.seq++;
    this.onChange?.();
  }

  clear() {
    for (const a of this.active.values()) a.target = 0;
    this.onChange?.();
  }

  clearImmediate() {
    this.active.clear();
    this.onChange?.();
  }

  /** 每帧在 afterMotionUpdate 里调用 */
  update(core: CoreModel, dt: number) {
    // 1. 推进权重
    for (const [id, a] of [...this.active]) {
      const speed = a.target > a.weight ? a.fadeIn : a.fadeOut;
      const step = speed <= 0.001 ? 1 : dt / speed;
      a.weight += a.target - a.weight > 0 ? Math.min(step, a.target - a.weight) : Math.max(-step, a.target - a.weight);
      if (a.target === 0 && a.weight <= 0.0015) this.active.delete(id);
    }

    // 2. 收集本帧被占用的参数
    const order = [...this.active.values()].sort((a, b) => a.seq - b.seq);
    const write = new Set<string>();
    for (const a of order) {
      if (a.weight <= 0.0015) continue;
      for (const p of a.params) write.add(p.Id);
    }

    // 3. 交还：上一帧还占用、这一帧没人占用的参数 -> 恢复模型默认值
    for (const pid of [...this.owned]) {
      if (!write.has(pid)) {
        core.setParameterValueById(pid, this.defaultOf(pid));
        this.owned.delete(pid);
      }
    }
    if (write.size === 0) return;

    // 4. 覆盖式合成：从默认值出发，按激活顺序逐层覆盖
    const values = new Map<string, number>();
    for (const pid of write) values.set(pid, this.defaultOf(pid));
    for (const a of order) {
      if (a.weight <= 0.0015) continue;
      const w = clamp(a.weight, 0, 1);
      for (const p of a.params) {
        const cur = values.get(p.Id) ?? 0;
        values.set(p.Id, cur * (1 - w) + p.Value * w);
      }
    }
    for (const [pid, v] of values) {
      core.setParameterValueById(pid, v);
      this.owned.add(pid);
    }
  }
}
