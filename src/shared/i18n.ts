/**
 * 轻量 i18n。
 *
 * 设计取舍：**用中文原文当 key**，而不是 `settings.render.title` 这种符号键。
 * 原因：这个项目的中文文案是边写边改的，符号键会让"改一句话要动三个文件"；
 * 用原文当 key 时，界面上写 `t('渲染精度')`，字典里缺条目就自动回落成中文，
 * 永远不会出现"忘了加 key 导致界面空白"。
 *
 * 来自模型文件的文案（表情名、热键名、参数名、模型名）不进字典 —— 那是作者原文，不翻译。
 */

export type Lang = 'zh' | 'zh-Hant' | 'en' | 'ja';

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'zh', label: '简体中文' },
  { id: 'zh-Hant', label: '繁體中文' },
  { id: 'en', label: 'English' },
  { id: 'ja', label: '日本語' },
];

type Dict = Record<string, string>;

/* ------------------------------------------------------------------ */
/* English                                                             */
/* ------------------------------------------------------------------ */
const EN: Dict = {
  // 通用
  设置: 'Settings',
  概览: 'Overview',
  模型: 'Models',
  快捷键: 'Hotkeys',
  参数映射: 'Parameters',
  面部捕捉: 'Face Tracking',
  关闭: 'Off',
  开启: 'On',
  启用: 'Enable',
  已启用: 'Enabled',
  已关闭: 'Disabled',
  已注册: 'Registered',
  使用: 'Use',
  使用中: 'In use',
  删除: 'Delete',
  导入: 'Import',
  类型: 'Type',
  状态: 'Status',
  名称: 'Name',
  操作: 'Action',
  说明: 'Notes',
  预览: 'Preview',
  '搜索名称/按键': 'Search name / key',
  清空: 'Clear',
  重置: 'Reset',
  待机: 'Idle',
  表情: 'Expression',
  动作: 'Motion',
  穿透: 'Pass-through',
  标准参数: 'Standard params',
  '（导入模型，未提供）': '(imported model, not provided)',
  'VTS 原键': 'VTS key',
  '· 含 VTS 配置': ' · VTS config included',

  // 概览
  '简称 lLP · 融合 VTube Studio 的精准驾驭 与 Live2DViewerEX 的桌面驻留 —— 面部捕捉驱动 + 全局快捷键动作':
    'lLP · VTube Studio-grade model driving meets Live2DViewerEX-style desktop dwelling — face tracking + global hotkeys',
  渲染帧率: 'Render FPS',
  表情叠加: 'Active expressions',
  模型参数: 'Model params',
  桌宠概况: 'Pet status',
  当前状态: 'Current state',
  快捷键速查: 'Hotkey cheat sheet',
  '可在「快捷键」页改键': 'Rebind on the Hotkeys tab',
  '详细选项在「设置」页按分类整理': 'Detailed options are grouped in Settings',
  '鼠标控制、右键菜单、置顶、任务栏与虚拟桌面等选项，统一在「设置 → 窗口与交互」调整。':
    'Mouse control, context menu, always-on-top, taskbar and virtual-desktop options live in Settings → Window & Input.',
  缩放: 'Scale',
  不透明度: 'Opacity',
  鼠标控制: 'Mouse control',
  追踪: 'Tracking',
  '头部 X / Y / Z': 'Head X / Y / Z',
  当前动作: 'Current motion',
  正在叠加的表情: 'Active expressions',
  无: 'none',

  // 面部捕捉
  摄像头: 'Camera',
  默认设备: 'Default device',
  捕捉开关: 'Capture',
  '开启后由你本人的表情驱动桌宠；关闭则使用鼠标注视 + 自动眨眼':
    'When on, your own face drives the pet; when off, it follows the cursor and blinks automatically',
  镜像摄像头: 'Mirror camera',
  '自己的左右与模型的左右一致（推荐开启）': 'Keeps your left/right aligned with the model (recommended)',
  响应调校: 'Response tuning',
  平滑: 'Smoothing',
  '越大越柔和，越小越灵敏（对应 VTS 的 Smoothing）': 'Higher is smoother, lower is snappier (VTS “Smoothing”)',
  死区: 'Dead zone',
  '抵消静止时的细微抖动': 'Cancels micro-jitter while you hold still',
  '左右幅度': 'Yaw gain',
  '上下幅度': 'Pitch gain',
  '歪头幅度': 'Roll gain',
  '视线幅度': 'Gaze gain',
  '口型幅度': 'Mouth gain',
  '睁闭眼幅度': 'Blink gain',
  '越大越容易闭死、眨眼越明显；也能把瞪眼放大': 'Higher makes blinks close fully and eye-widening stronger',
  方向反转: 'Invert axis',
  '如果模型转头方向与你相反，就打开对应的开关': 'Turn these on if the model turns the opposite way',
  左右: 'Yaw',
  上下: 'Pitch',
  歪头: 'Roll',
  鼠标注视: 'Cursor gaze',
  '未开启摄像头时，用鼠标位置驱动头部朝向与眼神': 'Without a camera, head and gaze follow the cursor',
  鼠标注视范围: 'Cursor gaze range',
  '1.0 = 整块屏幕；桌宠贴在角落时也能看满全屏，嫌不够灵敏就往上调':
    '1.0 = whole screen; raise it if the gaze feels too weak when the pet sits in a corner',
  中性位姿校准: 'Neutral pose calibration',
  实时数据: 'Live data',
  摄像头未开启: 'Camera off',
  '来自桌宠进程的实时画面': 'Live feed from the pet process',
  人脸锁定: 'Face locked',
  等待人脸: 'Waiting for face',
  捕捉中: 'Tracking',
  捕捉关闭: 'Tracking off',
  '运行中 · 已锁脸': 'Running · face locked',
  '运行中 · 未检测到脸': 'Running · no face detected',
  '模型已加载': 'Model loaded',
  '模型未加载': 'Model not loaded',
  'MediaPipe FaceLandmarker：478 关键点 + 52 组表情系数 + 头部姿态，驱动模型参数':
    'MediaPipe FaceLandmarker: 478 landmarks + 52 blendshapes + head pose driving the model parameters',

  // 模型页
  '导入、切换、删除桌宠使用的 Live2D 模型': 'Import, switch and remove the Live2D models used by the pet',
  导入模型: 'Import model',
  '支持 .zip 压缩包': 'Accepts .zip archives',
  '模型库': 'Model library',
  '选择 zip 导入': 'Choose a .zip to import',
  刷新列表: 'Refresh',
  正在导入: 'Importing…',
  '还没有可用模型。': 'No models available yet.',
  内置: 'Built-in',
  导入的: 'Imported',
  当前模型: 'Current model',
  模型名称: 'Model name',
  资源路径: 'Resource path',
  重新加载: 'Reload',
  '重新加载模型': 'Reload model',
  '修改模型资源或上面的裁剪蒙版精度后，无需重启应用': 'Pick up changed resources or mask precision without restarting',
  '切换到自定义模型后，这里会显示对应目录': 'Shows the model directory after switching to a custom model',
  数据与关于: 'Data & About',
  重置全部设置: 'Reset all settings',
  '快捷键绑定、参数映射、窗口位置全部恢复默认': 'Hotkey bindings, parameter mappings and window position go back to defaults',
  恢复默认: 'Restore defaults',
  项目: 'Project',
  项目作者: 'Authors',
  技术说明: 'Technical notes',
  版权声明: 'Copyright',
  '内置模型不能删除': 'Built-in models cannot be deleted',

  // 快捷键
  '热键绑定': 'Hotkey bindings',
  '绑定列表': 'Bindings',
  '新增自定义热键': 'Add custom hotkey',
  '把模型里的任意表情/动作绑到任意按键': 'Bind any expression/motion of the model to any key',
  '自定义热键': 'Custom hotkeys',
  显示名称: 'Display name',
  '显示名称（可选）': 'Display name (optional)',
  '按任意组合键…': 'Press a key combination…',
  '按组合键…': 'Press a key combination…',
  点击录制按键: 'Click to record a key',
  当前绑定: 'Current binding',
  清空全部表情: 'Clear all expressions',
  清除表情: 'Clear expressions',

  // 参数映射
  输入: 'Input',
  输出参数: 'Output parameter',
  输入范围: 'Input range',
  输出范围: 'Output range',
  '共 {n} 条': '{n} mappings',
  '把当前映射导出/恢复': 'Restore the default mapping table',

  // 设置
  '按用途分成五组，下面切换分类': 'Grouped into five sections — pick one below',
  画面与渲染: 'Visuals & Rendering',
  模型行为: 'Model Behaviour',
  窗口与交互: 'Window & Input',
  系统与启动: 'System & Startup',
  模型与数据: 'Model & Data',
  '清晰度、过渡、光效与蒙版': 'Sharpness, transitions, glow and masks',
  '待机、呼吸、眨眼、物理': 'Idle, breathing, blinking, physics',
  '鼠标、缩放、透明度、置顶': 'Mouse, scale, opacity, always-on-top',
  '开机自启、托盘、运行信息': 'Autostart, tray, runtime info',
  '当前模型、重新加载、重置': 'Current model, reload, reset',
  语言: 'Language',
  '界面语言，切换后立即生效；模型自带的名称不会被翻译':
    'UI language. Applies immediately; names that come from model files are not translated',
  渲染精度: 'Render scale',
  '0 = 自动跟随显示器缩放（1:1 物理像素，最清晰）；显卡吃紧时可调低':
    '0 = follow the monitor scale (1:1 physical pixels, sharpest); lower it if the GPU struggles',
  裁剪蒙版精度: 'Clipping mask precision',
  '模型加载时生效，数值越高被蒙版裁切的边缘越锐。改完需要到「模型与数据」点重新加载':
    'Applied on model load; higher means sharper masked edges. Reload the model afterwards',
  '256（库默认）': '256 (library default)',
  '1024（推荐）': '1024 (recommended)',
  过渡时长: 'Transition duration',
  '表情/动作淡入淡出的倍率；整块换装类变化需要放慢时调大':
    'Multiplier for expression/motion fades; raise it for whole-outfit changes',
  边缘光效强度: 'Rim light strength',
  '模型自带的轮廓柔光（rim-light）层的强度。有些模型没有这一层，调它不会有变化':
    'Strength of the built-in rim-light layer. Models without such a layer ignore this',
  关闭边缘光效: 'Disable rim light',
  '把轮廓柔光层整个隐藏，比把强度调到 0 更干净': 'Hides the rim-light layer entirely, cleaner than setting it to 0',
  隐藏占位网格: 'Hide placeholder meshes',
  '部分模型会在鼻梁等位置用纯色占位网格，开启后自动隐藏。模型没有这类网格时无影响':
    'Some models carry flat placeholder meshes (e.g. on the nose); they are hidden when enabled',
  调试浮层: 'Debug overlay',
  '在桌宠窗口左上角显示帧率/角度/表情': 'Show FPS / angles / expressions in the pet window',
  待机动作: 'Idle animation',
  '空闲时循环播放模型自带的待机动画': 'Loop the model’s own idle animation while inactive',
  丢失追踪时播放待机: 'Play idle when tracking is lost',
  '离开摄像头、丢失人脸后切回待机动画': 'Fall back to the idle animation after leaving the camera or losing the face',
  呼吸: 'Breathing',
  '叠加一层缓慢的呼吸起伏（依赖模型的呼吸参数）': 'Adds a slow breathing sway (needs the model’s breath parameter)',
  自动眨眼: 'Auto blink',
  '没有真实眨眼数据时，由程序按间隔自动眨眼': 'Blinks on a timer when no real blink data is available',
  物理演算: 'Physics',
  '按模型自带的物理设定计算头发、衣摆等部件的摆动。关闭后这些部件保持静止':
    'Drives hair and cloth with the model’s own physics settings; turning it off freezes them',
  '决定桌宠窗口如何接收鼠标': 'Controls how the pet window receives the mouse',
  '开启：左键拖动、滚轮缩放、右键菜单都可用（只有点到模型轮廓时才接收）。关闭：整个窗口穿透，点击直接落到后面的界面':
    'On: drag with left button, scroll to scale, right-click menu (only when clicking the model itself). Off: the whole window is click-through',
  右键弹出窗口: 'Right-click menu',
  '开启后右键模型弹出与托盘一致的菜单；关闭则右键不弹窗':
    'Right-clicking the model opens the tray menu; turn off to disable it',
  窗口外观: 'Window appearance',
  '桌宠整体大小': 'Overall size of the pet',
  '浮在普通窗口之上': 'Float above normal windows',
  所有虚拟桌面可见: 'Show on all virtual desktops',
  在任务栏隐藏: 'Hide from taskbar',
  '只保留托盘图标': 'Keep only the tray icon',
  '桌宠回到屏幕中心，取消所有表情与动作，缩放恢复 100%':
    'Re-centres the pet, clears all expressions and motions, resets scale to 100%',
  重置模型状态: 'Reset model state',
  开机自启: 'Launch at login',
  '随系统启动时自动运行桌宠（只显示桌宠，不弹控制台）': 'Start the pet with the system (pet only, no console window)',
  托盘常驻: 'Tray icon',
  '左键打开控制台，右键打开菜单（含鼠标控制、缩放、重置、退出）':
    'Left-click opens the console, right-click opens the menu (mouse control, scale, reset, quit)',
  应用版本: 'App version',
  资源目录: 'Resource directory',
  '程序读取模型与前端资源的目录': 'Where the app reads models and front-end assets',
  运行平台: 'Platform',

  // 输入提示 / 消息
  '正在连接桌宠进程…': 'Connecting to the pet process…',
  '确定要恢复所有默认设置吗？': 'Restore all default settings?',
  '模型库共 {n} 个': '{n} in the library',
  '{n} 个': '{n}',
  '{n} 参数': '{n} params',
  '已切换到「{name}」，桌宠正在重新加载模型': 'Switched to “{name}”, reloading the pet model',
  '已删除「{name}」': 'Deleted “{name}”',
  '导入失败：{msg}': 'Import failed: {msg}',
  '切换失败：{msg}': 'Switch failed: {msg}',
  '删除失败：{msg}': 'Delete failed: {msg}',
  '确定要删除模型「{name}」吗？\n\n这会连同它在磁盘上的资源一起删除，无法撤销。':
    'Delete the model “{name}”?\n\nIts files on disk will be removed as well. This cannot be undone.',
  '自动({v}×)': 'Auto ({v}×)',
  '摄像头 {n}': 'Camera {n}',
  '共 {n} 条热键，全部注册为系统级全局热键 —— 桌宠不在前台也能触发':
    '{n} hotkeys, all registered as system-wide global hotkeys — works even when the pet is not focused',
  '当前模型没有可用的热键，可在下方「新增自定义热键」里把任意表情/动作绑到按键':
    'This model has no hotkeys. Use “Add custom hotkey” below to bind any expression/motion',
  '。绑定关系来自模型附带的 VTube Studio 配置（.vtube.json），已按原样保留':
    '. Bindings come from the model’s VTube Studio config (.vtube.json) and are kept as-is',
  '。该模型没有 VTube Studio 配置，按键是按表情自动分配的，可逐条改绑':
    '. This model has no VTube Studio config; keys were auto-assigned from expressions and can be rebound',
  '这张表来自模型的 VTube Studio 配置（ParameterSettings），是作者调好的"表情输入 → Live2D 参数"对应关系。':
    'This table comes from the model’s VTube Studio config (ParameterSettings) — the author’s “expression input → Live2D parameter” mapping.',
  '该模型没有 VTube Studio 配置，这张表由 Cubism 标准参数按模型实有参数自动生成。':
    'This model has no VTube Studio config; the table is generated from Cubism standard parameters that the model actually has.',
  '这张表由程序的通用参数映射生成。': 'This table is generated from the app’s generic parameter mapping.',
  '改这里就等于改桌宠的性格。': 'Changing this changes the pet’s personality.',
  ' · 含 VTS 配置': ' · VTS config included',
  'Electron + React + pixi.js 构建界面与窗口层。': 'Electron + React + pixi.js for the UI and window layer.',
  'Live2D 绑定：': 'Live2D rigging: ',
  'MediaPipe 等）遵循各自的许可协议。': 'MediaPipe, etc.) follow their own licences.',
  'live2dLumiPet（简称 lLP）': 'live2dLumiPet (lLP)',
  '· Live2D 是株式会社 Live2D 的商标，本项目为非官方作品，与其无隶属或合作关系。': '· Live2D is a trademark of Live2D Inc. This is an unofficial project with no affiliation or partnership.',
  '· 切换模型会重建': '· Switching models rebuilds ',
  '· 导入的模型存放在用户数据目录，卸载应用不会删除；内置模型随应用发布，删除按钮对它不可用。': '· Imported models live in the user data folder and survive uninstalling. The built-in model ships with the app and cannot be deleted.',
  '· 本项目为开源项目，源代码以 MIT 许可发布；所依赖的第三方组件（Electron / pixi.js / React /': '· This is an open-source project released under the MIT licence; bundled third-party components (Electron / pixi.js / React /',
  '· 模型版权归各自作者所有。内置模型为免费配布，使用请遵守模型压缩包内的使用条款；': '· Models remain the property of their authors. The bundled model is distributed for free — follow the terms inside its archive;',
  '· 若模型带': '· If the model ships a ',
  '… 还有 {n} 条': '… and {n} more',
  '「平滑」越大模型跟随越慢、越柔和；「启用」关掉后该参数不再由追踪写入（可用来只保留物理/动作控制）。': 'Higher “Smoothing” makes the model follow more slowly and softly. Turning a parameter off keeps it from being written by tracking (useful to leave it to physics/motion only).',
  '与': ' and ',
  '之后你的中性表情就会对应模型的正面视角。若发现左右相反，关掉「镜像摄像头」再试。': 'Your neutral expression then maps to the model facing forward. If left/right feels reversed, turn off “Mirror camera”.',
  '原画 / 拆分：': 'Art / PSD split: ',
  '参数映射 {n} 条（原样复刻 VTube Studio 的追踪表）': '{n} parameter mappings (a faithful copy of the VTube Studio tracking table)',
  '参数映射适配': 'Parameter mapping adaptation',
  '右眼开合': 'Right eye open',
  '启用摄像头捕捉': 'Enable camera capture',
  '吾名契白淮（B站） / Aley_Soler（GitHub） / DeepSeek（大肥鱼）': '吾名契白淮（Bilibili） / Aley_Soler（GitHub） / DeepSeek（大肥鱼）',
  '嘴巴张开': 'Mouth open',
  '头部 X（左右）': 'Head X (yaw)',
  '头部 Y（上下）': 'Head Y (pitch)',
  '头部 Z（歪头）': 'Head Z (roll)',
  '始终置顶': 'Always on top',
  '存放位置：': 'Location: ',
  '完成校准（{n} 帧）': 'Finish calibration ({n} frames)',
  '导入时会自动做三件事：': 'Importing does three things automatically: ',
  '左眼开合': 'Left eye open',
  '已导入「{name}」：{e} 表情 · {m} 动作 · {h} 热键 · {p}': 'Imported “{name}”: {e} expressions · {m} motions · {h} hotkeys · {p}',
  '当前偏移 X {x}° / Y {y}° / Z {z}°': 'Offset X {x}° / Y {y}° / Z {z}°',
  '影响桌宠的成像质量与特效': 'Image quality and effects of the pet',
  '恢复 VTS 默认': 'Restore VTS defaults',
  '把模型文件夹压成 zip 即可（Cubism 3/4/5 的': 'Just zip the model folder (any Cubism 3/4/5 ',
  '摄像头未开启 / 等待画面…': 'Camera off / waiting for frames…',
  '本程序使用 Live2D Cubism SDK for Web 渲染模型，MediaPipe Face Landmarker 提供面部捕捉，': 'This app renders models with Live2D Cubism SDK for Web and uses MediaPipe Face Landmarker for face tracking, plus',
  '桌宠控制台': 'Pet console',
  '模型自身的动作与参数表现': 'How the model moves and reacts',
  '模型）。': ' model).',
  '正在叠加的表情：': 'Active expressions: ',
  '正在导入…': 'Importing…',
  '正坐并开始校准': 'Sit up straight and calibrate',
  '添加': 'Add',
  '点击「当前绑定」里的按键框，然后按下新的组合键即可改绑。Esc 取消。若显示「被其他程序占用」，说明该组合被别的软件（或另一个输入法）抢走了，换一个即可。': 'Click the key box under “Current binding” and press the new combination. Esc cancels. If it shows “taken by another program”, another app (or an IME) already owns that combination — pick another.',
  '热键适配': 'Hotkey adaptation',
  '由用户导入，版权归该模型作者所有': 'Imported by the user; copyright belongs to the model author',
  '窗口位置、缩放、透明度等偏好会保留。': 'Window position, scale and opacity are preserved.',
  '自建': 'Custom',
  '表情 {e} · 动作 {m} · 热键 {h} · 参数 {p}': '{e} expressions · {m} motions · {h} hotkeys · {p} params',
  '表情 {e} · 动作 {m} · 热键 {h} 条（来自模型自带的 .vtube.json）': '{e} expressions · {m} motions · {h} hotkeys (from the model’s own .vtube.json)',
  '表现和 VTS 里最接近。': 'so it behaves closest to what you see in VTS.',
  '识别帧率 {t} FPS · 渲染 {r} FPS': 'Tracking {t} FPS · Render {r} FPS',
  '试一下': 'Try it',
  '资源归一化': 'Resource normalisation',
  '追踪错误：': 'Tracking error: ',
  '通过本程序导入的模型，其版权与使用限制由该模型作者决定。': 'Models imported through this app keep whatever copyright and usage limits their authors set.',
  '错误：': 'Error: ',
  '面朝摄像头自然坐好 → 点「正坐并开始校准」→ 保持不动约 2 秒 → 点完成。': 'Sit naturally facing the camera → click “Sit up straight and calibrate” → hold still for ~2 seconds → click Finish.',
  '鼠标与交互': 'Mouse & Input',
  '（VTube Studio 导出配置），其中的热键与参数表会被完整复用，': ' (a VTube Studio export), its hotkeys and parameter table are reused as-is, ',
  '（不同模型的参数表不一样，沿用旧的会全部失效），': ' (parameter tables differ between models, so keeping the old one would silently break everything), ',
  '（优先读包内的 VTube Studio 配置，没有就按表情自动生成）、': ' (uses the VTube Studio config if present, otherwise auto-assigns from expressions), ',
  '（有 VTS 参数表就照搬，没有就用 Cubism 标准参数表）。': ' (copies the VTS parameter table, otherwise falls back to the Cubism standard set).',
  '（贴图/动作/表情统一改名，避免中文路径问题）、': ' (textures/motions/expressions are renamed to plain ASCII paths), ',
  '模型开关': 'Model switch',
  '关闭后卸载模型并释放显存，再次打开会重新加载': 'Turning it off unloads the model and frees GPU memory; turning it on reloads',
  '启用模型': 'Enable model',
  '关闭 = 卸载模型（桌宠窗口仍在，只是不渲染）；打开 = 重新加载': 'Off = unload the model (the pet window stays, nothing is drawn); On = reload',
  '还没有可用模型，导入后此开关会自动打开': 'No model yet — this switch turns on automatically after you import one',
  '暂无模型，请先导入一个 .zip': 'No model yet. Import a .zip to get started.',
  '暂无模型，请于「模型」中导入': 'No model — import one on the Models tab',
  '暂无模型': 'No model',
  '程序不附带任何模型，模型由用户自行导入，版权归该模型作者所有': 'No models are bundled. Models are imported by the user and remain the property of their authors.',
  '表情 {e} · 动作 {m} · 热键 {h} 条': '{e} expressions · {m} motions · {h} hotkeys',
  '参数映射 {n} 条': '{n} parameter mappings',
  '· 本程序不附带任何模型。导入的模型存放在用户数据目录，卸载应用不会删除。': '· No models are bundled. Imported models live in the user data folder and survive uninstalling.',
};

