import { BrowserWindow, screen, shell } from 'electron';
import path from 'node:path';
import { app } from 'electron';
import type { ConfigStore } from './store';
import { t } from '../shared/i18n';

const PRELOAD = () => path.join(app.getAppPath(), 'dist', 'preload', 'index.js');
/** 排查用：`--opaque` 用不透明背景启动桌宠窗口，验证窗口层级/显示是否正常 */
const OPAQUE_TEST = process.argv.includes('--opaque');

/** 把渲染进程的 console 转发到主进程 stdout，方便排查 */
function forwardConsole(win: BrowserWindow, tag: string) {
  const wc = win.webContents as unknown as {
    on: (ev: string, cb: (...args: any[]) => void) => void;
  };
  wc.on('console-message', (...args: any[]) => {
    // Electron >= 37: (event, details)；旧版: (event, level, message, line, sourceId)
    const d = args[1];
    if (d && typeof d === 'object' && 'message' in d) {
      const lvl = d.level ?? 'info';
      console.log(`[${tag}:${lvl}] ${d.message}  (${d.sourceId ?? ''}:${d.lineNumber ?? 0})`);
    } else {
      const level = args[1];
      const msg = args[2];
      console.log(`[${tag}:${level}] ${msg}  (${args[4] ?? ''}:${args[3] ?? 0})`);
    }
  });
  wc.on('render-process-gone', (...args: any[]) => {
    console.error(`[${tag}] 渲染进程崩溃`, args[1]);
  });
  wc.on('did-fail-load', (...args: any[]) => {
    console.error(`[${tag}] 页面加载失败`, args[2], args[3]);
  });
}

export class WindowManager {
  pet: BrowserWindow | null = null;
  control: BrowserWindow | null = null;

  /** 文件对话框需要一个父窗口，否则在某些环境下会跑到主窗口后面 */
  controlWindowForDialog() {
    return this.control && !this.control.isDestroyed() ? this.control : null;
  }

  private dragOffset: { x: number; y: number } | null = null;
  private lastDragPoint: { x: number; y: number } | null = null;
  private dragging = false;
  private dragTimer: NodeJS.Timeout | null = null;
  /** 创建时的内容尺寸，用于校正 Windows 在"部分出屏"时对窗口尺寸的偷改 */
  private petSize: { width: number; height: number } | null = null;
  private ignoringMouse = false;
  private cursorTimer: NodeJS.Timeout | null = null;
  private lastCursor = { x: -1, y: -1 };

  constructor(private config: ConfigStore) {}

  /* -------------------------------------------------------------- */
  private defaultPetBounds() {
    const display = screen.getPrimaryDisplay();
    const work = display.workArea;
    const height = Math.round(Math.min(work.height * 0.92, 1200));
    const width = Math.round(height * 0.72);
    const cfg = this.config.get().pet;
    const x = typeof cfg.x === 'number' ? cfg.x : work.x + work.width - width - 24;
    const y = typeof cfg.y === 'number' ? cfg.y : work.y + work.height - height - 8;
    return { x: Math.round(x), y: Math.round(y), width, height };
  }

  /**
   * 恢复位置时钳到可视区：
   * 换了分辨率/拔掉副屏之后，旧坐标可能整窗落在屏幕外，用户会"找不到桌宠"。
   * 这里保证至少有 120px × 120px 露在某个显示器的工作区里。
   */
  private clampToVisible(x: number, y: number, width: number, height: number) {
    const displays = screen.getAllDisplays();
    const margin = 120;
    const visible = displays.some((d) => {
      const w = d.workArea;
      return x + width > w.x + 40 && x < w.x + w.width - 40 && y + height > w.y + margin && y < w.y + w.height - margin;
    });
    if (visible) return { x, y, width, height };
    const work = screen.getPrimaryDisplay().workArea;
    return {
      x: work.x + work.width - width - 24,
      y: work.y + work.height - height - 8,
      width,
      height,
    };
  }

