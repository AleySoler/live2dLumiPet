/**
 * 全局共享类型：主进程 / 预加载 / 两个渲染进程共用
 */

export type HotkeyKind = 'expression' | 'motion' | 'clear-expressions';

export interface HotkeyDef {
  id: string;
  /** VTube Studio 里的原始热键名，如 "兔牙" */
  name: string;
  /** 资源本身的名字（表情名 / 动画名） */
  label: string;
  kind: HotkeyKind;
  /** 相对模型根的资源路径，如 expressions/exp-03.exp3.json */
  asset: string | null;
  assetId: string | null;
  duration: number;
  vtsName: string;
  vtsAction: string;
  vtsTriggers: { t1: string; t2: string; t3: string };
  defaultAccelerator: string | null;
}

export interface ParamMapping {
  name: string;
  input: string | null;
  output: string;
  inLower: number;
  inUpper: number;
  outLower: number;
  outUpper: number;
  smoothing: number;
  blink: boolean;
  breath: boolean;
  clampInput: boolean;
  clampOutput: boolean;
  /** 用户在面板里停用某条映射 */
  disabled?: boolean;
}

export interface ExpressionDef {
  id: string;
  file: string;
  label: string;
  srcName: string;
  fadeIn: number;
  fadeOut: number;
  paramCount: number;
}

export interface MotionDef {
  id: string;
  file: string;
  label: string;
  group: 'Idle' | 'Action';
  duration: number;
  isIdle: boolean;
  curveCount: number;
}

