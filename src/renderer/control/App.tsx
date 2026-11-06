import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppConfig,
  BootInfo,
  DeepPartial,
  HotkeyStatus,
  ModelManifest,
  ResolvedHotkey,
  RuntimeState,
} from '../../shared/types';
import { effectiveHotkeys } from '../../shared/config';
import { formatAccelerator, eventToAccelerator, isModifierOnly } from '../../shared/hotkeys';
import { Badge, Card, Row, Slider, Stat, Toggle } from './components';
import { LANGS, setLang, t } from '../../shared/i18n';

const api = () => window.petAPI;

type TabId = 'overview' | 'tracking' | 'models' | 'hotkeys' | 'params' | 'settings';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'overview', label: '概览', icon: '◎' },
  { id: 'tracking', label: '面部捕捉', icon: '☺' },
  { id: 'models', label: '模型', icon: '▤' },
  { id: 'hotkeys', label: '快捷键', icon: '⌨' },
  { id: 'params', label: '参数映射', icon: '⚙' },
  { id: 'settings', label: '设置', icon: '✦' },
];

export default function App() {
  const [boot, setBoot] = useState<BootInfo | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [state, setState] = useState<RuntimeState | null>(null);
  const [hotkeyStatus, setHotkeyStatus] = useState<HotkeyStatus[]>([]);
  const [tab, setTab] = useState<TabId>('overview');
  const [preview, setPreview] = useState<string | null>(null);

  // 便于截图/自动化测试切换标签页
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__setTab = (t: string) => setTab(t as TabId);
  }, []);

  useEffect(() => {
    void (async () => {
      const b = await api().boot('control');
      setBoot(b);
      setConfig(b.config);
      setState(await api().requestState());
      setHotkeyStatus(await api().hotkeyStatus());
    })();
    const off1 = api().onConfig((c) => setConfig(c));
    const off2 = api().onState((s) => setState(s));
    const off3 = api().onHotkeyStatus((s) => setHotkeyStatus(s));
    const off4 = api().onPreviewFrame((d) => setPreview(d));
    // 换模型后主进程会推新的 BootInfo：manifest / modelBase 变了，
    // 快捷键、参数映射、模型与数据三处全都依赖它，不接这条推送界面就会停在旧模型上
    const off5 = api().onBoot((b) => {
      setBoot(b);
      setConfig(b.config);
    });
    return () => {
      off1();
      off2();
      off3();
      off4();
      off5();
    };
  }, []);

  const manifest = boot?.manifest ?? null;

  const patch = useCallback(async (p: DeepPartial<AppConfig>) => {
    const next = await api().updateConfig(p);
    setConfig(next);
  }, []);

  // 语言在整棵树渲染前同步给 i18n 模块，配置一变（config:changed）就整体重渲染成新语言
  setLang(config?.misc.language);

  if (!boot || !config || !manifest) {
    return <div className="empty">{t('正在连接桌宠进程…')}</div>;
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img src="./icon.png" alt="" />
          <div>
            <b>live2dLumiPet</b>
            <span>{t('桌宠控制台')} v{boot.appVersion}</span>
          </div>
        </div>
        {TABS.map((item) => (
          <button key={item.id} className={'tab' + (tab === item.id ? ' active' : '')} onClick={() => setTab(item.id)}>
            <span className="ico">{item.icon}</span>
            {t(item.label)}
          </button>
        ))}
        <div className="sidebar-foot">
          <div>
            <span className={'dot' + (state?.loaded ? ' on' : '')} />
            {state?.loaded ? t('模型已加载') : t('模型未加载')}
          </div>
          <div>
            <span className={'dot' + (state?.tracking && state?.faceFound ? ' on' : '')} />
            {state?.tracking ? (state?.faceFound ? t('捕捉中') : t('等待人脸')) : t('捕捉关闭')}
          </div>
          <div style={{ marginTop: 6 }}>{state?.fps ?? 0} FPS</div>
        </div>
      </aside>

      <main className="main">
        {tab === 'overview' && <Overview boot={boot} config={config} manifest={manifest} state={state} patch={patch} />}
        {tab === 'tracking' && (
          <Tracking config={config} state={state} patch={patch} preview={preview} setPreview={setPreview} />
        )}
        {tab === 'models' && <Models boot={boot} config={config} patch={patch} />}
        {tab === 'hotkeys' && (
          <Hotkeys manifest={manifest} config={config} patch={patch} statuses={hotkeyStatus} />
        )}
        {tab === 'params' && <Params manifest={manifest} config={config} patch={patch} />}
        {tab === 'settings' && <Settings boot={boot} config={config} patch={patch} />}
      </main>
    </div>
  );
}