  /**
   * 把窗口位置限制在"至少还有一部分露在屏幕里"的范围。
   *
   * 注意不要做成"完全锁在屏内"：桌宠窗口高 938，工作区只有 1019，
   * 完全锁住的话纵向只剩 81px 活动范围，一拖就被推回去（上一版就是这么坏的）。
   * 这里只保证每个方向至少露出 minVisible 像素，其余随便放；
   * 出屏导致的"窗口尺寸被 Windows 偷改"由 dragTick 的实时校正兜住。
   */
  private clampPos(x: number, y: number, width: number, height: number) {
    const disp = screen.getDisplayNearestPoint({ x: Math.round(x + width / 2), y: Math.round(y + height / 2) });
    const wa = disp.workArea;
    const mx = Math.min(200, Math.round(width * 0.4));
    const my = Math.min(200, Math.round(height * 0.4));
    return {
      x: Math.round(Math.min(Math.max(x, wa.x - width + mx), wa.x + wa.width - mx)),
      y: Math.round(Math.min(Math.max(y, wa.y - height + my), wa.y + wa.height - my)),
    };
  }

  createPet(query = '') {
    if (this.pet && !this.pet.isDestroyed()) {
      this.pet.show();
      return this.pet;
    }
    const cfg = this.config.get().pet;
    const raw = this.defaultPetBounds();
    const clamped = this.clampPos(raw.x, raw.y, raw.width, raw.height);
    const bounds = this.clampToVisible(clamped.x, clamped.y, raw.width, raw.height);
    const win = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: !OPAQUE_TEST,
      backgroundColor: OPAQUE_TEST ? '#ff00ff' : '#00000000',
      hasShadow: false,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: cfg.hideTaskbarIcon,
      alwaysOnTop: cfg.alwaysOnTop,
      show: false,
      acceptFirstMouse: true,
      roundedCorners: false,
      webPreferences: {
        preload: PRELOAD(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
        webgl: true,
        spellcheck: false,
      },
    });

    win.setAlwaysOnTop(cfg.alwaysOnTop, 'floating');
    if (cfg.showOnAllWorkspaces) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setOpacity(cfg.opacity);

