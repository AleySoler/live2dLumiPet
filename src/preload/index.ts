import { contextBridge, ipcRenderer } from 'electron';
import type {
  ActionRequest,
  AppConfig,
  BootInfo,
  CursorPayload,
  CustomHotkey,
  DeepPartial,
  HotkeyStatus,
  RuntimeState,
} from '../shared/types';

function subscribe<T>(channel: string, cb: (payload: T) => void) {
  const handler = (_e: Electron.IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api = {
  boot: (mode: 'pet' | 'control') => ipcRenderer.invoke('app:boot', mode) as Promise<BootInfo>,

  /* ---- 配置 ---- */
  getConfig: () => ipcRenderer.invoke('config:get') as Promise<AppConfig>,
  updateConfig: (patch: DeepPartial<AppConfig>) => ipcRenderer.invoke('config:update', patch) as Promise<AppConfig>,
  resetConfig: () => ipcRenderer.invoke('config:reset') as Promise<AppConfig>,

  /* ---- 热键 ---- */
  hotkeyStatus: () => ipcRenderer.invoke('hotkeys:status') as Promise<HotkeyStatus[]>,
  fireHotkey: (id: string) => ipcRenderer.invoke('hotkeys:fire', id) as Promise<void>,
  addCustomHotkey: (hk: Omit<CustomHotkey, 'id'>) => ipcRenderer.invoke('hotkeys:add', hk) as Promise<AppConfig>,
  removeCustomHotkey: (id: string) => ipcRenderer.invoke('hotkeys:remove', id) as Promise<AppConfig>,

  /* ---- 动作 ---- */
  requestAction: (req: ActionRequest) => ipcRenderer.invoke('action:request', req) as Promise<void>,

  /* ---- 模型 ---- */
  listModels: () =>
    ipcRenderer.invoke('models:list') as Promise<{
      models: {
        id: string;
        name: string;
        kind: 'builtin' | 'user';
        dir: string;
        settings: string;
        counts: Record<string, number>;
        hasVts: boolean;
      }[];
      current: string;
    }>,
  setModel: (id: string) => ipcRenderer.invoke('models:set', id) as Promise<AppConfig>,
  importModel: () =>
    ipcRenderer.invoke('models:import') as Promise<{
      id: string;
      name: string;
      warnings: string[];
      counts: Record<string, number>;
    } | null>,
  deleteModel: (id: string) =>
    ipcRenderer.invoke('models:delete', id) as Promise<{
      models: { id: string; name: string; kind: 'builtin' | 'user' }[];
      current: string;
    }>,

  /* ---- 桌宠窗口控制 ---- */
  setIgnoreMouse: (ignore: boolean) => ipcRenderer.send('pet:ignore-mouse', ignore),
  // 拖动由主进程按 60Hz 读光标驱动，这里只发开始/结束
  dragStart: () => ipcRenderer.send('pet:drag-start'),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  scaleBy: (factor: number) => ipcRenderer.invoke('pet:scale', factor) as Promise<number>,
  showPetMenu: () => ipcRenderer.send('pet:menu'),
  resetModelState: () => ipcRenderer.send('pet:reset-state'),
  reportState: (state: RuntimeState) => ipcRenderer.send('state:report', state),
  requestState: () => ipcRenderer.invoke('state:get') as Promise<RuntimeState | null>,
  smokeReport: (payload: unknown) => ipcRenderer.send('smoke:report', payload),
  sendPreview: (dataUrl: string) => ipcRenderer.send('preview:frame', dataUrl),
  onPreviewFrame: (cb: (dataUrl: string) => void) => subscribe<string>('preview:frame', cb),
  setPreviewEnabled: (on: boolean) => ipcRenderer.send('preview:set', on),

  /* ---- 应用 ---- */
  openControl: () => ipcRenderer.send('control:open'),
  quit: () => ipcRenderer.send('app:quit'),

  /* ---- 事件 ---- */
  onAction: (cb: (req: ActionRequest) => void) => subscribe<ActionRequest>('action:fire', cb),
  onConfig: (cb: (cfg: AppConfig) => void) => subscribe<AppConfig>('config:changed', cb),
  /** 换模型后主进程会推一份新的 BootInfo（manifest/modelBase 都变了） */
  onBoot: (cb: (b: BootInfo) => void) => subscribe<BootInfo>('app:boot', cb),
  onHotkeyStatus: (cb: (s: HotkeyStatus[]) => void) => subscribe<HotkeyStatus[]>('hotkeys:status', cb),
  onState: (cb: (s: RuntimeState) => void) => subscribe<RuntimeState>('state:update', cb),
  onCommand: (cb: (c: string) => void) => subscribe<string>('ui:command', cb),
  onPreviewSet: (cb: (on: boolean) => void) => subscribe<boolean>('preview:set', cb),
  onTestImage: (cb: (dataUrl: string) => void) => subscribe<string>('tracking:test-image', cb),
  onCursor: (cb: (p: CursorPayload) => void) => subscribe<CursorPayload>('cursor:move', cb),
};

contextBridge.exposeInMainWorld('petAPI', api);

export type PetAPI = typeof api;