/* ================================================================== */
/* 概览                                                                */
/* ================================================================== */
function Overview(props: {
  boot: BootInfo;
  config: AppConfig;
  manifest: ModelManifest;
  state: RuntimeState | null;
  patch: (p: DeepPartial<AppConfig>) => Promise<void>;
}) {
  const { boot, config, manifest, state, patch } = props;
  const activeNames = (state?.activeExpressions ?? [])
    .map((id) => manifest.expressions.find((e) => e.id === id)?.label ?? id)
    .join('、');

  return (
    <>
      <h1>live2dLumiPet</h1>
      <p className="sub">
        {t('简称 lLP · 融合 VTube Studio 的精准驾驭 与 Live2DViewerEX 的桌面驻留 —— 面部捕捉驱动 + 全局快捷键动作')}
      </p>

      <div className="grid c3">
        <Stat k={t('渲染帧率')} v={`${state?.fps ?? 0}`} />
        <Stat k={t('表情叠加')} v={`${state?.activeExpressions.length ?? 0}`} />
        <Stat k={t('模型参数')} v={`${manifest.counts.parameters ?? 0}`} />
      </div>

      {/* 不再展示模型作者署名：模型由用户自行导入，程序不是它的分发方 */}
      <Card title={t('模型')}>
        {!boot.hasModel ? (
          <div className="note warn">{t('暂无模型，请于「模型」中导入')}</div>
        ) : (
          <div className="grid c2">
            <div>
              <div style={{ fontSize: 15, marginBottom: 6 }}>{manifest.name}</div>
              <div className="mono" style={{ color: 'var(--text-faint)' }}>
                {manifest.id}
              </div>
            </div>
            <div className="mono">
              {t('表情 {e} · 动作 {m} · 热键 {h} 条', {
                e: manifest.expressions.length,
                m: manifest.motions.length,
                h: manifest.hotkeys.length,
              })}
              <br />
              {t('参数映射 {n} 条', { n: manifest.paramMap.length })}
            </div>
          </div>
        )}
      </Card>

      <Card title={t('桌宠概况')} hint={t('详细选项在「设置」页按分类整理')}>
        <div className="grid c3">
          <Stat k={t('缩放')} v={`${Math.round(config.pet.scale * 100)}%`} />
          <Stat k={t('不透明度')} v={`${Math.round(config.pet.opacity * 100)}%`} />
          <Stat k={t('鼠标控制')} v={config.pet.mouseControl ? t('开启') : t('穿透')} />
        </div>
        <div className="note" style={{ marginTop: 12 }}>
          {t('鼠标控制、右键菜单、置顶、任务栏与虚拟桌面等选项，统一在「设置 → 窗口与交互」调整。')}
        </div>
      </Card>

      <Card title={t('当前状态')}>
        <div className="grid c3">
          <Stat k={t('追踪')} v={state?.tracking ? (state.faceFound ? t('人脸锁定') : t('等待人脸')) : t('关闭')} />
          <Stat k={t('头部 X / Y / Z')} v={`${Math.round(state?.angles.x ?? 0)} ${Math.round(state?.angles.y ?? 0)} ${Math.round(state?.angles.z ?? 0)}`} />
          <Stat k={t('当前动作')} v={state?.currentMotion ?? t('待机')} />
        </div>
        <div className="note" style={{ marginTop: 12 }}>
          {t('正在叠加的表情：')}{activeNames || t('无')}
          {state?.error && (
            <>
              <br />
              <span style={{ color: 'var(--bad)' }}>{t('错误：')}{state.error}</span>
            </>
          )}
        </div>
      </Card>

      <Card title={t('快捷键速查')} hint={t('可在「快捷键」页改键')}>
        <div className="grid c3">
          {effectiveHotkeys(manifest, config)
            .filter((h) => h.accelerator)
            .slice(0, 9)
            .map((h) => (
              <div key={h.id} className="flex" style={{ justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>{h.name}</span>
                <span className="kbd">{formatAccelerator(h.accelerator)}</span>
              </div>
            ))}
        </div>
      </Card>
    </>
  );
}

/* ================================================================== */
/* 面部捕捉                                                            */
/* ================================================================== */
function Tracking(props: {
  config: AppConfig;
  state: RuntimeState | null;
  patch: (p: DeepPartial<AppConfig>) => Promise<void>;
  preview: string | null;
  setPreview: (v: string | null) => void;
}) {
  const { config, state, patch } = props;
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [calibrating, setCalibrating] = useState(false);
  const [calib, setCalib] = useState<{ x: number; y: number; z: number; n: number } | null>(null);
  const previewActive = useRef(false);

  useEffect(() => {
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((list) => setDevices(list.filter((d) => d.kind === 'videoinput')))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    api().setPreviewEnabled(true);
    previewActive.current = true;
    return () => {
      api().setPreviewEnabled(false);
      previewActive.current = false;
      props.setPreview(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!calibrating || !state) return;
    setCalib((c) => {
      const n = (c?.n ?? 0) + 1;
      return {
        x: (c?.x ?? 0) + state.angles.x,
        y: (c?.y ?? 0) + state.angles.y,
        z: (c?.z ?? 0) + state.angles.z,
        n,
      };
    });
  }, [state, calibrating]);

  const finishCalibration = async () => {
    setCalibrating(false);
    const c = calib;
    setCalib(null);
    if (!c || c.n < 3) return;
    await patch({
      tracking: {
        neutralX: c.x / c.n,
        neutralY: c.y / c.n,
        neutralZ: c.z / c.n,
      },
    });
  };

  const tr = config.tracking;
  return (
    <>
      <h1>{t('面部捕捉')}</h1>
      <p className="sub">{t('MediaPipe FaceLandmarker：478 关键点 + 52 组表情系数 + 头部姿态，驱动模型参数')}</p>

      <Card
        title={t('捕捉开关')}
        right={
          <Badge kind={state?.tracking ? (state.faceFound ? 'ok' : undefined) : 'err'}>
            {state?.tracking ? (state.faceFound ? t('运行中 · 已锁脸') : t('运行中 · 未检测到脸')) : t('已关闭')}
          </Badge>
        }
      >
        <Row label={t('启用摄像头捕捉')} desc={t('开启后由你本人的表情驱动桌宠；关闭则使用鼠标注视 + 自动眨眼')}>
          <Toggle on={tr.enabled} onChange={(v) => void patch({ tracking: { enabled: v } })} />
        </Row>
        <Row label={t('镜像摄像头')} desc={t('自己的左右与模型的左右一致（推荐开启）')}>
          <Toggle on={tr.mirror} onChange={(v) => void patch({ tracking: { mirror: v } })} />
        </Row>
        <Row label={t('摄像头')}>
          <select
            value={tr.deviceId ?? ''}
            onChange={(e) => void patch({ tracking: { deviceId: e.target.value || null } })}
            style={{ width: 260 }}
          >
            <option value="">{t('默认设备')}</option>
            {devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || t('摄像头 {n}', { n: i + 1 })}
              </option>
            ))}
          </select>
        </Row>
        {state?.error && <div className="note warn">{t('追踪错误：')}{state.error}</div>}
      </Card>

      <div className="grid c2">
        <Card title={t('预览')} hint={t('来自桌宠进程的实时画面')}>
          <div className="preview">
            {props.preview ? <img src={props.preview} alt="camera" /> : <span>{t('摄像头未开启 / 等待画面…')}</span>}
          </div>
        </Card>

        <Card title={t('实时数据')}>
          <div className="grid c2" style={{ gap: 8 }}>
            <Stat k={t('头部 X（左右）')} v={Math.round(state?.angles.x ?? 0)} />
            <Stat k={t('头部 Y（上下）')} v={Math.round(state?.angles.y ?? 0)} />
            <Stat k={t('头部 Z（歪头）')} v={Math.round(state?.angles.z ?? 0)} />
            <Stat k={t('嘴巴张开')} v={((state?.mouthOpen ?? 0) * 100).toFixed(0)} />
          </div>
          <div className="mono" style={{ marginTop: 8 }}>
            {t('识别帧率 {t} FPS · 渲染 {r} FPS', { t: state?.trackFps ?? 0, r: state?.fps ?? 0 })}
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="mono">{t('左眼开合')} {(state?.eyeOpen.l ?? 1).toFixed(2)}</div>
            <div className="meter">
              <i style={{ width: `${(state?.eyeOpen.l ?? 1) * 100}%` }} />
            </div>
            <div className="mono" style={{ marginTop: 6 }}>
              {t('右眼开合')} {(state?.eyeOpen.r ?? 1).toFixed(2)}
            </div>
            <div className="meter">
              <i style={{ width: `${(state?.eyeOpen.r ?? 1) * 100}%` }} />
            </div>
          </div>
        </Card>
      </div>

      <Card title={t('响应调校')}>
        <Row label={t('平滑')} desc={t('越大越柔和，越小越灵敏（对应 VTS 的 Smoothing）')}>
          <Slider value={tr.smooth} min={0} max={100} step={1} onChange={(v) => void patch({ tracking: { smooth: v } })} format={(v) => v.toFixed(0)} />
        </Row>
        <Row label={t('死区')} desc={t('抵消静止时的细微抖动')}>
          <Slider value={tr.deadzone} min={0} max={4} step={0.1} onChange={(v) => void patch({ tracking: { deadzone: v } })} format={(v) => v.toFixed(1)} />
        </Row>
        <Row label={t('左右幅度')}>
          <Slider value={tr.gainX} min={0.2} max={3} onChange={(v) => void patch({ tracking: { gainX: v } })} format={(v) => `${v.toFixed(2)}×`} />
        </Row>
        <Row label={t('上下幅度')}>
          <Slider value={tr.gainY} min={0.2} max={3} onChange={(v) => void patch({ tracking: { gainY: v } })} format={(v) => `${v.toFixed(2)}×`} />
        </Row>
        <Row label={t('歪头幅度')}>
          <Slider value={tr.gainZ} min={0.2} max={3} onChange={(v) => void patch({ tracking: { gainZ: v } })} format={(v) => `${v.toFixed(2)}×`} />
        </Row>
        <Row label={t('视线幅度')}>
          <Slider value={tr.gainEye} min={0.2} max={3} onChange={(v) => void patch({ tracking: { gainEye: v } })} format={(v) => `${v.toFixed(2)}×`} />
        </Row>
        <Row label={t('口型幅度')}>
          <Slider value={tr.gainMouth} min={0.2} max={4} onChange={(v) => void patch({ tracking: { gainMouth: v } })} format={(v) => `${v.toFixed(2)}×`} />
        </Row>
        <Row label={t('鼠标注视范围')} desc={t('1.0 = 整块屏幕；桌宠贴在角落时也能看满全屏，嫌不够灵敏就往上调')}>
          <Slider
            value={tr.cursorRange}
            min={0.4}
            max={2}
            step={0.05}
            onChange={(v) => void patch({ tracking: { cursorRange: v } })}
            format={(v) => `${v.toFixed(2)}×`}
          />
        </Row>
        <Row label={t('睁闭眼幅度')} desc={t('越大越容易闭死、眨眼越明显；也能把瞪眼放大')}>
          <Slider
            value={tr.gainBlink}
            min={0.4}
            max={3}
            step={0.05}
            onChange={(v) => void patch({ tracking: { gainBlink: v } })}
            format={(v) => `${v.toFixed(2)}×`}
          />
        </Row>
        <Row label={t('中性位姿校准')}
          desc={t('当前偏移 X {x}° / Y {y}° / Z {z}°', {
              x: tr.neutralX.toFixed(1),
              y: tr.neutralY.toFixed(1),
              z: tr.neutralZ.toFixed(1),
            })}
        >
          {calibrating ? (
            <button className="btn primary" onClick={() => void finishCalibration()}>
              {t('完成校准（{n} 帧）', { n: calib?.n ?? 0 })}
            </button>
          ) : (
            <button
              className="btn"
              onClick={() => {
                setCalib(null);
                setCalibrating(true);
              }}
            >
              {t('正坐并开始校准')}
            </button>
          )}
        </Row>
        <Row label={t('方向反转')} desc={t('如果模型转头方向与你相反，就打开对应的开关')}>
          <span className="mono" style={{ marginRight: 4 }}>{t('左右')}</span>
          <Toggle on={tr.invertX} onChange={(v) => void patch({ tracking: { invertX: v } })} />
          <span className="mono" style={{ margin: '0 4px 0 12px' }}>{t('上下')}</span>
          <Toggle on={tr.invertY} onChange={(v) => void patch({ tracking: { invertY: v } })} />
          <span className="mono" style={{ margin: '0 4px 0 12px' }}>{t('歪头')}</span>
          <Toggle on={tr.invertZ} onChange={(v) => void patch({ tracking: { invertZ: v } })} />
        </Row>
      </Card>

      <div className="note">
        {t('面朝摄像头自然坐好 → 点「正坐并开始校准」→ 保持不动约 2 秒 → 点完成。')}
        {t('之后你的中性表情就会对应模型的正面视角。若发现左右相反，关掉「镜像摄像头」再试。')}
      </div>
    </>
  );
}