export interface ModelManifest {
  id: string;
  name: string;
  version: number;
  settings: string;
  vtsModelId?: string;
  credit: { illustration: string; rigging: string; note: string };
  idle: { group: string; lostMotion: string | null; idleMotion: string | null };
  expressions: ExpressionDef[];
  motions: MotionDef[];
  hotkeys: HotkeyDef[];
  paramMap: ParamMapping[];
  paramNames: Record<string, string>;
  counts: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* 配置                                                                */
/* ------------------------------------------------------------------ */

export interface PetWindowConfig {
  scale: number;
  x: number | null;
  y: number | null;
  alwaysOnTop: boolean;
  /**
   * 鼠标控制（统一的输入开关）。
   * true  = 模型接收鼠标：左键拖动、滚轮缩放、右键菜单、双击开控制台
   * false = 完全穿透：整个窗口不接收任何鼠标事件，点击一律落到后面的界面
   */
  mouseControl: boolean;
  /** 右键模型是否弹出菜单（关闭后右键不弹窗） */
  rightClickMenu: boolean;
  opacity: number;
  showOnAllWorkspaces: boolean;
  hideTaskbarIcon: boolean;
  /** 旧字段，仅用于配置迁移 */
  passthrough?: boolean;
  /** 旧字段，仅用于配置迁移 */
  dragEnabled?: boolean;
}

export interface TrackingConfig {
  enabled: boolean;
  deviceId: string | null;
  mirror: boolean;
  deadzone: number;
  gainX: number;
  gainY: number;
  gainZ: number;
  gainEye: number;
  gainMouth: number;
  smooth: number;
  neutralX: number;
  neutralY: number;
  neutralZ: number;
  invertX: boolean;
  invertY: boolean;
  invertZ: boolean;
  /** 眨眼/瞪眼幅度（越大越容易闭死、越容易瞪圆） */
  gainBlink: number;
  /** 鼠标注视范围：1 = 整块屏幕，>1 更灵敏 */
  cursorRange: number;
  lostTimeoutMs: number;
  driveBody: boolean;
}

export interface HotkeyBinding {
  enabled: boolean;
  accelerator: string | null;
}

/** 用户自建热键（可绑定模型库里的任意表情/动作） */
export interface CustomHotkey {
  id: string;
  name: string;
  kind: HotkeyKind;
  assetId: string | null;
  accelerator: string | null;
  enabled: boolean;
}

/** 统一解析后的热键（manifest 内置 + 用户自建） */
export interface ResolvedHotkey {
  id: string;
  name: string;
  label: string;
  kind: HotkeyKind;
  assetId: string | null;
  asset: string | null;
  duration: number;
  accelerator: string | null;
  enabled: boolean;
  source: 'vts' | 'custom';
  vtsTriggers?: { t1: string; t2: string; t3: string };
}

export interface MiscConfig {
  launchAtLogin: boolean;
  /** 界面语言：zh / zh-Hant / en / ja */
  language: 'zh' | 'zh-Hant' | 'en' | 'ja';
  /** 模型是否启用（关闭 = 卸载模型、桌宠不渲染；不是隐藏窗口） */
  modelEnabled: boolean;
  idleMotion: boolean;
  lostIdleMotion: boolean;
  breath: boolean;
  autoBlink: boolean;
  cursorLook: boolean;
  /** 隐藏模型鼻子处那两个会渲染成黑方块的占位 ArtMesh */
  hideNosePlaceholder: boolean;
  /** 渲染倍率：0 = 自动（跟随显示器缩放），>0 = 指定倍率 */
  renderScale: number;
  /** 表情/动作过渡时长倍率 */
  fadeScale: number;
  /** 物理演算开关（关掉可排查"尾巴/裙摆自己乱动"这类问题） */
  physics: boolean;
  /** 边缘反光（模型自带的 rim-light 网格）强度 0..1，0 = 隐藏 */
  edgeGlow: number;
  /** 彻底关闭所有边缘光效网格（不透明度直接归零，比变淡更干净） */
  hideEdgeGlow: boolean;
  /** 裁剪蒙版缓冲分辨率（Cubism 默认 256，模型越大越糊；调到 1024/2048 边缘更锐利） */
  maskResolution: number;
  petFpsCap: number;
  showDebugOverlay: boolean;
}

export interface AppConfig {
  version: number;
  modelId: string;
  pet: PetWindowConfig;
  tracking: TrackingConfig;
  hotkeys: Record<string, HotkeyBinding>;
  customHotkeys: CustomHotkey[];
  params: ParamMapping[];
  misc: MiscConfig;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? (T[K] extends Array<unknown> ? T[K] : DeepPartial<T[K]>) : T[K];
};

/* ------------------------------------------------------------------ */
/* IPC 载荷                                                            */
/* ------------------------------------------------------------------ */

/** 主进程 30Hz 推来的光标信息（坐标均为窗口内 CSS 像素） */
export interface CursorPayload {
  x: number;
  y: number;
  inside: boolean;
  /** 屏幕工作区尺寸（DIP），用于把"眼睛到鼠标"的距离换算成角度 */
  sw: number;
  sh: number;
}

export interface BootInfo {
  mode: 'pet' | 'control';
  config: AppConfig;
  manifest: ModelManifest;
  modelBase: string;
  appVersion: string;
  assetRoot: string;
  /** 用户导入模型的存放目录 */
  modelsDir: string;
  /** 当前有没有可用模型；没有时程序进入"无模型模式"（不加载、不渲染，但仍可打开控制台） */
  hasModel: boolean;
  platform: string;
}

export interface ActionRequest {
  kind: HotkeyKind | 'motion' | 'expression';
  assetId: string | null;
  hotkeyId?: string;
  label?: string;
}

export interface RuntimeState {
  loaded: boolean;
  fps: number;
  trackFps: number;
  tracking: boolean;
  faceFound: boolean;
  faceConfidence: number;
  angles: { x: number; y: number; z: number };
  eyeOpen: { l: number; r: number };
  mouthOpen: number;
  activeExpressions: string[];
  currentMotion: string | null;
  trackingLost: boolean;
  error: string | null;
}

export interface HotkeyStatus {
  id: string;
  accelerator: string | null;
  ok: boolean;
  error?: string;
}
