import { globalShortcut } from 'electron';
import type { ConfigStore } from './store';
import type { HotkeyStatus } from '../shared/types';
import { effectiveHotkeys } from '../shared/config';
import { isModifierOnly, looksValidAccelerator } from '../shared/hotkeys';

/**
 * 全局快捷键注册器。
 * 快捷键表 = manifest 从 .vtube.json 解析出来的 27 条 + 用户自建条目。
 * 每次配置变更后整体重建，并把注册结果（冲突/失败原因）回传给 UI。
 */
export class ShortcutManager {
  private statuses: HotkeyStatus[] = [];
  private byAccelerator = new Map<string, string>();
  private onFire: (hotkeyId: string) => void;

  constructor(private config: ConfigStore, onFire: (hotkeyId: string) => void) {
    this.onFire = onFire;
  }

  apply() {
    globalShortcut.unregisterAll();
    this.byAccelerator.clear();
    const manifest = this.config.getManifest();
    const cfg = this.config.get();
    const list = effectiveHotkeys(manifest, cfg);

    const statuses: HotkeyStatus[] = [];
    const seen = new Map<string, string>();

    for (const hk of list) {
      const acc = (hk.accelerator ?? '').trim();
      if (!hk.enabled) {
        statuses.push({ id: hk.id, accelerator: acc || null, ok: false, error: '已停用' });
        continue;
      }
      if (!acc) {
        statuses.push({ id: hk.id, accelerator: null, ok: false, error: '未绑定' });
        continue;
      }
      if (!looksValidAccelerator(acc) || isModifierOnly(acc)) {
        statuses.push({ id: hk.id, accelerator: acc, ok: false, error: '组合键不完整' });
        continue;
      }
      const dup = seen.get(acc.toLowerCase());
      if (dup) {
        statuses.push({ id: hk.id, accelerator: acc, ok: false, error: `与「${dup}」重复` });
        continue;
      }
      seen.set(acc.toLowerCase(), hk.name);

      let ok = false;
      try {
        ok = globalShortcut.register(acc, () => this.onFire(hk.id));
      } catch (err) {
        statuses.push({ id: hk.id, accelerator: acc, ok: false, error: String(err) });
        continue;
      }
      if (ok) this.byAccelerator.set(acc.toLowerCase(), hk.id);
      statuses.push(
        ok ? { id: hk.id, accelerator: acc, ok: true } : { id: hk.id, accelerator: acc, ok: false, error: '被其他程序占用' },
      );
    }
    this.statuses = statuses;
    const bad = statuses.filter((s) => !s.ok && s.error !== '已停用').length;
    console.log(`[hotkeys] 注册 ${this.byAccelerator.size} 条，异常 ${bad} 条`);
    return statuses;
  }

  getStatuses(): HotkeyStatus[] {
    return this.statuses;
  }

  dispose() {
    globalShortcut.unregisterAll();
    this.byAccelerator.clear();
  }
}