    forwardConsole(win, 'pet');
    win.once('ready-to-show', () => {
      win.showInactive();
    });
    // 透明窗口在部分 Windows 环境下 ready-to-show 不触发，这里再兜一层
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        if (!win.isDestroyed() && !win.isVisible()) win.showInactive();
        if (win.isDestroyed()) return;
        const [x, y] = win.getPosition();
        const [w, h] = win.getSize();
        // 记录"实际"尺寸（请求值和 Windows 最终值在高 DPI 下会差几像素），
        // 之后只用它做偏差检测，绝不拿请求值去纠正，否则会来回抖
        this.petSize = { width: w, height: h };
        console.log(`[pet] 窗口 ${win.isVisible() ? '已显示' : '未显示'} @ ${x},${y} ${w}x${h}`);
      }, 400);
    });

    win.on('closed', () => {
      this.pet = null;
      this.stopCursorPolling();
    });

    // 阻止页面内跳转/新窗口
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });

    void win.loadURL('app://bundle/pet.html' + query);
    this.pet = win;
    // 一律从"忽略鼠标"起步，避免窗口一出现就挡住点击；鼠标控制开启时由渲染层逐像素接管
    this.setIgnoreMouse(true);
    this.startCursorPolling();
    return win;
  }

  /**
   * 鼠标模式：
   *  - mouseControl = false：整窗忽略鼠标，点击全部落到后面的界面
   *  - mouseControl = true ：整窗先忽略，渲染层逐像素探测到光标压在模型上时再切回可交互
   * 这里只在关闭时强制穿透；开启时不动作，把控制权完全交给渲染层，
   * 否则每次配置变动都会把当前的可交互状态打断（表现为"刚点得住又点不住了"）。
   */
  private applyMouseMode() {
    if (!this.pet || this.pet.isDestroyed()) return;
    if (!this.config.get().pet.mouseControl) this.setIgnoreMouse(true);
  }

  createControl() {
    if (this.control && !this.control.isDestroyed()) {
      this.control.show();
      this.control.focus();
      return this.control;
    }
    const win = new BrowserWindow({
      width: 1200,
      height: 840,
      minWidth: 980,
      minHeight: 680,
      title: t('live2dLumiPet · 控制台'),
      // 不指定 icon：窗口与任务栏沿用可执行文件内嵌的图标（Electron 原子 logo）
      backgroundColor: '#0b1020',
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: PRELOAD(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        spellcheck: false,
      },
    });
    forwardConsole(win, 'control');
    win.once('ready-to-show', () => win.show());
    win.on('closed', () => {
      this.control = null;
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    void win.loadURL('app://bundle/control.html');
    this.control = win;
    return win;
  }

  /* -------------------------------------------------------------- */
  setIgnoreMouse(ignore: boolean) {
    if (!this.pet || this.pet.isDestroyed()) return;
    if (this.ignoringMouse === ignore) return;
    this.ignoringMouse = ignore;
    this.pet.setIgnoreMouseEvents(ignore, { forward: true });
  }

  /** 自检用：当前窗口是否处于"忽略鼠标"状态 */
  isIgnoringMouse() {
    return this.ignoringMouse;
  }

  /**
   * 拖动完全由主进程驱动。
   *
   * 之前是渲染层把 DOM 的 screenX/screenY 发过来再移动窗口，这条路有三个致命弱点：
   *  1. 光标一旦离开窗口，DOM 收不到 mousemove，拖动直接"卡住"；
   *  2. 逐像素穿透判定可能在拖动中途把窗口切成"忽略鼠标"，事件当场断掉；
   *  3. 丢帧时坐标会跳变，窗口被一次异常事件带到很远的错误位置。
   * 现在改成：主进程自己按 60Hz 读全局光标、按增量移动窗口 —— 鼠标永远追得上，
   * 不依赖任何 DOM 事件；渲染进程只负责发"开始/结束"两个信号。
   */
  beginDrag() {
    if (!this.pet || this.pet.isDestroyed()) return;
    this.dragging = true;
    this.lastDragPoint = screen.getCursorScreenPoint();
    // 拖动期间窗口必须保持可交互，否则会中途变成穿透态而丢失事件
    this.setIgnoreMouse(false);
    if (!this.dragTimer) this.dragTimer = setInterval(() => this.dragTick(), 16);
    const b0 = this.pet.getBounds();
    this.dbg('drag start', `${b0.width}x${b0.height} @${b0.x},${b0.y}`);
  }

  private dbg(tag: string, msg: string) {
    if (process.argv.includes('--logcursor')) console.log(`[${tag}] ${msg}`);
  }

  private dragTick() {
    if (!this.dragging || !this.pet || this.pet.isDestroyed()) return;
    const pt = screen.getCursorScreenPoint();
    const last = this.lastDragPoint;
    if (!last) {
      this.lastDragPoint = pt;
      return;
    }
    const dx = pt.x - last.x;
    const dy = pt.y - last.y;
    if (dx !== 0 || dy !== 0) {
      this.lastDragPoint = pt;
      const [x, y] = this.pet.getPosition();
      const b = this.pet.getBounds();
      const next = this.clampPos(x + dx, y + dy, b.width, b.height);
      // 用 setBounds 而不是 setPosition：每帧把尺寸一起显式写回去。
      // transparent 无边框窗口在部分出屏时，Windows 会借每次移动把尺寸多算 1~2px，
      // 连续拖动几十帧就累积成"模型越拖越大"。带上尺寸后这个累积没有机会发生。
      this.pet.setBounds({ x: next.x, y: next.y, width: b.width, height: b.height });
    }
  }

  isDragging() {
    return this.dragging;
  }

  endDrag(save = true) {
    if (!this.dragging) return;
    this.dragging = false;
    this.lastDragPoint = null;
    if (this.dragTimer) {
      clearInterval(this.dragTimer);
      this.dragTimer = null;
    }
    if (!this.pet || this.pet.isDestroyed()) return;
    const [x, y] = this.pet.getPosition();
    const b2 = this.pet.getBounds();
    this.dbg('drag end', `${b2.width}x${b2.height} @${x},${y}`);
    if (!save) return;
    this.config.update({ pet: { x, y } });
  }

  /** 把桌宠移到当前显示器工作区正中 */
  centerPet() {
    if (!this.pet || this.pet.isDestroyed()) return;
    const b = this.pet.getBounds();
    const wa = screen.getDisplayMatching(b).workArea;
    this.pet.setPosition(Math.round(wa.x + (wa.width - b.width) / 2), Math.round(wa.y + (wa.height - b.height) / 2));
  }

  applyPetConfig() {
    const cfg = this.config.get().pet;
    // 语言切换后控制台窗口标题也要跟着变（这个函数在每次配置变更时都会被调用）
    if (this.control && !this.control.isDestroyed()) this.control.setTitle(t('live2dLumiPet · 控制台'));
    if (!this.pet || this.pet.isDestroyed()) return;
    this.pet.setAlwaysOnTop(cfg.alwaysOnTop, 'floating');
    this.pet.setOpacity(cfg.opacity);
    this.pet.setSkipTaskbar(cfg.hideTaskbarIcon);
    this.applyMouseMode();
  }

  showPet() {
    if (!this.pet || this.pet.isDestroyed()) this.createPet();
    this.pet?.showInactive();
  }

  hidePet() {
    this.pet?.hide();
  }

  togglePet() {
    if (this.pet && !this.pet.isDestroyed() && this.pet.isVisible()) this.hidePet();
    else this.showPet();
  }

  isPetVisible() {
    return !!this.pet && !this.pet.isDestroyed() && this.pet.isVisible();
  }

  broadcast(channel: string, payload: unknown) {
    for (const win of [this.pet, this.control]) {
      if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    }
  }

  sendToPet(channel: string, payload: unknown) {
    if (this.pet && !this.pet.isDestroyed()) this.pet.webContents.send(channel, payload);
  }

  sendToControl(channel: string, payload: unknown) {
    if (this.control && !this.control.isDestroyed()) this.control.webContents.send(channel, payload);
  }

  petExists() {
    return !!this.pet && !this.pet.isDestroyed();
  }

  /**
   * 光标轮询。
   * 为什么不用 DOM 的 mousemove：`setIgnoreMouseEvents(true, { forward: true })`
   * 在部分 Windows 环境下并不会把 mousemove 转发给页面，一旦窗口处于穿透态就再也
   * 收不到鼠标事件 —— 于是"逐像素命中"永远等不到第一次探测，窗口会一直穿透。
   * 这里由主进程按 30Hz 轮询全局光标，换算成窗口内的 CSS 坐标推给渲染层。
   */
  startCursorPolling() {
    if (this.cursorTimer) return;
    this.cursorTimer = setInterval(() => this.pollCursor(), 33);
  }

  stopCursorPolling() {
    if (this.cursorTimer) clearInterval(this.cursorTimer);
    this.cursorTimer = null;
  }

  private pollCursor() {
    if (!this.pet || this.pet.isDestroyed() || !this.pet.isVisible()) return;
    const pt = screen.getCursorScreenPoint();
    if (pt.x === this.lastCursor.x && pt.y === this.lastCursor.y) return;
    this.lastCursor = pt;
    const b = this.pet.getBounds();
    const x = pt.x - b.x;
    const y = pt.y - b.y;
    const inside = x >= 0 && y >= 0 && x < b.width && y < b.height;
    // 鼠标注视需要"屏幕尺度"：给出工作区尺寸，渲染层用"模型双眼中心"当原点，
    // 除以半个屏宽/屏高做归一化 —— 原点换了，但枢轴到满偏的距离（范围）不变。
    const wa = screen.getDisplayNearestPoint(pt).workArea;
    if (process.argv.includes('--logcursor')) {
      console.log(`[cursor] win=${x},${y} screen=${wa.width}x${wa.height}`);
    }
    this.pet.webContents.send('cursor:move', { x, y, inside, sw: wa.width, sh: wa.height });
  }
}
