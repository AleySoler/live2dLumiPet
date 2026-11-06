import { app } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import type { AppConfig, DeepPartial, ModelManifest } from '../shared/types';
import { createDefaultConfig, mergeConfig } from '../shared/config';

const CONFIG_FILE = 'config.json';

export interface ModelLocation {
  id: string;
  /** 磁盘根目录 */
  root: string;
  /** app:// 协议根，末尾一定带 / */
  urlBase: string;
  kind: 'builtin' | 'user';
}

export function rendererRoot(): string {
  return path.join(app.getAppPath(), 'dist', 'renderer');
}

export function bundledModelDir(id: string): string {
  return path.join(rendererRoot(), 'model', id);
}

export function userModelsDir(): string {
  return path.join(app.getPath('userData'), 'models');
}

/**
 * 改名后的一次性迁移：只搬**配置**。
 *
 * 这里刻意不搬模型目录。早期版本做了一个"当前没有模型就从旧目录补拷"的自愈迁移，
 * 结果用户把模型删光之后、下次启动又会被搬回来，表现为"模型删不掉"。
 * 模型的归属应该完全由用户在「模型」页决定，程序不该自作主张恢复。
 */
export function migrateLegacyUserData() {
  const appData = app.getPath('appData');
  const current = app.getPath('userData');
  const legacyDirs = ['Live2DPet', 'LumiPet', 'DeepSeek-chan Desktop Pet']
    .map((n) => path.join(appData, n))
    .filter((p) => path.resolve(p) !== path.resolve(current) && fs.existsSync(p));
  if (!legacyDirs.length) return;

  const cfgPath = path.join(current, CONFIG_FILE);
  if (fs.existsSync(cfgPath)) return;
  const from = legacyDirs.find((d) => fs.existsSync(path.join(d, CONFIG_FILE)));
  if (!from) return;
  try {
    fs.mkdirSync(current, { recursive: true });
    fs.copyFileSync(path.join(from, CONFIG_FILE), cfgPath);
    console.log('[app] 已迁移配置文件:', from);
  } catch (err) {
    console.warn('[app] 配置迁移失败', err);
  }
}

export function resolveModel(id: string): ModelLocation {
  const builtin = bundledModelDir(id);
  if (fs.existsSync(path.join(builtin, 'manifest.json'))) {
    return { id, root: builtin, urlBase: `app://bundle/model/${id}/`, kind: 'builtin' };
  }
  const user = path.join(userModelsDir(), id);
  return { id, root: user, urlBase: `app://user/${id}/`, kind: 'user' };
}

export function readManifest(modelDir: string): ModelManifest {
  const file = path.join(modelDir, 'manifest.json');
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw) as ModelManifest;
}

/** 无模型模式下使用的占位清单：字段齐全但内容为空，让配置与界面逻辑不必到处判空 */
export const NO_MODEL_ID = '__none__';

export function emptyManifest(): ModelManifest {
  return {
    id: NO_MODEL_ID,
    name: '',
    version: 1,
    settings: '',
    credit: { illustration: '', rigging: '', note: '' },
    idle: { group: 'Idle', lostMotion: null, idleMotion: null },
    expressions: [],
    motions: [],
    hotkeys: [],
    paramMap: [],
    paramNames: {},
    counts: {},
  };
}

/**
 * 只读地取出配置里记录的 modelId。
 * 启动时必须先知道"上次用的是哪个模型"，才能读到对应的 manifest ——
 * 否则切换到导入模型后重启会退回内置模型。
 */
export function readStoredModelId(): string | null {
  try {
    const file = path.join(app.getPath('userData'), CONFIG_FILE);
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { modelId?: string };
    return typeof raw.modelId === 'string' && raw.modelId ? raw.modelId : null;
  } catch {
    return null;
  }
}