/* ================================================================== */
/* 快捷键                                                              */
/* ================================================================== */
function Hotkeys(props: {
  manifest: ModelManifest;
  config: AppConfig;
  patch: (p: DeepPartial<AppConfig>) => Promise<void>;
  statuses: HotkeyStatus[];
}) {
  const { manifest, config, patch, statuses } = props;
  const list = useMemo(() => effectiveHotkeys(manifest, config), [manifest, config]);
  const [recording, setRecording] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setRecording(null);
        return;
      }
      const acc = eventToAccelerator(e);
      if (!acc || isModifierOnly(acc)) return;
      setRecording(null);
      const hk = list.find((h) => h.id === recording);
      if (!hk) return;
      if (hk.source === 'vts') {
        void patch({ hotkeys: { [hk.id]: { accelerator: acc, enabled: true } } as never });
      } else {
        const next = (config.customHotkeys ?? []).map((c) => (c.id === hk.id ? { ...c, accelerator: acc } : c));
        void patch({ customHotkeys: next });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, list, config.customHotkeys, patch]);

  const statusOf = (id: string) => statuses.find((s) => s.id === id);

  const filtered = list.filter(
    (h) => !filter || h.name.includes(filter) || (h.accelerator ?? '').toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <>
      <h1>{t('快捷键')}</h1>
      <p className="sub">
        {manifest.hotkeys.length > 0
          ? t('共 {n} 条热键，全部注册为系统级全局热键 —— 桌宠不在前台也能触发', { n: manifest.hotkeys.length })
          : t('当前模型没有可用的热键，可在下方「新增自定义热键」里把任意表情/动作绑到按键')}
        {manifest.vtsModelId
          ? t('。绑定关系来自模型附带的 VTube Studio 配置（.vtube.json），已按原样保留')
          : manifest.hotkeys.length > 0
            ? t('。该模型没有 VTube Studio 配置，按键是按表情自动分配的，可逐条改绑')
            : ''}
      </p>

      <Card
        title={t('绑定列表')}
        right={
          <>
            <input
              type="text"
              placeholder={t('搜索名称/按键')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ width: 160 }}
            />
          </>
        }
      >
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>{t('启用')}</th>
                <th>{t('名称')}</th>
                <th style={{ width: 70 }}>{t('类型')}</th>
                <th style={{ width: 92 }}>{t('VTS 原键')}</th>
                <th style={{ width: 170 }}>{t('当前绑定')}</th>
                <th style={{ width: 110 }}>{t('状态')}</th>
                <th style={{ width: 130 }}>{t('操作')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((h) => {
                const st = statusOf(h.id);
                return (
                  <tr key={h.id}>
                    <td>
                      <Toggle
                        on={h.enabled}
                        onChange={(v) => {
                          if (h.source === 'vts') void patch({ hotkeys: { [h.id]: { enabled: v } } as never });
                          else {
                            const next = (config.customHotkeys ?? []).map((c) =>
                              c.id === h.id ? { ...c, enabled: v } : c,
                            );
                            void patch({ customHotkeys: next });
                          }
                        }}
                      />
                    </td>
                    <td>
                      {h.name}
                      {h.source === 'custom' && (
                        <span className="mono" style={{ marginLeft: 6 }}>
                          {t('自建')}
                        </span>
                      )}
                    </td>
                    <td>
                      <Badge kind={h.kind === 'expression' ? 'exp' : h.kind === 'motion' ? 'mot' : 'clr'}>
                        {h.kind === 'expression' ? t('表情') : h.kind === 'motion' ? t('动作') : t('清空')}
                      </Badge>
                    </td>
                    <td className="mono">
                      {h.vtsTriggers ? [h.vtsTriggers.t1, h.vtsTriggers.t2].filter(Boolean).join(' + ') : '—'}
                    </td>
                    <td>
                      <span
                        className={'kbd' + (recording === h.id ? ' recording' : '') + (h.accelerator ? '' : ' off')}
                        onClick={() => setRecording(h.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        {recording === h.id ? t('按任意组合键…') : formatAccelerator(h.accelerator)}
                      </span>
                    </td>
                    <td>
                      {st?.ok ? (
                        <Badge kind="ok">{t('已注册')}</Badge>
                      ) : (
                        <span className="mono" style={{ color: 'var(--warn)' }}>
                          {st?.error ?? '—'}
                        </span>
                      )}
                    </td>
                    <td>
                      <button className="btn sm" onClick={() => void api().fireHotkey(h.id)}>
                        {t('试一下')}
                      </button>{' '}
                      {h.source === 'custom' && (
                        <button
                          className="btn sm danger"
                          onClick={() => void api().removeCustomHotkey(h.id).then((c) => patch({}))}
                        >
                          {t('删除')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="note">
          {t('点击「当前绑定」里的按键框，然后按下新的组合键即可改绑。Esc 取消。若显示「被其他程序占用」，说明该组合被别的软件（或另一个输入法）抢走了，换一个即可。')}
        </div>
      </Card>

      <CustomHotkeyForm manifest={manifest} onAdded={(c) => patch({})} />
    </>
  );
}

function CustomHotkeyForm({ manifest, onAdded }: { manifest: ModelManifest; onAdded: (c: unknown) => void }) {
  const [kind, setKind] = useState<'expression' | 'motion' | 'clear-expressions'>('expression');
  const [assetId, setAssetId] = useState<string>(manifest.expressions[0]?.id ?? '');
  const [name, setName] = useState('');
  const [acc, setAcc] = useState('');
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === 'Escape') return setRecording(false);
      const a = eventToAccelerator(e);
      if (!a || isModifierOnly(a)) return;
      setAcc(a);
      setRecording(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording]);

  const options =
    kind === 'expression'
      ? manifest.expressions.map((e) => ({ id: e.id, label: e.label }))
      : kind === 'motion'
        ? manifest.motions.map((m) => ({ id: m.id, label: m.label }))
        : [];

  const submit = async () => {
    if (kind !== 'clear-expressions' && !assetId) return;
    const label =
      name.trim() ||
      (kind === 'clear-expressions'
        ? t('清除表情')
        : options.find((o) => o.id === assetId)?.label ?? t('自定义热键'));
    await api().addCustomHotkey({
      name: label,
      kind,
      assetId: kind === 'clear-expressions' ? null : assetId,
      accelerator: acc || null,
      enabled: true,
    });
    setAcc('');
    setName('');
    onAdded(null);
  };

  return (
    <Card title={t('新增自定义热键')} hint={t('把模型里的任意表情/动作绑到任意按键')}>
      <div className="flex" style={{ flexWrap: 'wrap', gap: 10 }}>
        <select
          value={kind}
          onChange={(e) => {
            const k = e.target.value as typeof kind;
            setKind(k);
            setAssetId(k === 'expression' ? manifest.expressions[0]?.id ?? '' : manifest.motions[0]?.id ?? '');
          }}
        >
          <option value="expression">{t('表情')}</option>
          <option value="motion">{t('动作')}</option>
          <option value="clear-expressions">{t('清空全部表情')}</option>
        </select>
        {kind !== 'clear-expressions' && (
          <select value={assetId} onChange={(e) => setAssetId(e.target.value)} style={{ minWidth: 150 }}>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        <input type="text" placeholder={t('显示名称（可选）')} value={name} onChange={(e) => setName(e.target.value)} style={{ width: 170 }} />
        <span className={'kbd' + (recording ? ' recording' : '')} onClick={() => setRecording(true)} style={{ cursor: 'pointer' }}>
          {recording ? t('按组合键…') : acc ? formatAccelerator(acc) : t('点击录制按键')}
        </span>
        <button className="btn primary" onClick={() => void submit()}>
          {t('添加')}
        </button>
      </div>
    </Card>
  );
}

/* ================================================================== */
/* 参数映射                                                            */
/* ================================================================== */
function Params(props: {
  manifest: ModelManifest;
  config: AppConfig;
  patch: (p: DeepPartial<AppConfig>) => Promise<void>;
}) {
  const { manifest, config, patch } = props;
  const update = (idx: number, patchItem: Record<string, unknown>) => {
    const next = config.params.map((p, i) => (i === idx ? { ...p, ...patchItem } : p));
    void patch({ params: next });
  };

  return (
    <>
      <h1>{t('参数映射')}</h1>
      <p className="sub">
        {manifest.vtsModelId
          ? t('这张表来自模型的 VTube Studio 配置（ParameterSettings），是作者调好的"表情输入 → Live2D 参数"对应关系。')
          : manifest.paramMap.length > 0 && manifest.counts?.parameters
            ? t('该模型没有 VTube Studio 配置，这张表由 Cubism 标准参数按模型实有参数自动生成。')
            : t('这张表由程序的通用参数映射生成。')}
        {t('改这里就等于改桌宠的性格。')}
      </p>

      <Card
        title={t('共 {n} 条', { n: config.params.length })}
        right={
          <button className="btn" onClick={() => void patch({ params: manifest.paramMap })}>
            {t('恢复 VTS 默认')}
          </button>
        }
      >
        <div className="scroll" style={{ maxHeight: 520 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>{t('启用')}</th>
                <th>{t('名称')}</th>
                <th style={{ width: 130 }}>{t('输入')}</th>
                <th style={{ width: 150 }}>{t('输出参数')}</th>
                <th style={{ width: 118 }}>{t('输入范围')}</th>
                <th style={{ width: 118 }}>{t('输出范围')}</th>
                <th style={{ width: 92 }}>{t('平滑')}</th>
              </tr>
            </thead>
            <tbody>
              {config.params.map((p, i) => (
                <tr key={p.output + '|' + (p.input ?? '') + i}>
                  <td>
                    <Toggle on={!p.disabled} onChange={(v) => update(i, { disabled: !v })} />
                  </td>
                  <td>{p.name}</td>
                  <td className="mono">{p.input ?? '—'}</td>
                  <td className="mono" style={{ color: '#8fb8ff' }}>
                    {p.output}
                  </td>
                  <td className="mono">
                    {p.inLower.toFixed(2)} ~ {p.inUpper.toFixed(2)}
                  </td>
                  <td className="mono">
                    {p.outLower.toFixed(2)} ~ {p.outUpper.toFixed(2)}
                  </td>
                  <td>
                    <Slider value={p.smoothing} min={0} max={100} step={1} onChange={(v) => update(i, { smoothing: v })} format={(v) => v.toFixed(0)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="note">
          {t('「平滑」越大模型跟随越慢、越柔和；「启用」关掉后该参数不再由追踪写入（可用来只保留物理/动作控制）。')}
        </div>
      </Card>
    </>
  );
}

/* /* /* ================================================================== */
/* 模型                                                                */
/* ================================================================== */
interface ModelInfo {
  id: string;
  name: string;
  kind: 'builtin' | 'user';
  dir: string;
  settings: string;
  counts: Record<string, number>;
  hasVts: boolean;
}

function Models(props: {
  boot: BootInfo;
  config: AppConfig;
  patch: (p: DeepPartial<AppConfig>) => Promise<void>;
}) {
  const { boot, config, patch } = props;
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [current, setCurrent] = useState<string>(config.modelId);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string; warnings?: string[] } | null>(null);

  const refresh = useCallback(async () => {
    const res = await api().listModels();
    setModels(res.models);
    setCurrent(res.current);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const doImport = async () => {
    setBusy('import');
    setMsg(null);
    try {
      const r = await api().importModel();
      if (!r) {
        setBusy(null);
        return;
      }
      await refresh();
      const c = r.counts ?? {};
      setMsg({
        kind: r.warnings.length ? 'err' : 'ok',
        text: t('已导入「{name}」：{e} 表情 · {m} 动作 · {h} 热键 · {p}', {
          name: r.name,
          e: c.expressions ?? 0,
          m: c.motions ?? 0,
          h: c.hotkeys ?? 0,
          p: c.parameters ? t('{n} 参数', { n: c.parameters }) : t('标准参数'),
        }),
        warnings: r.warnings,
      });
    } catch (err) {
      setMsg({
        kind: 'err',
        text: t('导入失败：{msg}', {
          msg: (err as Error).message.replace(/^Error invoking remote method '[^']+':\s*/, ''),
        }),
      });
    } finally {
      setBusy(null);
    }
  };

  const useModel = async (id: string) => {
    if (id === current) return;
    setBusy(id);
    setMsg(null);
    try {
      await api().setModel(id);
      setCurrent(id);
      const m = models.find((x) => x.id === id);
      setMsg({ kind: 'ok', text: t('已切换到「{name}」，桌宠正在重新加载模型', { name: m?.name ?? id }) });
    } catch (err) {
      setMsg({ kind: 'err', text: t('切换失败：{msg}', { msg: (err as Error).message }) });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (m: ModelInfo) => {
    if (m.kind === 'builtin') return;
    if (!confirm(t('确定要删除模型「{name}」吗？\n\n这会连同它在磁盘上的资源一起删除，无法撤销。', { name: m.name })))
      return;
    setBusy(m.id);
    setMsg(null);
    try {
      const r = await api().deleteModel(m.id);
      setModels(r.models as ModelInfo[]);
      setCurrent(r.current);
      setMsg({ kind: 'ok', text: t('已删除「{name}」', { name: m.name }) });
    } catch (err) {
      setMsg({ kind: 'err', text: t('删除失败：{msg}', { msg: (err as Error).message }) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <h1>{t('模型')}</h1>
      <p className="sub">{t('导入、切换、删除桌宠使用的 Live2D 模型')}</p>

      {!boot.hasModel && <div className="note warn">{t('暂无模型，请先导入一个 .zip')}</div>}

      <Card title={t('模型开关')} hint={t('关闭后卸载模型并释放显存，再次打开会重新加载')}>
        <Row
          label={t('启用模型')}
          desc={
            boot.hasModel
              ? t('关闭 = 卸载模型（桌宠窗口仍在，只是不渲染）；打开 = 重新加载')
              : t('还没有可用模型，导入后此开关会自动打开')
          }
        >
          <Toggle
            on={boot.hasModel && config.misc.modelEnabled !== false}
            disabled={!boot.hasModel}
            onChange={(v) => void patch({ misc: { modelEnabled: v } })}
          />
        </Row>
      </Card>

      <Card title={t('导入模型')} hint={t('支持 .zip 压缩包')}>
        <div className="note" style={{ marginBottom: 12 }}>
          {t('把模型文件夹压成 zip 即可（Cubism 3/4/5 的')}{' '}
          <span className="mono">.model3.json</span> {t('模型）。')}
          <br />
          {t('导入时会自动做三件事：')}
          <b>{t('资源归一化')}</b>
          {t('（贴图/动作/表情统一改名，避免中文路径问题）、')}
          <b>{t('热键适配')}</b>
          {t('（优先读包内的 VTube Studio 配置，没有就按表情自动生成）、')}
          <b>{t('参数映射适配')}</b>
          {t('（有 VTS 参数表就照搬，没有就用 Cubism 标准参数表）。')}
        </div>
        <div className="flex" style={{ gap: 10 }}>
          <button className="btn" disabled={busy === 'import'} onClick={() => void doImport()}>
            {busy === 'import' ? t('正在导入…') : t('选择 zip 导入')}
          </button>
          <button className="btn" onClick={() => void refresh()}>
            {t('刷新列表')}
          </button>
          <span className="mono" style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            {t('存放位置：')}{boot.modelsDir}
          </span>
        </div>
        {msg && (
          <div className="note" style={{ marginTop: 12, borderColor: msg.kind === 'err' ? 'var(--bad)' : undefined }}>
            <span style={{ color: msg.kind === 'err' ? 'var(--bad)' : 'var(--ok)' }}>{msg.text}</span>
            {msg.warnings && msg.warnings.length > 0 && (
              <ul style={{ margin: '8px 0 0 18px', padding: 0 }}>
                {msg.warnings.slice(0, 8).map((w, i) => (
                  <li key={i} style={{ color: 'var(--text-dim)' }}>
                    {w}
                  </li>
                ))}
                {msg.warnings.length > 8 && (
          <li style={{ color: 'var(--text-faint)' }}>
            {t('… 还有 {n} 条', { n: msg.warnings.length - 8 })}
          </li>
        )}
              </ul>
            )}
          </div>
        )}
      </Card>

      <Card title={t('模型库')} hint={t('模型库共 {n} 个', { n: models.length })}>
        {models.length === 0 && <div className="note">{t('还没有可用模型。')}</div>}
        <div className="grid c2">
          {models.map((m) => {
            const active = m.id === current;
            const c = m.counts ?? {};
            return (
              <div
                key={m.id}
                className="card"
                style={{
                  marginBottom: 0,
                  borderColor: active ? 'rgba(91,140,255,0.6)' : undefined,
                  background: active ? 'linear-gradient(180deg, rgba(91,140,255,0.14), rgba(91,140,255,0.03))' : undefined,
                }}
              >
                <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{m.name}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                      {m.id}
                    </div>
                  </div>
                  <div className="flex" style={{ gap: 6 }}>
                    {active && <Badge kind="ok">{t('使用中')}</Badge>}
                    <Badge>{m.kind === 'builtin' ? t('内置') : t('导入')}</Badge>
                  </div>
                </div>

                <div className="mono" style={{ fontSize: 12, color: 'var(--text-dim)', margin: '10px 0' }}>
                  {t('表情 {e} · 动作 {m} · 热键 {h} · 参数 {p}', {
                    e: c.expressions ?? 0,
                    m: c.motions ?? 0,
                    h: c.hotkeys ?? 0,
                    p: c.parameters ?? 0,
                  })}
                  {m.hasVts ? t(' · 含 VTS 配置') : ''}
                </div>

                <div className="flex" style={{ gap: 8 }}>
                  <button className="btn" disabled={active || busy === m.id} onClick={() => void useModel(m.id)}>
                    {active ? t('当前模型') : t('使用')}
                  </button>
                  <button
                    className="btn danger"
                    disabled={m.kind === 'builtin' || busy === m.id}
                    title={m.kind === 'builtin' ? t('内置模型不能删除') : undefined}
                    onClick={() => void remove(m)}
                  >
                    {t('删除')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title={t('说明')}>
        <div className="note">
          {t('· 切换模型会重建')}
          <b>{t('热键绑定')}</b>
          {t('与')}
          <b>{t('参数映射')}</b>
          {t('（不同模型的参数表不一样，沿用旧的会全部失效），')}
          {t('窗口位置、缩放、透明度等偏好会保留。')}
          <br />
          {t('· 本程序不附带任何模型。导入的模型存放在用户数据目录，卸载应用不会删除。')}
          <br />
          {t('· 若模型带')} <span className="mono">.vtube.json</span>
          {t('（VTube Studio 导出配置），其中的热键与参数表会被完整复用，')}
          {t('表现和 VTS 里最接近。')}
        </div>
      </Card>
    </>
  );
}

/* ================================================================== */
/* 设置                                                                */
/* ================================================================== */
type SettingsTabId = 'render' | 'behavior' | 'window' | 'system' | 'model';

const SETTINGS_TABS: { id: SettingsTabId; label: string; icon: string; hint: string }[] = [
  { id: 'render', label: t('画面与渲染'), icon: '◐', hint: t('清晰度、过渡、光效与蒙版') },
  { id: 'behavior', label: t('模型行为'), icon: '✧', hint: t('待机、呼吸、眨眼、物理') },
  { id: 'window', label: t('窗口与交互'), icon: '❖', hint: t('鼠标、缩放、透明度、置顶') },
  { id: 'system', label: t('系统与启动'), icon: '⛭', hint: t('开机自启、托盘、运行信息') },
  { id: 'model', label: t('模型与数据'), icon: '▣', hint: t('当前模型、重新加载、重置') },
];

function Settings(props: {
  boot: BootInfo;
  config: AppConfig;
  patch: (p: DeepPartial<AppConfig>) => Promise<void>;
}) {
  const { config, patch, boot } = props;
  const m = config.misc;
  const [sub, setSub] = useState<SettingsTabId>('render');
  const cur = SETTINGS_TABS.find((x) => x.id === sub)!;

  // 便于截图/自动化测试切换设置页的分类
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__setSettingsTab = (id: string) => setSub(id as SettingsTabId);
  }, []);

  return (
    <>
      <h1>{t('设置')}</h1>
      <p className="sub">{t('按用途分成五组，下面切换分类')}</p>

      <div className="subtabs">
        {SETTINGS_TABS.map((x) => (
          <button key={x.id} className={'subtab' + (sub === x.id ? ' active' : '')} onClick={() => setSub(x.id)}>
            <span className="ico">{x.icon}</span>
            {t(x.label)}
          </button>
        ))}
      </div>
      <p className="sub" style={{ marginTop: -6, marginBottom: 14 }}>
        {t(cur.hint)}
      </p>

      {sub === 'render' && (
        <Card title={t('画面与渲染')} hint={t('影响桌宠的成像质量与特效')}>
          <Row
            label={t('渲染精度')}
            desc={t('0 = 自动跟随显示器缩放（1:1 物理像素，最清晰）；显卡吃紧时可调低')}
          >
            <Slider
              value={m.renderScale}
              min={0}
              max={2}
              step={0.25}
              onChange={(v) => void patch({ misc: { renderScale: v } })}
              format={(v) =>
                v <= 0
                  ? t('自动({v}×)', { v: Math.min(Math.max(window.devicePixelRatio || 1, 1), 2).toFixed(2) })
                  : `${v.toFixed(2)}×`
              }
            />
          </Row>
          <Row
            label={t('裁剪蒙版精度')}
            desc={t('模型加载时生效，数值越高被蒙版裁切的边缘越锐。改完需要到「模型与数据」点重新加载')}
          >
            <select
              value={String(m.maskResolution)}
              onChange={(e) => void patch({ misc: { maskResolution: Number(e.target.value) } })}
              style={{ width: 110 }}
            >
              <option value="256">{t('256（库默认）')}</option>
              <option value="512">512</option>
              <option value="1024">{t('1024（推荐）')}</option>
              <option value="2048">2048</option>
            </select>
          </Row>
          <Row label={t('过渡时长')} desc={t('表情/动作淡入淡出的倍率；整块换装类变化需要放慢时调大')}>
            <Slider
              value={m.fadeScale}
              min={0.4}
              max={3}
              step={0.1}
              onChange={(v) => void patch({ misc: { fadeScale: v } })}
              format={(v) => `${v.toFixed(1)}×`}
            />
          </Row>
          <Row
            label={t('边缘光效强度')}
            desc={t('模型自带的轮廓柔光（rim-light）层的强度。有些模型没有这一层，调它不会有变化')}
          >
            <Slider
              value={m.edgeGlow}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => void patch({ misc: { edgeGlow: v } })}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </Row>
          <Row label={t('关闭边缘光效')} desc={t('把轮廓柔光层整个隐藏，比把强度调到 0 更干净')}>
            <Toggle on={m.hideEdgeGlow} onChange={(v) => void patch({ misc: { hideEdgeGlow: v } })} />
          </Row>
          <Row
            label={t('隐藏占位网格')}
            desc={t('部分模型会在鼻梁等位置用纯色占位网格，开启后自动隐藏。模型没有这类网格时无影响')}
          >
            <Toggle on={m.hideNosePlaceholder} onChange={(v) => void patch({ misc: { hideNosePlaceholder: v } })} />
          </Row>
          <Row label={t('调试浮层')} desc={t('在桌宠窗口左上角显示帧率/角度/表情')}>
            <Toggle on={m.showDebugOverlay} onChange={(v) => void patch({ misc: { showDebugOverlay: v } })} />
          </Row>
        </Card>
      )}

      {sub === 'behavior' && (
        <Card title={t('模型行为')} hint={t('模型自身的动作与参数表现')}>
          <Row label={t('待机动作')} desc={t('空闲时循环播放模型自带的待机动画')}>
            <Toggle on={m.idleMotion} onChange={(v) => void patch({ misc: { idleMotion: v } })} />
          </Row>
          <Row label={t('丢失追踪时播放待机')} desc={t('离开摄像头、丢失人脸后切回待机动画')}>
            <Toggle on={m.lostIdleMotion} onChange={(v) => void patch({ misc: { lostIdleMotion: v } })} />
          </Row>
          <Row label={t('呼吸')} desc={t('叠加一层缓慢的呼吸起伏（依赖模型的呼吸参数）')}>
            <Toggle on={m.breath} onChange={(v) => void patch({ misc: { breath: v } })} />
          </Row>
          <Row label={t('自动眨眼')} desc={t('没有真实眨眼数据时，由程序按间隔自动眨眼')}>
            <Toggle on={m.autoBlink} onChange={(v) => void patch({ misc: { autoBlink: v } })} />
          </Row>
          <Row label={t('物理演算')} desc={t('按模型自带的物理设定计算头发、衣摆等部件的摆动。关闭后这些部件保持静止')}>
            <Toggle on={m.physics} onChange={(v) => void patch({ misc: { physics: v } })} />
          </Row>
          <Row label={t('鼠标注视')} desc={t('未开启摄像头时，用鼠标位置驱动头部朝向与眼神')}>
            <Toggle on={m.cursorLook} onChange={(v) => void patch({ misc: { cursorLook: v } })} />
          </Row>
        </Card>
      )}

      {sub === 'window' && (
        <>
          <Card title={t('鼠标与交互')} hint={t('决定桌宠窗口如何接收鼠标')}>
            <Row
              label={t('鼠标控制')}
              desc={t('开启：左键拖动、滚轮缩放、右键菜单都可用（只有点到模型轮廓时才接收）。关闭：整个窗口穿透，点击直接落到后面的界面')}
            >
              <Toggle on={config.pet.mouseControl} onChange={(v) => void patch({ pet: { mouseControl: v } })} />
            </Row>
            <Row label={t('右键弹出窗口')} desc={t('开启后右键模型弹出与托盘一致的菜单；关闭则右键不弹窗')}>
              <Toggle on={config.pet.rightClickMenu} onChange={(v) => void patch({ pet: { rightClickMenu: v } })} />
            </Row>
          </Card>

          <Card title={t('窗口外观')}>
            <Row label={t('缩放')} desc={t('桌宠整体大小')}>
              <Slider
                value={config.pet.scale}
                min={0.35}
                max={1.8}
                step={0.01}
                onChange={(v) => void patch({ pet: { scale: v } })}
                format={(v) => `${Math.round(v * 100)}%`}
              />
            </Row>
            <Row label={t('不透明度')}>
              <Slider
                value={config.pet.opacity}
                min={0.2}
                max={1}
                step={0.01}
                onChange={(v) => void patch({ pet: { opacity: v } })}
                format={(v) => `${Math.round(v * 100)}%`}
              />
            </Row>
            <Row label={t('始终置顶')} desc={t('浮在普通窗口之上')}>
              <Toggle on={config.pet.alwaysOnTop} onChange={(v) => void patch({ pet: { alwaysOnTop: v } })} />
            </Row>
            <Row label={t('所有虚拟桌面可见')}>
              <Toggle
                on={config.pet.showOnAllWorkspaces}
                onChange={(v) => void patch({ pet: { showOnAllWorkspaces: v } })}
              />
            </Row>
            <Row label={t('在任务栏隐藏')} desc={t('只保留托盘图标')}>
              <Toggle on={config.pet.hideTaskbarIcon} onChange={(v) => void patch({ pet: { hideTaskbarIcon: v } })} />
            </Row>
          </Card>

          <Card title={t('重置')}>
            <Row
              label={t('重置模型状态')}
              desc={t('桌宠回到屏幕中心，取消所有表情与动作，缩放恢复 100%')}
            >
              <button className="btn" onClick={() => void api().resetModelState()}>
                {t('重置')}
              </button>
            </Row>
          </Card>
        </>
      )}

      {sub === 'system' && (
        <Card title={t('系统与启动')}>
          <Row label={t('语言')} desc={t('界面语言，切换后立即生效；模型自带的名称不会被翻译')}>
            <select
              value={m.language ?? 'zh'}
              onChange={(e) => void patch({ misc: { language: e.target.value as 'zh' | 'zh-Hant' | 'en' | 'ja' } })}
              style={{ width: 140 }}
            >
              {LANGS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </Row>
          <Row label={t('开机自启')} desc={t('随系统启动时自动运行桌宠（只显示桌宠，不弹控制台）')}>
            <Toggle on={m.launchAtLogin} onChange={(v) => void patch({ misc: { launchAtLogin: v } })} />
          </Row>
          <Row label={t('托盘常驻')} desc={t('左键打开控制台，右键打开菜单（含鼠标控制、缩放、重置、退出）')}>
            <span className="mono">{t('已启用')}</span>
          </Row>
          <Row label={t('应用版本')}>
            <span className="mono">{boot.appVersion}</span>
          </Row>
          <Row label={t('资源目录')} desc={t('程序读取模型与前端资源的目录')}>
            <span className="mono" style={{ fontSize: 11 }}>
              {boot.assetRoot}
            </span>
          </Row>
          <Row label={t('运行平台')}>
            <span className="mono">{boot.platform}</span>
          </Row>
        </Card>
      )}

      {sub === 'model' && (
        <>
          <Card title={t('当前模型')}>
            <Row label={t('模型名称')}>
              <span className="mono">{boot.manifest.name}</span>
            </Row>
            <Row label={t('资源路径')} desc={t('切换到自定义模型后，这里会显示对应目录')}>
              <span className="mono" style={{ fontSize: 11 }}>
                {boot.modelBase}
              </span>
            </Row>
            <Row label={t('重新加载')} desc={t('修改模型资源或上面的裁剪蒙版精度后，无需重启应用')}>
              <button className="btn" onClick={() => void api().setModel(config.modelId)}>
                {t('重新加载模型')}
              </button>
            </Row>
          </Card>

          <Card title={t('数据与关于')}>
            <Row label={t('重置全部设置')} desc={t('快捷键绑定、参数映射、窗口位置全部恢复默认')}>
              <button
                className="btn danger"
                onClick={async () => {
                  if (!confirm(t('确定要恢复所有默认设置吗？'))) return;
                  await api().resetConfig();
                }}
              >
                {t('恢复默认')}
              </button>
            </Row>
            <div className="note" style={{ lineHeight: 1.75 }}>
              <b>{t('项目')}</b>
              <br />
              {t('live2dLumiPet（简称 lLP）')} · v{boot.appVersion}
              <br />
              <br />
              <b>{t('项目作者')}</b>
              <br />
              {t('吾名契白淮（B站） / Aley_Soler（GitHub） / DeepSeek（大肥鱼）')}
              <br />
              <br />
              <b>{t('当前模型')}</b>
              <br />
              {boot.hasModel ? boot.manifest.name : t('暂无模型')}
              <br />
              {t('程序不附带任何模型，模型由用户自行导入，版权归该模型作者所有')}
              <br />
              <br />
              <b>{t('技术说明')}</b>
              <br />
              {t('本程序使用 Live2D Cubism SDK for Web 渲染模型，MediaPipe Face Landmarker 提供面部捕捉，')}
              {t('Electron + React + pixi.js 构建界面与窗口层。')}
              <br />
              <br />
              <b>{t('版权声明')}</b>
              <br />
              {t('· Live2D 是株式会社 Live2D 的商标，本项目为非官方作品，与其无隶属或合作关系。')}
              <br />
              {t('· 模型版权归各自作者所有。内置模型为免费配布，使用请遵守模型压缩包内的使用条款；')}
              {t('通过本程序导入的模型，其版权与使用限制由该模型作者决定。')}
              <br />
              {t('· 本项目为开源项目，源代码以 MIT 许可发布；所依赖的第三方组件（Electron / pixi.js / React /')}
              {t('MediaPipe 等）遵循各自的许可协议。')}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
