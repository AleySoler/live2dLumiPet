import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const hotkeys = require('../dist/shared/hotkeys.js');
const config = require('../dist/shared/config.js');

test('formatAccelerator 把 accelerator 排成人类可读顺序', () => {
  assert.equal(hotkeys.formatAccelerator('Alt+1'), 'Alt + 1');
  assert.equal(hotkeys.formatAccelerator('Shift+S'), 'Shift + S');
  assert.equal(hotkeys.formatAccelerator('Ctrl+Alt+F5'), 'Ctrl + Alt + F5');
  assert.equal(hotkeys.formatAccelerator('Alt+num3'), 'Alt + Num3');
  assert.equal(hotkeys.formatAccelerator(null), '未绑定');
  assert.equal(hotkeys.formatAccelerator(''), '未绑定');
});

test('isModifierOnly / looksValidAccelerator 能识别残缺组合', () => {
  assert.equal(hotkeys.isModifierOnly('Alt'), true);
  assert.equal(hotkeys.isModifierOnly('Ctrl+Shift'), true);
  assert.equal(hotkeys.isModifierOnly('Alt+1'), false);
  assert.equal(hotkeys.looksValidAccelerator('Alt+1'), true);
  assert.equal(hotkeys.looksValidAccelerator('Alt'), false);
  assert.equal(hotkeys.looksValidAccelerator('Alt+1+2'), false, '多个主键非法');
});

test('eventToAccelerator 把键盘事件转成 Electron accelerator', () => {
  const e = (code, key, mods = {}) => ({ code, key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });
  assert.equal(hotkeys.eventToAccelerator(e('Digit1', '1', { altKey: true })), 'Alt+1');
  assert.equal(hotkeys.eventToAccelerator(e('KeyQ', 'q', { altKey: true })), 'Alt+Q');
  assert.equal(hotkeys.eventToAccelerator(e('KeyS', 'S', { shiftKey: true })), 'Shift+S');
  assert.equal(hotkeys.eventToAccelerator(e('Delete', 'Delete', { altKey: true })), 'Alt+Delete');
  assert.equal(hotkeys.eventToAccelerator(e('Numpad3', '3')), 'num3');
  assert.equal(hotkeys.eventToAccelerator(e('F5', 'F5', { ctrlKey: true })), 'Ctrl+F5');
  // 只按修饰键时返回 null
  assert.equal(hotkeys.eventToAccelerator(e('AltLeft', 'Alt', { altKey: true })), null);
  assert.equal(hotkeys.eventToAccelerator(e('ShiftLeft', 'Shift', { shiftKey: true })), null);
});

const manifest = {
  id: 'test',
  name: 'test',
  version: 1,
  settings: 'model3.json',
  credit: { illustration: '', rigging: '', note: '' },
  idle: { group: 'Idle', lostMotion: null, idleMotion: null },
  expressions: [{ id: 'e1', file: 'e1.json', label: '表情1', srcName: 'a', fadeIn: 0.2, fadeOut: 0.2, paramCount: 1 }],
  motions: [{ id: 'm1', file: 'm1.json', label: '动作1', group: 'Action', duration: 1, isIdle: false, curveCount: 1 }],
  hotkeys: [
    {
      id: 'hk-00',
      name: '兔牙',
      label: '兔牙',
      kind: 'expression',
      asset: 'e.json',
      assetId: 'e1',
      duration: 0,
      vtsName: '兔牙',
      vtsAction: 'ToggleExpression',
      vtsTriggers: { t1: 'Alt', t2: 'N1', t3: '' },
      defaultAccelerator: 'Alt+1',
    },
  ],
  paramMap: [
    {
      name: 'Face X',
      input: 'FaceAngleX',
      output: 'AngleX',
      inLower: -30,
      inUpper: 30,
      outLower: -30,
      outUpper: 30,
      smoothing: 15,
      blink: false,
      breath: false,
      clampInput: false,
      clampOutput: false,
    },
  ],
  paramNames: {},
  counts: {},
};

test('createDefaultConfig 从 manifest 生成默认热键与参数表', () => {
  const cfg = config.createDefaultConfig(manifest);
  assert.equal(cfg.hotkeys['hk-00'].accelerator, 'Alt+1');
  assert.equal(cfg.hotkeys['hk-00'].enabled, true);
  assert.equal(cfg.params.length, 1);
  assert.deepEqual(cfg.customHotkeys, []);
  assert.equal(cfg.tracking.enabled, false);
});

test('mergeConfig 深合并且数组整体替换', () => {
  const base = config.createDefaultConfig(manifest);
  const merged = config.mergeConfig(base, { pet: { scale: 1.5 }, tracking: { enabled: true } });
  assert.equal(merged.pet.scale, 1.5);
  assert.equal(merged.pet.alwaysOnTop, true, '未覆盖的字段保持默认');
  assert.equal(merged.tracking.enabled, true);
  const replaced = config.mergeConfig(base, { params: [] });
  assert.equal(replaced.params.length, 0);
});

test('effectiveHotkeys 合并内置与自建热键', () => {
  const cfg = config.createDefaultConfig(manifest);
  cfg.customHotkeys = [
    { id: 'custom-1', name: '自建', kind: 'motion', assetId: 'm1', accelerator: 'Ctrl+9', enabled: true },
  ];
  const list = config.effectiveHotkeys(manifest, cfg);
  assert.equal(list.length, 2);
  assert.equal(list[0].source, 'vts');
  assert.equal(list[1].source, 'custom');
  assert.equal(list[1].accelerator, 'Ctrl+9');
});

test('smoothingToAlpha 越大越平滑', () => {
  const dt = 1 / 60;
  assert.equal(config.smoothingToAlpha(0, dt), 1);
  const low = config.smoothingToAlpha(10, dt);
  const high = config.smoothingToAlpha(90, dt);
  assert.ok(low > high, '低平滑应比高平滑跟得更快');
  assert.ok(high > 0 && high < 1);
});

test('提示词与参数范围工具', () => {
  assert.equal(config.clamp(5, 0, 3), 3);
  assert.equal(config.clamp(-5, 0, 3), 0);
  assert.equal(config.lerp(0, 10, 0.25), 2.5);
});
