# live2dLumiPet (lLP)

**A Live2D desktop pet that drives your model the way VTube Studio does — and lives on your desktop like Live2DViewerEX.**

Live2D model on top of your desktop, genuinely transparent, click-through, driven in real time by
webcam face tracking, with model-native expressions and motions bound to global hotkeys.
Import your own model from a `.zip` and it adapts itself.

> 中文说明见 [README.md](README.md)

> ### ⚠️ No model ships with this project
>
> Neither the repository nor the release archive contains any Live2D model file.
> On first launch the app runs in **no-model mode**: the pet window stays transparent and the
> console still opens — import a `.zip` on the Models tab to get started.
>
> The model used for development and testing is **DeepSeek-chan / 大肥鱼**. It is a *test model*,
> **not** a bundled asset: copyright belongs to its authors and it is not distributed with this project.
> How to obtain it: <https://www.bilibili.com/video/BV1KmxY66EZ3>


![desktop pet](docs/hero.png)

---

## Why another Live2D pet?

VTube Studio is great at *driving* a model but is a streaming tool, not a desktop companion.
Live2DViewerEX puts a model on your desktop but its tracking is limited.
live2dLumiPet merges both halves:

- **Precision driving** — 478-point face landmarks, 52 ARKit-style blendshapes, head pose,
  written into the model the same way VTube Studio's parameter table does.
- **Desktop dwelling** — a real transparent window: the model sits above your wallpaper,
  clicks pass through anywhere except the model's own silhouette.

## Features

### Desktop behaviour