/* ------------------------------------------------------------------ */
/* 日本語                                                              */
/* ------------------------------------------------------------------ */
const JA: Dict = {
  设置: '設定',
  概览: '概要',
  模型: 'モデル',
  快捷键: 'ホットキー',
  参数映射: 'パラメータ',
  面部捕捉: '顔トラッキング',
  关闭: 'オフ',
  开启: 'オン',
  启用: '有効',
  已启用: '有効',
  已关闭: '無効',
  已注册: '登録済み',
  使用: '使用',
  使用中: '使用中',
  删除: '削除',
  导入: 'インポート',
  类型: '種類',
  状态: '状態',
  名称: '名前',
  操作: '操作',
  说明: '説明',
  预览: 'プレビュー',
  '搜索名称/按键': '名前・キーで検索',
  清空: 'クリア',
  重置: 'リセット',
  待机: '待機',
  表情: '表情',
  动作: 'モーション',
  穿透: 'クリック透過',
  标准参数: '標準パラメータ',
  '（导入模型，未提供）': '（インポートモデル・未提供）',
  'VTS 原键': 'VTS キー',
  '· 含 VTS 配置': ' · VTS 設定あり',

    '简称 lLP · 融合 VTube Studio 的精准驾驭 与 Live2DViewerEX 的桌面驻留 —— 面部捕捉驱动 + 全局快捷键动作':
    'lLP · VTube Studio 級のモデル操作と Live2DViewerEX 風のデスクトップ常駐を一つに — 顔トラッキング + グローバルホットキー',
  渲染帧率: '描画 FPS',
  表情叠加: '適用中の表情',
  模型参数: 'モデルパラメータ',
  桌宠概况: 'ペットの状態',
  当前状态: '現在の状態',
  快捷键速查: 'ホットキー一覧',
  '可在「快捷键」页改键': '「ホットキー」タブで変更できます',
  '详细选项在「设置」页按分类整理': '詳細な項目は「設定」に分類してあります',
  '鼠标控制、右键菜单、置顶、任务栏与虚拟桌面等选项，统一在「设置 → 窗口与交互」调整。':
    'マウス操作・右クリックメニュー・最前面・タスクバーなどの設定は「設定 → ウィンドウと操作」にまとまっています。',
  缩放: '拡大率',
  不透明度: '不透明度',
  鼠标控制: 'マウス操作',
  追踪: 'トラッキング',
  '头部 X / Y / Z': '頭部 X / Y / Z',
  当前动作: '現在のモーション',
  正在叠加的表情: '適用中の表情',
  无: 'なし',

  摄像头: 'カメラ',
  默认设备: '既定のデバイス',
  捕捉开关: 'キャプチャ',
  '开启后由你本人的表情驱动桌宠；关闭则使用鼠标注视 + 自动眨眼':
    'オンにすると自分の表情でペットが動きます。オフではマウス追従と自動まばたきになります',
  镜像摄像头: 'カメラを鏡像',
  '自己的左右与模型的左右一致（推荐开启）': '自分の左右とモデルの左右が一致します（推奨）',
  响应调校: '反応の調整',
  平滑: 'スムージング',
  '越大越柔和，越小越灵敏（对应 VTS 的 Smoothing）': '大きいほど滑らか、小さいほど機敏（VTS の Smoothing）',
  死区: 'デッドゾーン',
  '抵消静止时的细微抖动': '静止時の細かな揺れを抑えます',
  '左右幅度': '左右の感度',
  '上下幅度': '上下の感度',
  '歪头幅度': '傾きの感度',
  '视线幅度': '視線の感度',
  '口型幅度': '口パクの感度',
  '睁闭眼幅度': 'まばたきの感度',
  '越大越容易闭死、眨眼越明显；也能把瞪眼放大': '大きいほど完全に閉じ、見開きも強調されます',
  方向反转: '軸の反転',
  '如果模型转头方向与你相反，就打开对应的开关': 'モデルが逆方向を向く場合は該当スイッチをオンに',
  左右: '左右',
  上下: '上下',
  歪头: '傾き',
  鼠标注视: 'マウス追従',
  '未开启摄像头时，用鼠标位置驱动头部朝向与眼神': 'カメラ未使用時はマウス位置で頭の向きと視線を動かします',
  鼠标注视范围: 'マウス追従の範囲',
  '1.0 = 整块屏幕；桌宠贴在角落时也能看满全屏，嫌不够灵敏就往上调':
    '1.0 = 画面全体。隅にいても全画面を見せたい／もっと敏感にしたいなら上げてください',
  中性位姿校准: 'ニュートラル姿勢の調整',
  实时数据: 'リアルタイムデータ',
  摄像头未开启: 'カメラ未使用',
  '来自桌宠进程的实时画面': 'ペットプロセスからのライブ映像',
  人脸锁定: '顔を検出',
  等待人脸: '顔を待機中',
  捕捉中: 'トラッキング中',
  捕捉关闭: 'トラッキング停止',
  '运行中 · 已锁脸': '稼働中 · 顔を検出',
  '运行中 · 未检测到脸': '稼働中 · 顔が見つかりません',
  模型已加载: 'モデル読み込み済み',
  模型未加载: 'モデル未読み込み',
  'MediaPipe FaceLandmarker：478 关键点 + 52 组表情系数 + 头部姿态，驱动模型参数':
    'MediaPipe FaceLandmarker：478 ランドマーク + 52 表情係数 + 頭部姿勢でモデルを駆動',

  '导入、切换、删除桌宠使用的 Live2D 模型': 'ペットが使う Live2D モデルのインポート・切り替え・削除',
  导入模型: 'モデルをインポート',
  '支持 .zip 压缩包': '.zip に対応',
  模型库: 'モデル一覧',
  '选择 zip 导入': '.zip を選んでインポート',
  刷新列表: '再読み込み',
  正在导入: 'インポート中…',
  '还没有可用模型。': '利用できるモデルがありません。',
  内置: '内蔵',
  导入的: 'インポート',
  当前模型: '現在のモデル',
  模型名称: 'モデル名',
  资源路径: 'リソースパス',
  重新加载: '再読み込み',
  '重新加载模型': 'モデルを再読み込み',
  '修改模型资源或上面的裁剪蒙版精度后，无需重启应用':
    'リソースやクリッピングマスク精度の変更はアプリ再起動なしで反映できます',
  '切换到自定义模型后，这里会显示对应目录': 'カスタムモデルに切り替えるとそのフォルダが表示されます',
  数据与关于: 'データと情報',
  重置全部设置: 'すべての設定を初期化',
  '快捷键绑定、参数映射、窗口位置全部恢复默认': 'ホットキー・パラメータ対応・ウィンドウ位置を既定に戻します',
  恢复默认: '初期化',
  项目: 'プロジェクト',
  项目作者: '作者',
  技术说明: '技術情報',
  版权声明: '著作権',
  '内置模型不能删除': '内蔵モデルは削除できません',

  热键绑定: 'ホットキーの割り当て',
  绑定列表: '割り当て一覧',
  '新增自定义热键': 'カスタムホットキーを追加',
  '把模型里的任意表情/动作绑到任意按键': 'モデルの任意の表情／モーションを任意のキーに割り当てます',
  自定义热键: 'カスタムホットキー',
  显示名称: '表示名',
  '显示名称（可选）': '表示名（任意）',
  '按任意组合键…': 'キーの組み合わせを押してください…',
  '按组合键…': 'キーの組み合わせを押してください…',
  点击录制按键: 'クリックしてキーを記録',
  当前绑定: '現在の割り当て',
  清空全部表情: 'すべての表情をクリア',
  清除表情: '表情をクリア',

  输入: '入力',
  输出参数: '出力パラメータ',
  输入范围: '入力範囲',
  输出范围: '出力範囲',
  '共 {n} 条': '{n} 件',
  '把当前映射导出/恢复': '既定の対応表に戻す',

  '按用途分成五组，下面切换分类': '用途ごとに 5 分類しています。下から切り替えてください',
  画面与渲染: '映像と描画',
  模型行为: 'モデルの挙動',
  窗口与交互: 'ウィンドウと操作',
  系统与启动: 'システムと起動',
  '模型与数据': 'モデルとデータ',
  '清晰度、过渡、光效与蒙版': '解像感・トランジション・発光・マスク',
  '待机、呼吸、眨眼、物理': '待機・呼吸・まばたき・物理',
  '鼠标、缩放、透明度、置顶': 'マウス・拡大率・不透明度・最前面',
  '开机自启、托盘、运行信息': '自動起動・トレイ・動作情報',
  '当前模型、重新加载、重置': '現在のモデル・再読み込み・リセット',
  语言: '言語',
  '界面语言，切换后立即生效；模型自带的名称不会被翻译':
    'UI の言語です。すぐに反映されます。モデル由来の名称は翻訳されません',
  渲染精度: '描画精度',
  '0 = 自动跟随显示器缩放（1:1 物理像素，最清晰）；显卡吃紧时可调低':
    '0 = モニターの拡大率に追従（1:1 物理ピクセルで最も精細）。GPU が厳しければ下げてください',
  裁剪蒙版精度: 'クリッピングマスク精度',
  '模型加载时生效，数值越高被蒙版裁切的边缘越锐。改完需要到「模型与数据」点重新加载':
    'モデル読み込み時に適用。高いほどマスク境界が精細になります。変更後は再読み込みしてください',
  '256（库默认）': '256（ライブラリ既定）',
  '1024（推荐）': '1024（推奨）',
  过渡时长: 'トランジション時間',
  '表情/动作淡入淡出的倍率；整块换装类变化需要放慢时调大':
    '表情・モーションのフェード倍率。衣装全体の切り替えは大きめに',
  边缘光效强度: 'リムライトの強さ',
  '模型自带的轮廓柔光（rim-light）层的强度。有些模型没有这一层，调它不会有变化':
    'モデル内蔵のリムライトレイヤーの強さ。そのレイヤーがないモデルでは変化しません',
  关闭边缘光效: 'リムライトを無効化',
  '把轮廓柔光层整个隐藏，比把强度调到 0 更干净': 'リムライトレイヤーを完全に隠します（0 にするより綺麗）',
  隐藏占位网格: 'プレースホルダーメッシュを隠す',
  '部分模型会在鼻梁等位置用纯色占位网格，开启后自动隐藏。模型没有这类网格时无影响':
    '一部のモデルにある単色のプレースホルダー（鼻筋など）を隠します。無いモデルでは影響ありません',
  调试浮层: 'デバッグ表示',
  '在桌宠窗口左上角显示帧率/角度/表情': 'ペットウィンドウ左上に FPS／角度／表情を表示',
  待机动作: '待機モーション',
  '空闲时循环播放模型自带的待机动画': '無操作時にモデル内蔵の待機モーションをループ再生',
  丢失追踪时播放待机: 'トラッキング喪失時に待機へ',
  '离开摄像头、丢失人脸后切回待机动画': 'カメラから離れる・顔を見失うと待機モーションに戻ります',
  呼吸: '呼吸',
  '叠加一层缓慢的呼吸起伏（依赖模型的呼吸参数）': 'ゆっくりした呼吸の揺れを加えます（呼吸パラメータが必要）',
  自动眨眼: '自動まばたき',
  '没有真实眨眼数据时，由程序按间隔自动眨眼': '実際のまばたきデータがない時に一定間隔でまばたきします',
  物理演算: '物理演算',
  '按模型自带的物理设定计算头发、衣摆等部件的摆动。关闭后这些部件保持静止':
    'モデル内蔵の物理設定で髪や服の揺れを計算します。オフにすると静止します',
  '决定桌宠窗口如何接收鼠标': 'ペットウィンドウのマウス受け取り方を決めます',
  '开启：左键拖动、滚轮缩放、右键菜单都可用（只有点到模型轮廓时才接收）。关闭：整个窗口穿透，点击直接落到后面的界面':
    'オン：左ドラッグ・ホイール拡大・右クリックメニューが使えます（モデルの輪郭上のみ反応）。オフ：ウィンドウ全体がクリック透過になります',
  右键弹出窗口: '右クリックメニュー',
  '开启后右键模型弹出与托盘一致的菜单；关闭则右键不弹窗':
    'モデルを右クリックするとトレイと同じメニューが出ます。オフで無効',
  窗口外观: 'ウィンドウの見た目',
  '桌宠整体大小': 'ペット全体の大きさ',
  '浮在普通窗口之上': '通常のウィンドウより前面に表示',
  所有虚拟桌面可见: 'すべての仮想デスクトップで表示',
  在任务栏隐藏: 'タスクバーに表示しない',
  '只保留托盘图标': 'トレイアイコンのみ残します',
  '桌宠回到屏幕中心，取消所有表情与动作，缩放恢复 100%':
    '画面中央に戻し、表情とモーションを解除、拡大率を 100% に戻します',
  重置模型状态: 'モデル状態をリセット',
  开机自启: 'スタートアップに登録',
  '随系统启动时自动运行桌宠（只显示桌宠，不弹控制台）': 'OS 起動時にペットを自動起動（コンソールは開きません）',
  托盘常驻: 'トレイ常駐',
  '左键打开控制台，右键打开菜单（含鼠标控制、缩放、重置、退出）':
    '左クリックでコンソール、右クリックでメニュー（マウス操作・拡大率・リセット・終了）',
  应用版本: 'アプリのバージョン',
  资源目录: 'リソースフォルダ',
  '程序读取模型与前端资源的目录': 'モデルとフロントエンド資源を読み込むフォルダ',
  运行平台: 'プラットフォーム',

  '正在连接桌宠进程…': 'ペットプロセスに接続中…',
  '确定要恢复所有默认设置吗？': 'すべての設定を初期化しますか？',
  '模型库共 {n} 个': '全 {n} 件',
  '{n} 个': '{n} 件',
  '{n} 参数': '{n} パラメータ',
  '已切换到「{name}」，桌宠正在重新加载模型': '「{name}」に切り替えました。モデルを再読み込み中です',
  '已删除「{name}」': '「{name}」を削除しました',
  '导入失败：{msg}': 'インポート失敗：{msg}',
  '切换失败：{msg}': '切り替え失敗：{msg}',
  '删除失败：{msg}': '削除失敗：{msg}',
  '确定要删除模型「{name}」吗？\n\n这会连同它在磁盘上的资源一起删除，无法撤销。':
    'モデル「{name}」を削除しますか？\n\nディスク上のファイルも削除され、元に戻せません。',
  '自动({v}×)': '自動（{v}×）',
  '摄像头 {n}': 'カメラ {n}',
  '共 {n} 条热键，全部注册为系统级全局热键 —— 桌宠不在前台也能触发':
    '{n} 件のホットキー。すべてグローバル登録済みで、ペットが非アクティブでも使えます',
  '当前模型没有可用的热键，可在下方「新增自定义热键」里把任意表情/动作绑到按键':
    'このモデルにはホットキーがありません。下の「カスタムホットキーを追加」で割り当てできます',
  '。绑定关系来自模型附带的 VTube Studio 配置（.vtube.json），已按原样保留':
    '。割り当てはモデル付属の VTube Studio 設定（.vtube.json）をそのまま使っています',
  '。该模型没有 VTube Studio 配置，按键是按表情自动分配的，可逐条改绑':
    '。このモデルには VTube Studio 設定がないため、表情から自動割り当てしました。個別に変更できます',
  '这张表来自模型的 VTube Studio 配置（ParameterSettings），是作者调好的"表情输入 → Live2D 参数"对应关系。':
    'この表はモデルの VTube Studio 設定（ParameterSettings）に基づく、作者調整済みの「表情入力 → Live2D パラメータ」対応です。',
  '该模型没有 VTube Studio 配置，这张表由 Cubism 标准参数按模型实有参数自动生成。':
    'このモデルには VTube Studio 設定がありません。モデルが実際に持つ Cubism 標準パラメータから自動生成しました。',
  '这张表由程序的通用参数映射生成。': 'この表はアプリの汎用パラメータ対応から生成されています。',
  '改这里就等于改桌宠的性格。': 'ここを変えるとペットの性格が変わります。',
  ' · 含 VTS 配置': ' · VTS 設定あり',
  'Electron + React + pixi.js 构建界面与窗口层。': 'UI とウィンドウ層は Electron + React + pixi.js で構築しています。',
  'Live2D 绑定：': 'Live2D リギング：',
  'MediaPipe 等）遵循各自的许可协议。': 'MediaPipe など）はそれぞれのライセンスに従います。',
  'live2dLumiPet（简称 lLP）': 'live2dLumiPet（略称 lLP）',
  '· Live2D 是株式会社 Live2D 的商标，本项目为非官方作品，与其无隶属或合作关系。': '· Live2D は株式会社 Live2D の商標です。本プロジェクトは非公式であり、同社と提携関係はありません。',
  '· 切换模型会重建': '· モデルを切り替えると ',
  '· 导入的模型存放在用户数据目录，卸载应用不会删除；内置模型随应用发布，删除按钮对它不可用。': '· インポートしたモデルはユーザーデータに保存され、アンインストールしても残ります。内蔵モデルはアプリに同梱され、削除できません。',
  '· 本项目为开源项目，源代码以 MIT 许可发布；所依赖的第三方组件（Electron / pixi.js / React /': '· 本プロジェクトは MIT ライセンスのオープンソースです。同梱のサードパーティ（Electron / pixi.js / React /',
  '· 模型版权归各自作者所有。内置模型为免费配布，使用请遵守模型压缩包内的使用条款；': '· モデルの著作権は各作者に帰属します。内蔵モデルは無償配布のため、同梱の利用規約に従ってください。',
  '· 若模型带': '· モデルに ',
  '… 还有 {n} 条': '… 他 {n} 件',
  '「平滑」越大模型跟随越慢、越柔和；「启用」关掉后该参数不再由追踪写入（可用来只保留物理/动作控制）。': '「スムージング」を大きくすると追従がゆっくり滑らかになります。「有効」を切るとそのパラメータはトラッキングから書き込まれなくなります（物理やモーションに任せたい時に便利）。',
  '与': ' と ',
  '之后你的中性表情就会对应模型的正面视角。若发现左右相反，关掉「镜像摄像头」再试。': '以後、無表情の状態がモデルの正面になります。左右が逆に感じる場合は「カメラを鏡像」を切ってください。',
  '原画 / 拆分：': '原画・PSD 分割：',
  '参数映射 {n} 条（原样复刻 VTube Studio 的追踪表）': 'パラメータ対応 {n} 件（VTube Studio のトラッキング表をそのまま再現）',
  '参数映射适配': 'パラメータ対応の適応',
  '右眼开合': '右目の開き',
  '启用摄像头捕捉': 'カメラキャプチャを有効化',
  '吾名契白淮（B站） / Aley_Soler（GitHub） / DeepSeek（大肥鱼）': '吾名契白淮（Bilibili） / Aley_Soler（GitHub） / DeepSeek（大肥鱼）',
  '嘴巴张开': '口の開き',
  '头部 X（左右）': '頭部 X（左右）',
  '头部 Y（上下）': '頭部 Y（上下）',
  '头部 Z（歪头）': '頭部 Z（傾き）',
  '始终置顶': '常に最前面',
  '存放位置：': '保存先：',
  '完成校准（{n} 帧）': 'キャリブレーション完了（{n} フレーム）',
  '导入时会自动做三件事：': 'インポート時に次の 3 つを自動で行います：',
  '左眼开合': '左目の開き',
  '已导入「{name}」：{e} 表情 · {m} 动作 · {h} 热键 · {p}': '「{name}」をインポートしました：表情 {e} · モーション {m} · ホットキー {h} · {p}',
  '当前偏移 X {x}° / Y {y}° / Z {z}°': '現在のオフセット X {x}° / Y {y}° / Z {z}°',
  '影响桌宠的成像质量与特效': 'ペットの画質とエフェクト',
  '恢复 VTS 默认': 'VTS 既定に戻す',
  '把模型文件夹压成 zip 即可（Cubism 3/4/5 的': 'モデルフォルダを zip にするだけです（Cubism 3/4/5 の',
  '摄像头未开启 / 等待画面…': 'カメラ未使用 / 映像を待機中…',
  '本程序使用 Live2D Cubism SDK for Web 渲染模型，MediaPipe Face Landmarker 提供面部捕捉，': '本アプリは Live2D Cubism SDK for Web でモデルを描画し、顔トラッキングに MediaPipe Face Landmarker を使用しています。',
  '桌宠控制台': 'ペットコンソール',
  '模型自身的动作与参数表现': 'モデル自身の動きと反応',
  '模型）。': ' モデル）。',
  '正在叠加的表情：': '適用中の表情：',
  '正在导入…': 'インポート中…',
  '正坐并开始校准': '正しい姿勢でキャリブレーション',
  '添加': '追加',
  '点击「当前绑定」里的按键框，然后按下新的组合键即可改绑。Esc 取消。若显示「被其他程序占用」，说明该组合被别的软件（或另一个输入法）抢走了，换一个即可。': '「現在の割り当て」のキー欄をクリックし、新しい組み合わせを押すと変更できます。Esc でキャンセル。「他のプログラムが使用中」と出る場合は別のアプリや IME が使用しています。別の組み合わせにしてください。',
  '热键适配': 'ホットキーの適応',
  '由用户导入，版权归该模型作者所有': 'ユーザーがインポートしたモデルです。著作権は作者に帰属します',
  '窗口位置、缩放、透明度等偏好会保留。': 'ウィンドウ位置・拡大率・不透明度は保持されます。',
  '自建': '自作',
  '表情 {e} · 动作 {m} · 热键 {h} · 参数 {p}': '表情 {e} · モーション {m} · ホットキー {h} · パラメータ {p}',
  '表情 {e} · 动作 {m} · 热键 {h} 条（来自模型自带的 .vtube.json）': '表情 {e} · モーション {m} · ホットキー {h} 件（モデル付属の .vtube.json 由来）',
  '表现和 VTS 里最接近。': 'VTS での見た目に最も近くなります。',
  '识别帧率 {t} FPS · 渲染 {r} FPS': '認識 {t} FPS · 描画 {r} FPS',
  '试一下': '試す',
  '资源归一化': 'リソースの正規化',
  '追踪错误：': 'トラッキングエラー：',
  '通过本程序导入的模型，其版权与使用限制由该模型作者决定。': '本アプリでインポートしたモデルの著作権・利用条件は各作者の定めに従います。',
  '错误：': 'エラー：',
  '面朝摄像头自然坐好 → 点「正坐并开始校准」→ 保持不动约 2 秒 → 点完成。': 'カメラの方を向いて自然に座る → 「正しい姿勢でキャリブレーション」をクリック → 約 2 秒動かない → 完了を押す。',
  '鼠标与交互': 'マウスと操作',
  '（VTube Studio 导出配置），其中的热键与参数表会被完整复用，': '（VTube Studio の書き出し設定）がある場合、そのホットキーとパラメータ表をそのまま使用します。',
  '（不同模型的参数表不一样，沿用旧的会全部失效），': '（モデルごとにパラメータ表が異なるため、古いものを使い回すと動作しなくなります）。',
  '（优先读包内的 VTube Studio 配置，没有就按表情自动生成）、': '（VTube Studio 設定があればそれを優先し、なければ表情から自動割り当て）、',
  '（有 VTS 参数表就照搬，没有就用 Cubism 标准参数表）。': '（VTS のパラメータ表があればそのまま、なければ Cubism 標準パラメータを使用）。',
  '（贴图/动作/表情统一改名，避免中文路径问题）、': '（テクスチャ・モーション・表情を ASCII 名に統一）、',
  '模型开关': 'モデルスイッチ',
  '关闭后卸载模型并释放显存，再次打开会重新加载': 'オフにするとモデルを解放して VRAM を空けます。オンで再読み込み',
  '启用模型': 'モデルを有効化',
  '关闭 = 卸载模型（桌宠窗口仍在，只是不渲染）；打开 = 重新加载': 'オフ = モデルを解放（ウィンドウは残りますが描画しません）／オン = 再読み込み',
  '还没有可用模型，导入后此开关会自动打开': 'モデルがありません。インポートすると自動でオンになります',
  '暂无模型，请先导入一个 .zip': 'モデルがありません。.zip をインポートしてください',
  '暂无模型，请于「模型」中导入': 'モデルなし — 「モデル」でインポートしてください',
  '暂无模型': 'モデルなし',
  '程序不附带任何模型，模型由用户自行导入，版权归该模型作者所有': '本アプリはモデルを同梱していません。モデルはユーザーがインポートするもので、著作権は各作者に帰属します。',
  '表情 {e} · 动作 {m} · 热键 {h} 条': '表情 {e} · モーション {m} · ホットキー {h} 件',
  '参数映射 {n} 条': 'パラメータ対応 {n} 件',
  '· 本程序不附带任何模型。导入的模型存放在用户数据目录，卸载应用不会删除。': '· 本アプリはモデルを同梱していません。インポートしたモデルはユーザーデータに保存され、アンインストールしても残ります。',
};

