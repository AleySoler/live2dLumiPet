import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { clamp } from '../../shared/config';
import { emptyFrame, type FaceFrame } from './params';

export interface TrackerOptions {
  wasmBase: string;
  modelPath: string;
  deviceId: string | null;
  mirror: boolean;
  delegate?: 'GPU' | 'CPU';
  /** 每秒最多推理多少次 */
  maxFps?: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * MediaPipe FaceLandmarker 封装：
 *  - 478 个关键点 + 52 个 ARKit 风格 blendshape + 4x4 面部变换矩阵
 *  - 姿态角来自变换矩阵，眼睛/嘴部来自 blendshape，视线来自虹膜关键点
 *  - 推理统一走一张 2D canvas：直接把 <video> 交给 MediaPipe 时，
 *    隐藏/1px 的 video 元素可能拿不到新帧（这是"能看见人却检测不到脸"的元凶）
 */
export class FaceTracker {
  landmarker: FaceLandmarker | null = null;
  video: HTMLVideoElement;
  stream: MediaStream | null = null;
  lastError: string | null = null;
  detectFps = 0;
  delegate: 'GPU' | 'CPU' = 'GPU';
  private work: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private lastDetect = 0;
  private ts = 0;
  private frameCounter = 0;
  private fpsT = 0;
  private maxFps = 24;
  lastFrame: FaceFrame | null = null;

  constructor() {
    const v = document.createElement('video');
    v.autoplay = true;
    v.playsInline = true;
    v.muted = true;
    v.style.position = 'fixed';
    v.style.left = '-99999px';
    v.style.width = '2px';
    v.style.height = '2px';
    v.style.opacity = '0.01';
    document.body.appendChild(v);
    this.video = v;
    this.work = document.createElement('canvas');
    this.work.width = 640;
    this.work.height = 480;
    this.ctx = this.work.getContext('2d', { willReadFrequently: false });
  }

  async init(opts: TrackerOptions) {
    if (this.landmarker) return;
    this.maxFps = opts.maxFps ?? 24;
    const vision = await FilesetResolver.forVisionTasks(opts.wasmBase);
    const build = async (delegate: 'GPU' | 'CPU') =>
      FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: opts.modelPath, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: 0.35,
        minFacePresenceConfidence: 0.35,
        minTrackingConfidence: 0.35,
      });
    const wanted = opts.delegate ?? 'GPU';
    try {
      this.landmarker = await build(wanted);
      this.delegate = wanted;
    } catch (err) {
      console.warn('[tracking] GPU delegate 不可用，回退 CPU', err);
      this.landmarker = await build('CPU');
      this.delegate = 'CPU';
    }
    this.lastError = null;
  }

  async openCamera(opts: TrackerOptions) {
    await this.closeCamera();
    const constraints: MediaStreamConstraints = {
      audio: false,
      video: opts.deviceId
        ? { deviceId: { exact: opts.deviceId }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }
        : { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => undefined);
    await new Promise<void>((resolve) => {
      if (this.video.readyState >= 2) return resolve();
      this.video.onloadeddata = () => resolve();
      setTimeout(resolve, 3000);
    });
    this.ts = 0;
  }

  async closeCamera() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.lastFrame = null;
  }

  get running() {
    return !!this.stream && !!this.landmarker;
  }

  /** 每次调用最多做一次推理，避免重复处理同一帧 */
  detect(nowMs: number): FaceFrame | null {
    if (!this.landmarker || !this.stream || this.video.readyState < 2) return null;
    if (this.video.videoWidth === 0) return null;
    if (nowMs - this.lastDetect < 1000 / this.maxFps) return this.lastFrame;
    this.lastDetect = nowMs;

    // 先拷进 canvas，保证 MediaPipe 拿到的一定是"这一帧"画面
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const scale = Math.min(1, 640 / vw);
    const cw = Math.round(vw * scale);
    const ch = Math.round(vh * scale);
    if (this.work.width !== cw || this.work.height !== ch) {
      this.work.width = cw;
      this.work.height = ch;
    }
    const ctx = this.ctx;
    if (!ctx) return this.lastFrame;
    try {
      ctx.drawImage(this.video, 0, 0, cw, ch);
    } catch (err) {
      this.lastError = '取帧失败: ' + String(err);
      return this.lastFrame;
    }

    this.ts = Math.max(this.ts + 1, Math.round(nowMs));
    let res;
    try {
      res = this.landmarker.detectForVideo(this.work, this.ts);
    } catch (err) {
      this.lastError = String(err);
      return this.lastFrame;
    }

    this.frameCounter++;
    if (nowMs - this.fpsT > 1000) {
      this.detectFps = (this.frameCounter * 1000) / (nowMs - this.fpsT);
      this.frameCounter = 0;
      this.fpsT = nowMs;
    }

    const lm = res.faceLandmarks?.[0];
    if (!lm || lm.length < 468) {
      this.lastFrame = null;
      return null;
    }
    const frame = buildFaceFrame(lm, res);
    this.lastFrame = frame;
    return frame;
  }

  private buildFrame(lm: any[], res: any): FaceFrame {
    return buildFaceFrame(lm, res);
  }
}

