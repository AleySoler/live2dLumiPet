import type {
  AppConfig,
  CustomHotkey,
  DeepPartial,
  HotkeyBinding,
  ModelManifest,
  ParamMapping,
  ResolvedHotkey,
} from './types';

export function createDefaultConfig(manifest: ModelManifest): AppConfig {
  const hotkeys: Record<string, HotkeyBinding> = {};
  for (const hk of manifest.hotkeys) {
    hotkeys[hk.id] = { enabled: true, accelerator: hk.defaultAccelerator };
  }

  return {
    version: 4,
    modelId: manifest.id,
    pet: {
      scale: 1,
      x: null,
      y: null,
      alwaysOnTop: true,
      mouseControl: true,
      rightClickMenu: true,
      opacity: 1,
      showOnAllWorkspaces: true,
      hideTaskbarIcon: true,
    },
    tracking: {
      enabled: false,
      deviceId: null,
      mirror: true,
      deadzone: 0.6,
      gainX: 1,
      gainY: 1,
      gainZ: 1,
      gainEye: 1,
      gainMouth: 1,
      smooth: 35,
      neutralX: 0,
      neutralY: 0,
      neutralZ: 0,
      invertX: false,
      invertY: false,
      invertZ: false,
      gainBlink: 1.2,
      cursorRange: 1,
      lostTimeoutMs: 3500,
      driveBody: true,
    },
    hotkeys,
    customHotkeys: [],
    params: cloneParams(manifest.paramMap),
    misc: {
      launchAtLogin: false,
      language: 'zh',
      modelEnabled: true,
      idleMotion: true,
      lostIdleMotion: true,
      breath: true,
      autoBlink: true,
      cursorLook: true,
      hideNosePlaceholder: true,
      renderScale: 0,
      fadeScale: 1,
      physics: true,
      // 模型自带的 rim-light 网格边缘没处理好，满强度会溢出一圈蓝光；
      // 默认压到 35%，既能保留一点体积感又不刺眼，设置里可 0~100% 调
      edgeGlow: 0.35,
      hideEdgeGlow: false,
      // Cubism 默认 256 的裁剪蒙版会让被裁的光效层边缘出现阶梯块；
      // 本模型画布 3749×7697，1024 才能贴合轮廓。只在模型加载时设置一次（运行时重设会崩）。
      maskResolution: 1024,
      petFpsCap: 60,
      showDebugOverlay: false,
    },
  };
}

export function cloneParams(params: ParamMapping[]): ParamMapping[] {
  return params.map((p) => ({ ...p }));
}

/** 深合并（数组整体替换），并保证结构合法 */
export function mergeConfig(base: AppConfig, patch: DeepPartial<AppConfig> | undefined | null): AppConfig {
  if (!patch) return base;
  const out: AppConfig = JSON.parse(JSON.stringify(base));
  mergeInto(out as unknown as Record<string, unknown>, patch as unknown as Record<string, unknown>);
  return out;
}

function mergeInto(target: Record<string, unknown>, patch: Record<string, unknown>) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const cur = target[k];
    if (Array.isArray(v)) {
      target[k] = v;
    } else if (v && typeof v === 'object' && cur && typeof cur === 'object' && !Array.isArray(cur)) {
      mergeInto(cur as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      target[k] = v;
    }
  }
}

export function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * 把 VTube Studio 的 "smoothing"(0..100) 换算成 0..1 的每帧跟随系数。
 * VTS 的 smoothing 越大越"拖沓"。
 */
export function smoothingToAlpha(smoothing: number, dt: number): number {
  const s = clamp(smoothing, 0, 100) / 100;
  if (s <= 0.001) return 1;
  // 60fps 下 1 - exp(-dt/tau)，tau 随 smoothing 指数增长
  const tau = 0.012 + Math.pow(s, 1.6) * 1.2;
  return 1 - Math.exp(-dt / tau);
}

/** manifest 内置热键 + 用户自建热键 -> 统一列表 */
export function effectiveHotkeys(manifest: ModelManifest, config: AppConfig): ResolvedHotkey[] {
  const out: ResolvedHotkey[] = [];
  for (const hk of manifest.hotkeys) {
    const b = config.hotkeys?.[hk.id];
    out.push({
      id: hk.id,
      name: hk.name,
      label: hk.label,
      kind: hk.kind,
      assetId: hk.assetId,
      asset: hk.asset,
      duration: hk.duration,
      accelerator: b ? b.accelerator : hk.defaultAccelerator,
      enabled: b ? b.enabled : true,
      source: 'vts',
      vtsTriggers: hk.vtsTriggers,
    });
  }
  for (const c of config.customHotkeys ?? []) {
    out.push({
      id: c.id,
      name: c.name,
      label: c.name,
      kind: c.kind,
      assetId: c.assetId,
      asset: null,
      duration: 0,
      accelerator: c.accelerator,
      enabled: c.enabled,
      source: 'custom',
    });
  }
  return out;
}

/** 判断某条自建热键的定义是否仍然有效 */
export function isCustomHotkeyValid(hk: CustomHotkey, manifest: ModelManifest): boolean {
  if (hk.kind === 'clear-expressions') return true;
  if (!hk.assetId) return false;
  if (hk.kind === 'expression') return manifest.expressions.some((e) => e.id === hk.assetId);
  return manifest.motions.some((m) => m.id === hk.assetId);
}