/* ------------------------------------------------------------------ */
/* 繁体中文：简体 → 繁体 的字符映射 + 词组修正                          */
/* ------------------------------------------------------------------ */

/**
 * 繁中不单独维护一份 280 条的字典 —— 那样每加一句文案就要翻译三遍。
 * 这里做「简体 → 繁体」转换：先套词组表（处理 软件/軟體 这种用词差异），
 * 再逐字映射。繁体用户看到的仍然是繁体，而新增文案不需要额外维护。
 */
const HANT_PHRASES: [string, string][] = [
  ['设置', '設定'],
  ['软件', '軟體'],
  ['硬件', '硬體'],
  ['视频', '影片'],
  ['信息', '資訊'],
  ['网络', '網路'],
  ['默认', '預設'],
  ['支持', '支援'],
  ['文件夹', '資料夾'],
  ['文件', '檔案'],
  ['鼠标', '滑鼠'],
  ['屏幕', '螢幕'],
  ['数据', '資料'],
  ['菜单', '選單'],
  ['项目', '專案'],
  ['质量', '品質'],
  ['加载', '載入'],
  ['运行', '執行'],
  ['保存', '儲存'],
  ['剪贴板', '剪貼簿'],
  ['进程', '處理程序'],
  ['内存', '記憶體'],
  ['打印', '列印'],
  ['应用', '應用'],
];