/** 从 MediaPipe 的检测结果构造一帧 FaceFrame（供实时追踪与离线自检复用） */
export function buildFaceFrame(lm: any[], res: any): FaceFrame {
  const f = emptyFrame();
  f.found = true;

  // --- 姿态：来自 4x4 列主序矩阵 ---
  const matrixData: number[] | undefined = res.facialTransformationMatrixes?.[0]?.data;
  if (matrixData && matrixData.length >= 16) {
    const m = matrixData;
    const m02 = m[8];
    const m10 = m[1];
    const m11 = m[5];
    const m12 = m[9];
    const m22 = m[10];
    const yaw = Math.atan2(m02, m22);
    const pitch = Math.asin(clamp(-m12, -1, 1));
    const roll = Math.atan2(m10, m11);
    const R2D = 180 / Math.PI;
    // MediaPipe 的 +x 指向图像右侧 / +y 向下。
    // 实测 pitch 的符号与 Live2D 的 ParamAngleY 相反，这里取反，抬头才会抬头。
    f.angleX = yaw * R2D; // 左右摇头
    f.angleY = -pitch * R2D; // 上下点头
    f.angleZ = -roll * R2D; // 歪头
  }

  // --- blendshape ---
  const cats: { categoryName: string; score: number }[] = res.faceBlendshapes?.[0]?.categories ?? [];
  const bs = new Map<string, number>();
  for (const c of cats) bs.set(c.categoryName, c.score);
  const get = (k: string) => clamp01(bs.get(k) ?? 0);

  f.eyeL = clamp01(1 - get('eyeBlinkLeft'));
  f.eyeR = clamp01(1 - get('eyeBlinkRight'));
  f.eyeWideL = get('eyeWideLeft');
  f.eyeWideR = get('eyeWideRight');
  f.mouthOpen = clamp01(get('jawOpen'));
  f.mouthSmile = clamp01((get('mouthSmileLeft') + get('mouthSmileRight')) * 0.5);
  f.mouthSmileL = get('mouthSmileLeft');
  f.mouthSmileR = get('mouthSmileRight');
  f.brow = clamp01(0.45 + get('browInnerUp') * 0.5 - ((get('browDownLeft') + get('browDownRight')) * 0.5) * 0.25);
  f.browInnerUp = get('browInnerUp');
  f.cheekPuff = get('cheekPuff');
  f.mouthPucker = get('mouthPucker');
  f.mouthFunnel = get('mouthFunnel');
  f.mouthShrug = (get('mouthShrugUpper') + get('mouthShrugLower')) * 0.5;
  f.tongueOut = get('tongueOut');
  f.squintL = get('eyeSquintLeft');
  f.squintR = get('eyeSquintRight');
  f.mouthX = clamp((get('mouthRight') - get('mouthLeft')) * 0.5, -1, 1);

  // --- 视线：虹膜中心相对眼眶中心 ---
  if (lm.length >= 478) {
    const g = (irisIdx: number[], outer: number, inner: number) => {
      const ic = centroid(lm, irisIdx);
      const a = lm[outer];
      const b = lm[inner];
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const w = Math.hypot(a.x - b.x, a.y - b.y) || 1e-6;
      return { x: ((ic.x - cx) / w) * 3.2, y: ((ic.y - cy) / w) * 3.2 };
    };
    const left = g([468, 469, 470, 471, 472], 33, 133);
    const right = g([473, 474, 475, 476, 477], 362, 263);
    f.eyeBallX = clamp((left.x + right.x) / 2, -1, 1);
    f.eyeBallY = clamp((left.y + right.y) / 2, -1, 1);
  }

  f.confidence = 1;
  return f;
}

function centroid(lm: any[], idx: number[]) {
  let x = 0;
  let y = 0;
  for (const i of idx) {
    x += lm[i].x;
    y += lm[i].y;
  }
  return { x: x / idx.length, y: y / idx.length };
}