| | |
|---|---|
| True transparency | `transparent` window + WebGL alpha. Only the model is drawn; desktop icons show through |
| Mouse control | **On**: drag with left button, scroll to scale, right-click menu (per-pixel hit test — only the model's silhouette responds). **Off**: whole window is click-through |
| Right-click menu | Opens the same menu as the tray icon; can be disabled separately |
| Always on top | Optional |
| Tray resident | Left-click opens the console, right-click opens the menu |
| Reset model state | Re-centres the pet, clears expressions/motions, resets scale |
| Remembers everything | Position, scale, opacity and all settings live in `%APPDATA%/live2dLumiPet/config.json` |

### Face tracking (the VTube Studio half)

| | |
|---|---|
| Tracking | MediaPipe FaceLandmarker — 478 landmarks, 52 blendshapes, 4×4 head pose |
| Parameter mapping | A faithful copy of the model's `.vtube.json` `ParameterSettings` table: input/output ranges, smoothing, inverted ranges |
| Head pose | Yaw / pitch / roll → `AngleX` / `AngleY` / `AngleZ` |
| Gaze & blink | Iris landmarks → `ParamEyeBallX/Y`; blendshape blink → `ParamEyeLOpen/ROpen` |
| Mouth | `jawOpen` → `ParamMouthOpenY`; smile, puff, pucker, tongue, lip-press all mapped |
| Neutral calibration | "Sit up straight and calibrate" samples 2 seconds and records the neutral pose |
| Tuning | Smoothing, dead zone, per-axis gain, gaze range, blink gain, axis inversion |
| Fallback | Without a camera the pet follows the cursor (pivoting on the model's **eye midpoint**) and blinks automatically |
| Expression mixing | Our own mixer: several expressions at once, each with its own fade (the upstream library only supports one) |

### Custom models

Drop a `.zip` into **Models → Import**. Importing normalises everything:

- locates `.model3.json`, rewrites the resource tree to plain ASCII paths
  (textures/motions/expressions), so Chinese folder names stop being a problem;
- scans the package for `*.exp3.json` / `*.motion3.json` even when `model3.json`
  doesn't declare them — which is the norm for VTube Studio exports;
- **hotkeys**: reuses the `.vtube.json` `Hotkeys` verbatim (including the
  VTS key-token → Electron accelerator conversion); otherwise auto-assigns `Alt+1…0`, `Alt+Q…P`;
- **parameter mapping**: copies `ParameterSettings` when present, otherwise builds a
  Cubism standard mapping filtered by the parameters the model actually has.

Switching a model rebuilds the hotkey and parameter tables (they are model-specific),
while window preferences are preserved. Imported models live in the user data folder
and survive uninstalls. You can delete them freely; deleting the last one returns the app to no-model mode.

### Interface language

Simplified Chinese / Traditional Chinese / English / Japanese, switchable at
**Settings → System & Startup → Language**, applied immediately.

Implementation note: the dictionary is keyed by the *Chinese source string*, so a missing
translation falls back to Chinese instead of rendering an empty label. Traditional Chinese is
produced by a curated Simplified→Traditional conversion (phrase table first, then per-character),
so new UI strings need no extra translation work. Text that originates from model files
(expression names, hotkey names, parameter names, author credits) is deliberately **not** translated.

## Requirements

- Windows 10/11 x64
- A webcam (for face tracking — everything else works without one)
- Node.js 20+ and npm (to build from source)

## Quick start

### Prebuilt (portable)

```
release/live2dLumiPet-win32-x64/live2dLumiPet.exe
```

No installer. Delete the folder to uninstall.

### From source

```bash
npm install
npm run build      # assets + main (tsc) + renderer (vite)
npm start          # build then launch
```

> **No model is in this repository.** `npm run assets` skips model normalisation when `assets/model-src/`
> is absent, and the app then starts in no-model mode.
> Put your own model folder at `assets/model-src/<id>/` before `npm run assets`,
> or just import a `.zip` from the app.

### First run

1. The pet appears in the bottom-right corner; there's a tray icon.
2. Double-click the pet (or click the tray icon) to open the console.
3. **Face Tracking** → enable camera capture → allow the camera.
4. Sit facing the camera → "Sit up straight and calibrate" → hold still ~2 s → Finish.
5. Back on the desktop press `Alt + 1` to trigger the first expression.
6. Want your own model? **Models** → "Choose a .zip to import" → Use.

## Project layout

```
live2dLumiPet/
├─ assets/model-src/<id>/       raw VTube Studio model (NOT committed)
├─ scripts/
│  ├─ prepare-assets.mjs        fetch Cubism Core / MediaPipe, normalise model → manifest
│  └─ package-portable.mjs      build the portable release
├─ src/
│  ├─ main/                     Electron main process
│  │  ├─ index.ts               lifecycle, single instance, autostart, GPU switches
│  │  ├─ protocol.ts            app:// protocol (bundle / user roots)
│  │  ├─ windows.ts             pet window (transparent / topmost / drag / click-through) + console
│  │  ├─ shortcuts.ts           globalShortcut registration + conflict detection
│  │  ├─ tray.ts                tray and context menu
│  │  ├─ ipc.ts                 IPC contract
│  │  ├─ store.ts               config persistence, model resolution, legacy migration
│  │  ├─ zip.ts                 minimal ZIP reader (no deps, GBK filenames supported)
│  │  ├─ importer.ts            model import: normalise + adapt hotkeys/parameters
│  │  └─ smoke.ts               end-to-end self test
│  ├─ preload/                  contextBridge → window.petAPI
│  ├─ shared/                   types, config defaults, hotkey utils, i18n
│  └─ renderer/
│     ├─ pet/                   the pet renderer (pixi + Cubism)
│     └─ control/               React console
└─ tests/                       unit tests (node --test)
```

## Technical notes

- **Expression mixer**: writes parameters on `afterMotionUpdate` (before physics), so hair and
  cloth physics follow the expressions. Defaults are captured per parameter and restored when an
  expression releases it — expression switching does not fight the model's own defaults.
- **Dragging** is driven entirely by the main process at 60 Hz from `screen.getCursorScreenPoint()`.
  The old approach (renderer sends DOM `screenX/screenY`) broke whenever the cursor left the
  window or the click-through state flipped mid-drag.
- **Clipping mask resolution**: Cubism defaults to a 256×256 mask buffer. On a 3749×7697 canvas
  that is ~2 screen pixels per mask pixel — clipped layers show stair-stepping. The value is
  applied **once after model load** (re-creating the clipping manager at runtime crashes the renderer).
- **The window must not be resized while dragging**: a transparent frameless window that is
  partially off-screen gets its size bumped by 2 px per move on Windows, accumulating into a
  visible scale change. The main process therefore re-asserts the size with `setBounds` every tick
  and the renderer locks its fit baseline.

## Testing

```bash
npm test                              # unit tests
electron . --smoke                    # end-to-end: model load, render, expressions, motions,
                                      # tracking, hotkeys, click-through wiring
electron . --smoke --shot             # + screenshots
electron . --smoke --shot-control     # + one screenshot per console tab
```

## Licence

Program code: **MIT** — see [LICENSE](LICENSE).

**This repository contains no model files.** DeepSeek-chan is only a *test model*, distributed free of charge by its authors and
their Terms of Use forbid reselling and re-uploading the model files. Model copyright:
Kamiya Ryoko (illustration / PSD split), NeonNeko (Live2D rigging).

"Live2D" and "Cubism" are trademarks of Live2D Inc. This is an unofficial community project,
not affiliated with or endorsed by Live2D Inc.