/** 每两个字符是一对（简体, 繁体） */
const HANT_CHARS = [
  '设設', '参參', '数數', '据據', '览覽', '语語', '统統', '启啟', '动動', '托託',
  '盘盤', '驻駐', '虚虛', '拟擬', '务務', '栏欄', '隐隱', '终終', '顶頂', '视視',
  '觉覺', '标標', '键鍵', '弹彈', '缩縮', '过過', '时時', '长長', '边邊', '缘緣',
  '层層', '调調', '试試', '机機', '丢丟', '踪蹤', '资資', '运運', '开開', '关關',
  '闭閉', '载載', '实實', '张張', '准準', '并並', '约約', '点點', '后後', '会會',
  '对對', '应應', '发發', '现現', '镜鏡', '复復', '认認', '项項', '输輸', '范範',
  '围圍', '区區', '转轉', '摄攝', '头頭', '备備', '获獲', '脸臉', '锁鎖', '错錯',
  '误誤', '识識', '别別', '帧幀', '图圖', '换換', '询詢', '请請', '响響', '质質',
  '频頻', '网網', '络絡', '软軟', '内內', '单單', '显顯', '态態', '状狀', '无無',
  '个個', '们們', '这這', '为為', '类類', '间間', '问問', '题題', '结結', '进進',
  '导導', '删刪', '该該', '杆桿', '线線', '块塊', '节節', '传傳',
].join('');