/** 列出可用模型（内置 + 用户导入） */
export function listModels(): {
  id: string;
  name: string;
  kind: 'builtin' | 'user';
  dir: string;
  settings: string;
  counts: Record<string, number>;
  hasVts: boolean;
}[] {
  const out: {
    id: string;
    name: string;
    kind: 'builtin' | 'user';
    dir: string;
    settings: string;
    counts: Record<string, number>;
    hasVts: boolean;
  }[] = [];
  const builtinRoot = path.join(rendererRoot(), 'model');
  if (fs.existsSync(builtinRoot)) {
    for (const entry of fs.readdirSync(builtinRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(builtinRoot, entry.name);
      const mf = path.join(dir, 'manifest.json');
      if (!fs.existsSync(mf)) continue;
      try {
        const m = JSON.parse(fs.readFileSync(mf, 'utf8')) as ModelManifest;
        out.push({
          id: m.id ?? entry.name,
          name: m.name ?? entry.name,
          kind: 'builtin',
          dir,
          settings: m.settings,
          counts: m.counts ?? {},
          hasVts: !!m.vtsModelId,
        });
      } catch {
        /* ignore corrupt */
      }
    }
  }
  const uRoot = userModelsDir();
  if (fs.existsSync(uRoot)) {
    for (const entry of fs.readdirSync(uRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(uRoot, entry.name);
      const mf = path.join(dir, 'manifest.json');
      if (!fs.existsSync(mf)) continue;
      try {
        const m = JSON.parse(fs.readFileSync(mf, 'utf8')) as ModelManifest;
        out.push({
          id: m.id ?? entry.name,
          name: m.name ?? entry.name,
          kind: 'user',
          dir,
          settings: m.settings,
          counts: m.counts ?? {},
          hasVts: !!m.vtsModelId,
        });
      } catch {
        /* ignore */
      }
    }
  }
  return out;
}

/**
 * 配置仓：磁盘持久化 + 变更广播。
 * 读取时总是以 manifest 为基准补齐/裁剪快捷键项，避免模型更新后配置失配。
 */
export class ConfigStore extends EventEmitter {
  private file: string;
  private config!: AppConfig;
  private manifest!: ModelManifest;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.file = path.join(app.getPath('userData'), CONFIG_FILE);
  }

  init(manifest: ModelManifest): AppConfig {
    this.manifest = manifest;
    const defaults = createDefaultConfig(manifest);
    let loaded: DeepPartial<AppConfig> | null = null;
    try {
      if (fs.existsSync(this.file)) {
        loaded = JSON.parse(fs.readFileSync(this.file, 'utf8')) as DeepPartial<AppConfig>;
      }
    } catch (err) {
      console.warn('[config] 读取失败，使用默认值', err);
    }
    this.config = mergeConfig(defaults, loaded);
    const before = Number(this.config.version) || 1;
    this.migrate();
    this.reconcile();
    // 迁移过就立刻落盘，保证磁盘上的结构和新版本一致
    if (Number(this.config.version) > before) this.scheduleSave(true);
    return this.config;
  }

  /** 版本迁移：老配置里的字段语义变化在这里统一修正 */
  private migrate() {
    const v = Number(this.config.version) || 1;
    if (v < 2) {
      // v1 默认 renderScale=1（为性能牺牲清晰度），v2 改成"自动跟随显示器缩放"
      this.config.misc.renderScale = 0;
      this.config.version = 2;
    }
    if (v < 3) {
      // v2: pet.passthrough(true=全穿透) + pet.dragEnabled
      // v3: 合并成 pet.mouseControl(true=模型接收鼠标) + 新增 pet.rightClickMenu
      const old = this.config.pet as { passthrough?: boolean; dragEnabled?: boolean };
      this.config.pet.mouseControl = !(old.passthrough === true);
      this.config.pet.rightClickMenu = true;
      delete old.passthrough;
      delete old.dragEnabled;
      this.config.version = 3;
    }
    if (v < 4) {
      // v4: 新增界面语言，老配置默认中文
      if (!['en', 'ja', 'zh-Hant'].includes(this.config.misc.language)) {
        this.config.misc.language = 'zh';
      }
      this.config.version = 4;
    }
  }

  /** 与 manifest 对齐：补新增热键、删已移除热键、paramMap 结构校验 */
  private reconcile() {
    const defaults = createDefaultConfig(this.manifest);
    const hk = this.config.hotkeys ?? {};
    const next: AppConfig['hotkeys'] = {};
    for (const def of this.manifest.hotkeys) {
      const cur = hk[def.id];
      next[def.id] = {
        enabled: cur ? !!cur.enabled : true,
        accelerator: cur ? (cur.accelerator ?? null) : def.defaultAccelerator,
      };
    }
    this.config.hotkeys = next;

    if (!Array.isArray(this.config.params) || this.config.params.length === 0) {
      this.config.params = defaults.params;
    } else {
      // 保证 manifest 里的映射项存在（用户可能删过）
      const byOutput = new Map(this.config.params.map((p) => [p.output + '|' + (p.input ?? ''), p]));
      for (const d of defaults.params) {
        const key = d.output + '|' + (d.input ?? '');
        if (!byOutput.has(key)) this.config.params.push({ ...d });
      }
    }
    this.config.modelId = this.manifest.id;
  }

  get(): AppConfig {
    return this.config;
  }

  getManifest(): ModelManifest {
    return this.manifest;
  }

  update(patch: DeepPartial<AppConfig>, opts: { immediate?: boolean } = {}): AppConfig {
    this.config = mergeConfig(this.config, patch);
    this.reconcile();
    // 把 patch 一起抛出去：监听方可以据此只做必要的工作（例如只有热键变动才重注册）
    this.emit('changed', this.config, patch);
    this.scheduleSave(opts.immediate);
    return this.config;
  }

  reset(): AppConfig {
    this.config = createDefaultConfig(this.manifest);
    this.emit('changed', this.config, {});
    this.scheduleSave(true);
    return this.config;
  }

  /**
   * 切换模型：换上新的 manifest 并重建热键/参数映射。
   *
   * 必须换 manifest 而不是只改 modelId —— 不同模型的热键 ID、参数表白名单完全不同，
   * 只改 id 会让 reconcile() 继续对着旧模型裁剪热键，结果就是"换了模型但热键全失效"。
   */
  useModel(id: string, manifest: ModelManifest): AppConfig {
    this.manifest = manifest;
    this.config.modelId = manifest.id;
    // 换模型等于换一套资源：热键与参数映射整体重建，窗口位置/缩放这些保留
    this.config.hotkeys = {};
    this.config.params = [];
    this.config.customHotkeys = [];
    this.reconcile();
    /**
     * 这里必须把 hotkeys/params 放进 patch。
     * 下游 applyConfigChange 只在 "patch 里含 hotkeys" 时才调用 shortcuts.apply()，
     * 早先传空对象 {} 会导致换模型后全局热键不重建 —— 按键还指着旧模型的 id，
     * 按下去等于打空（表现为"切换模型后按键全部失效"）。
     */
    this.emit('changed', this.config, {
      modelId: manifest.id,
      hotkeys: this.config.hotkeys,
      params: this.config.params,
    });
    this.scheduleSave(true);
    return this.config;
  }

  scheduleSave(immediate = false) {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (immediate) {
      void this.saveNow();
      return;
    }
    this.saveTimer = setTimeout(() => void this.saveNow(), 400);
  }

  async saveNow() {
    try {
      await fsp.mkdir(path.dirname(this.file), { recursive: true });
      await fsp.writeFile(this.file, JSON.stringify(this.config, null, 2), 'utf8');
    } catch (err) {
      console.error('[config] 保存失败', err);
    }
  }
}
