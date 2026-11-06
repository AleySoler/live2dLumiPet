# 参与贡献 / Contributing

感谢你有兴趣参与 live2dLumiPet！

## 提交前

```bash
npm run typecheck     # 主进程 + 渲染层类型检查
npm test              # 单元测试
electron . --smoke    # 端到端自检（模型加载、渲染、表情、动作、追踪、热键、穿透链路）
```

三条都通过再提 PR。`--smoke` 会在 `smoke-out/` 下产出截图与 `result.json`，排查问题时很有用。

## 代码风格

- TypeScript，两个 `tsconfig`：`tsconfig.main.json`（主进程/预加载/共享）与 `tsconfig.web.json`（渲染层）。
- 主进程**不引入第三方运行时依赖**（只用 Node 内置模块 + electron），渲染层才会用 pixi / React。
  新增功能请优先用内置模块实现 —— 这直接决定了绿色版不需要带 `node_modules`。
- 注释写「为什么」，不写「是什么」。踩过的坑（Windows 透明窗口、Cubism 裁剪蒙版、VTS 模型结构）
  尽量在代码里留下结论，避免下一个人重踩。

## 边界

- **不要提交模型文件**。内置模型与 PSD 的授权明确禁止二次上传，`.gitignore` 已排除；
  `assets/model-src/` 需要开发者自备。
- **界面文案不要写死具体模型**。代码里会存在 `ArtMesh669`、`尾巴根部冒出蓝色` 这类针对某个模型的表述，
  它们属于历史遗留；新增文案请只描述「行为」，不描述某个具体模型的网格名或瑕疵。
- **新增界面文本**直接写 `t('中文原文')`，字典缺条目会自动回落中文，不会出现空白。
  新增语言需要同时更新 `src/shared/i18n.ts`。

## Pull Request

- 一个 PR 只做一件事，附上「改了什么 / 为什么 / 怎么验证」。
- 涉及界面的改动建议附截图；涉及行为的改动请说明 `--smoke` 的结果。
- 提交信息用中文或英文都可以，但请说明动机。

## 报告问题

请附上：

1. 复现步骤与预期行为；
2. `%APPDATA%/live2dLumiPet/config.json`（**注意里面可能含摄像头设备名**，自行删改）；
3. 用 `electron . --logcursor` 启动后的控制台输出（拖动/穿透相关问题必需）；
4. 系统版本、显卡、是否多显示器 / 缩放比例。

---

# Contributing (English)

Thanks for your interest in live2dLumiPet!

Before opening a PR, make sure these three pass:

```bash
npm run typecheck
npm test
electron . --smoke
```

Style notes:

- TypeScript, two tsconfigs (`tsconfig.main.json` for main/preload/shared, `tsconfig.web.json` for renderers).
- **The main process has no third-party runtime dependencies** (Node built-ins + electron only).
  This is what keeps the portable build free of `node_modules` — please keep it that way.
- Comments explain *why*, not *what*. Known platform traps (transparent windows on Windows,
  Cubism clipping masks, VTube Studio model layout) are documented inline.
- **Never commit model files.** Their licence forbids re-uploading; `.gitignore` already excludes them.
- **UI copy must not hard-code a specific model's mesh names.** New strings should describe behaviour.
- Add new UI text as `t('中文原文')`; missing dictionary entries fall back to Chinese instead of rendering empty.

For bug reports please include reproduction steps, your `config.json` (redact camera device names),
the console output of `electron . --logcursor` for input/passthrough issues, and your OS/GPU/display setup.