let hantMap: Map<string, string> | null = null;
function buildHantMap() {
  if (hantMap) return hantMap;
  const m = new Map<string, string>();
  for (let i = 0; i + 1 < HANT_CHARS.length; i += 2) {
    m.set(HANT_CHARS[i], HANT_CHARS[i + 1]);
  }
  hantMap = m;
  return m;
}

export function toHant(s: string): string {
  let out = s;
  for (const [from, to] of HANT_PHRASES) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  const map = buildHantMap();
  let res = '';
  for (const ch of out) res += map.get(ch) ?? ch;
  return res;
}

/* ------------------------------------------------------------------ */
/* 运行时                                                              */
/* ------------------------------------------------------------------ */

let currentLang: Lang = 'zh';

export function setLang(lang: string | undefined) {
  currentLang = lang === 'en' || lang === 'ja' || lang === 'zh-Hant' ? lang : 'zh';
}

export function getLang(): Lang {
  return currentLang;
}

const DICTS: Record<'en' | 'ja', Dict> = { en: EN, ja: JA };

/**
 * 翻译。key 就是中文原文；`{name}` / `{n}` 这类占位符用 vars 填。
 * 找不到条目时原样返回 key（即中文），保证界面永远不会出现空字符串。
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  if (currentLang === 'zh') return interpolate(key, vars);
  if (currentLang === 'zh-Hant') return interpolate(toHant(key), vars);
  const hit = DICTS[currentLang]?.[key];
  return interpolate(hit ?? key, vars);
}

function interpolate(s: string, vars?: Record<string, string | number>) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}
