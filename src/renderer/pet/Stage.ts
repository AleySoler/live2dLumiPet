import { Application } from 'pixi.js';
import type { Live2DModel } from 'pixi-live2d-display/cubism4';

export interface StageOptions {
  container: HTMLElement;
  onError: (err: string) => void;
  resolution?: number;
}

/**
 * PIXI 舞台：
 *  - 透明背景、按设备像素比渲染
 *  - 自带 rAF 循环（不用 PIXI.Ticker），保证"渲染 -> 读像素"顺序可控
 *  - 模型自适应窗口、按倍率缩放
 */
export class Stage {
  app: Application;
  model: Live2DModel | null = null;
  private container: HTMLElement;
  private rafId = 0;
  private lastTs = 0;
  private fpsCount = 0;
  private fpsT = 0;
  private afterRenderCbs: (() => void)[] = [];
  /** 每帧回调（dt 秒），在渲染前调用 */
  onFrame: ((dt: number, now: number) => void) | null = null;
  fps = 0;
  running = false;
  private resScale: number;

  constructor(private opts: StageOptions) {
    this.container = opts.container;
    // 0 / 未指定 = 自动：直接按显示器缩放渲染，保证 1:1 物理像素，画面不会被拉伸糊掉
    this.resScale =
      opts.resolution && opts.resolution > 0 ? opts.resolution : Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
    this.app = new Application({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundAlpha: 0,
      backgroundColor: 0x000000,
      antialias: true,
      autoStart: false,
      // 桌宠默认 1x：显存/填充率省一半，配合抗锯齿已经够清晰
      resolution: this.resScale,
      autoDensity: true,
      powerPreference: 'high-performance',
      clearBeforeRender: true,
      preserveDrawingBuffer: true,
    });
    const view = this.app.view as unknown as HTMLCanvasElement;
    view.style.width = '100%';
    view.style.height = '100%';
    view.style.display = 'block';
    this.container.appendChild(view);
    window.addEventListener('resize', this.onResize);
    this.onResize();
  }

  private onResize = () => {
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
  };

  /** 卸载当前模型（与隐藏窗口无关：直接把 PIXI 对象销毁、舞台清空） */
  clearModel() {
    if (!this.model) return;
    try {
      this.app.stage.removeChild(this.model);
      this.model.destroy();
    } catch {
      /* ignore */
    }
    this.model = null;
  }

  async load(settingsUrl: string, opts: { motionPreload?: 'ALL' | 'IDLE' | 'NONE' } = {}) {
    const { Live2DModel: L2D } = await import('pixi-live2d-display/cubism4');
    const model = await L2D.from(settingsUrl, {
      autoUpdate: false,
      autoInteract: false,
      motionPreload: (opts.motionPreload ?? 'ALL') as never,
    });
    if (this.model) {
      this.app.stage.removeChild(this.model);
      this.model.destroy();
    }
    this.model = model;
    this.app.stage.addChild(model);
    return model;
  }

  /**
   * 按窗口大小自适应，scale 为相对倍率。
   *
   * 关键：基准尺寸只在第一次调用时确定，之后 **不再跟随窗口变化**。
   * 原因：Windows 在移动 transparent 无边框窗口时会时不时把窗口尺寸多算 1~2px，
   * 连续拖动几十帧就累积几十像素（实测一次长拖 938→945）。窗口大小本该是恒定的，
   * 所以这里把它锁死 —— 多出来的那几像素是透明区域，看不出来，模型也不会跟着变大小。
   * 只有尺寸变化超过 10%（真正的换屏/改分辨率）才重新取基准。
   */
  private fitBase: { w: number; h: number } | null = null;

  fit(scale = 1) {
    const model = this.model;
    if (!model) return;
    const w = this.app.renderer.width / this.app.renderer.resolution;
    const h = this.app.renderer.height / this.app.renderer.resolution;
    const qw = Math.max(16, Math.floor(w / 8) * 8);
    const qh = Math.max(16, Math.floor(h / 8) * 8);
    if (!this.fitBase) {
      this.fitBase = { w: qw, h: qh };
    } else if (Math.abs(qw - this.fitBase.w) > this.fitBase.w * 0.1 || Math.abs(qh - this.fitBase.h) > this.fitBase.h * 0.1) {
      this.fitBase = { w: qw, h: qh };
    }
    const bw = this.fitBase.w;
    const bh = this.fitBase.h;
    const im = (model as unknown as { internalModel: { width: number; height: number } }).internalModel;
    const mw = im.width;
    const mh = im.height;
    if (!mw || !mh) return;
    const base = Math.min((bw * 0.94) / mw, (bh * 0.98) / mh);
    const s = base * scale;
    model.scale.set(s);
    model.position.set((bw - mw * s) / 2, (bh - mh * s) / 2 + bh * 0.02);
  }

