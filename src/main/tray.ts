import { app, Menu, Tray, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import type { ConfigStore } from './store';
import type { WindowManager } from './windows';
import { setLang, t } from '../shared/i18n';

export class TrayController {
  private tray: Tray | null = null;

  constructor(
    private config: ConfigStore,
    private windows: WindowManager,
    private onToggleMouseControl: () => void,
    private onResetModelState: () => void,
  ) {}

  private iconPath() {
    const p = path.join(app.getAppPath(), 'dist', 'renderer', 'icon.png');
    return fs.existsSync(p) ? p : null;
  }

  buildMenu() {
    const cfg = this.config.get();
    const visible = this.windows.isPetVisible();
    return Menu.buildFromTemplate([
      { label: t('live2dLumiPet（lLP）'), enabled: false },
      { type: 'separator' },
      {
        label: t('打开控制台'),
        click: () => this.windows.createControl(),
      },
      {
        label: visible ? t('隐藏桌宠') : t('显示桌宠'),
        click: () => this.windows.togglePet(),
      },
      {
        // 勾选状态直接读配置，和控制台共用同一个字段，不会再各说各话
        label: t('鼠标控制（拖动 / 滚轮 / 右键）'),
        type: 'checkbox',
        checked: !!cfg.pet.mouseControl,
        click: () => this.onToggleMouseControl(),
      },
      {
        label: t('右键弹出窗口'),
        type: 'checkbox',
        checked: !!cfg.pet.rightClickMenu,
        click: (item) => this.config.update({ pet: { rightClickMenu: item.checked } }),
      },
      {
        label: t('始终置顶'),
        type: 'checkbox',
        checked: cfg.pet.alwaysOnTop,
        click: (item) => this.config.update({ pet: { alwaysOnTop: item.checked } }),
      },
      { type: 'separator' },
      {
        label: t('缩放'),
        submenu: [
          { label: t('放大 (110%)'), click: () => this.bumpScale(1.1) },
          { label: t('缩小 (90%)'), click: () => this.bumpScale(0.9) },
          { type: 'separator' },
          { label: t('重置为 100%'), click: () => this.config.update({ pet: { scale: 1 } }) },
        ],
      },
      {
        label: t('重置模型状态'),
        click: () => this.onResetModelState(),
      },
      { type: 'separator' },
      { label: t('退出'), click: () => app.quit() },
    ]);
  }

  private bumpScale(factor: number) {
    const cur = this.config.get().pet.scale;
    const next = Math.min(1.8, Math.max(0.35, Math.round(cur * factor * 100) / 100));
    this.config.update({ pet: { scale: next } });
  }

  ensure() {
    if (this.tray) return;
    const icon = this.iconPath();
    const img = icon ? nativeImage.createFromPath(icon).resize({ width: 20, height: 20 }) : nativeImage.createEmpty();
    this.tray = new Tray(img);
    this.tray.setToolTip(t('live2dLumiPet（lLP）桌宠'));
    this.tray.setContextMenu(this.buildMenu());
    // 左键打开控制台；双击切换显示/隐藏已按要求移除
    this.tray.on('click', () => this.windows.createControl());
  }

  refresh() {
    this.tray?.setContextMenu(this.buildMenu());
  }

  popup() {
    this.ensure();
    this.tray?.popUpContextMenu(this.buildMenu());
  }

  destroy() {
    this.tray?.destroy();
    this.tray = null;
  }
}