  onAfterRender(cb: () => void) {
    this.afterRenderCbs.push(cb);
    return () => {
      this.afterRenderCbs = this.afterRenderCbs.filter((c) => c !== cb);
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTs = performance.now();
    this.fpsT = this.lastTs;
    const loop = (ts: number) => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(loop);
      const dtMs = Math.min(120, ts - this.lastTs);
      this.lastTs = ts;
      const dt = dtMs / 1000;

      this.fpsCount++;
      if (ts - this.fpsT >= 500) {
        this.fps = (this.fpsCount * 1000) / (ts - this.fpsT);
        this.fpsCount = 0;
        this.fpsT = ts;
      }

      this.onFrame?.(dt, ts);
      if (this.model) this.model.update(dtMs);
      try {
        this.app.render();
      } catch (err) {
        this.opts.onError(String(err));
        return;
      }
      for (const cb of this.afterRenderCbs) {
        try {
          cb();
        } catch (err) {
          console.warn('[stage] afterRender failed', err);
        }
      }
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  get resolution() {
    return this.app.renderer.resolution;
  }

  /** 运行时切换渲染倍率（传 0 表示自动跟随显示器缩放） */
  setResolution(scale: number) {
    const next = scale > 0 ? Math.min(3, Math.max(0.5, scale)) : Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
    if (Math.abs(next - this.resScale) < 0.001) return;
    this.resScale = next;
    this.app.renderer.resolution = next;
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
  }

  get autoResolution() {
    return Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
  }

  /** 读取一块像素（页面坐标，左上原点），返回 RGBA 数据与尺寸 */
  readRegion(x: number, y: number, w: number, h: number): { data: Uint8Array; w: number; h: number } | null {
    const gl = (this.app.renderer as unknown as { gl: WebGLRenderingContext }).gl;
    if (!gl) return null;
    const res = this.app.renderer.resolution;
    const px = Math.max(0, Math.floor(x * res));
    const pw = Math.floor(w * res);
    const ph = Math.floor(h * res);
    const py = Math.max(0, Math.floor((window.innerHeight - y - h) * res));
    if (px + pw > gl.drawingBufferWidth || py + ph > gl.drawingBufferHeight) return null;
    const buf = new Uint8Array(pw * ph * 4);
    try {
      gl.readPixels(px, py, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    } catch {
      return null;
    }
    return { data: buf, w: pw, h: ph };
  }

  /** 读取某个页面坐标处的 RGBA（0..255） */
  readColorAt(clientX: number, clientY: number): [number, number, number, number] {
    const gl = (this.app.renderer as unknown as { gl: WebGLRenderingContext }).gl;
    if (!gl) return [0, 0, 0, 0];
    const res = this.app.renderer.resolution;
    const x = Math.floor(clientX * res);
    const y = Math.floor((window.innerHeight - clientY) * res);
    if (x < 0 || y < 0 || x >= gl.drawingBufferWidth || y >= gl.drawingBufferHeight) return [0, 0, 0, 0];
    const buf = new Uint8Array(4);
    try {
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    } catch {
      return [0, 0, 0, 0];
    }
    return [buf[0], buf[1], buf[2], buf[3]];
  }

  /** 下一帧渲染结束后同步采样一个像素 */
  sampleAfterFrame(clientX: number, clientY: number): Promise<[number, number, number, number]> {
    return new Promise((resolve) => {
      const off = this.onAfterRender(() => {
        off();
        resolve(this.readColorAt(clientX, clientY));
      });
    });
  }

  /** 读取某个页面坐标处的 alpha（0..255），用于透明区域点击穿透 */
  readAlphaAt(clientX: number, clientY: number): number {
    const gl = (this.app.renderer as unknown as { gl: WebGLRenderingContext }).gl;
    if (!gl) return 255;
    const res = this.app.renderer.resolution;
    const x = Math.floor(clientX * res);
    const y = Math.floor((window.innerHeight - clientY) * res);
    if (x < 0 || y < 0 || x >= gl.drawingBufferWidth || y >= gl.drawingBufferHeight) return 0;
    const buf = new Uint8Array(4);
    try {
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    } catch {
      return 255;
    }
    return buf[3];
  }

  /** 等到下一帧渲染结束 */
  nextFrame(): Promise<void> {
    return new Promise((resolve) => {
      const off = this.onAfterRender(() => {
        off();
        resolve();
      });
    });
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this.onResize);
    this.model?.destroy();
    this.app.destroy(true, { children: true });
  }
}

export function loadCubismCore(): Promise<void> {
  const w = window as unknown as Record<string, unknown>;
  if (w.Live2DCubismCore) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const url = new URL('vendor/live2dcubismcore.min.js', window.location.href).href;
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(async () => {
      let diag = 'n/a';
      try {
        const r = await fetch(url);
        const text = await r.text();
        diag = `fetch ${r.status}, ${text.length} chars, hasCore=${text.includes('Live2DCubismCore')}`;
      } catch (err) {
        diag = 'fetch 失败: ' + String(err);
      }
      done(() => reject(new Error(`Cubism Core 加载超时 (${url}) — ${diag}`)));
    }, 8000);

    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = () =>
      done(() => {
        if (w.Live2DCubismCore) resolve();
        else reject(new Error('脚本已加载但未注册 Live2DCubismCore 全局对象'));
      });
    s.onerror = () => done(() => reject(new Error('Cubism Core 脚本加载失败: ' + url)));
    document.head.appendChild(s);
  });
}
