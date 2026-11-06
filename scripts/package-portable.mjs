#!/usr/bin/env node
/**
 * 生成免安装的绿色版：release/live2dLumiPet-win32-x64/
 *  - 拷贝本地 electron 运行时
 *  - 把 dist/ + package.json 放进 resources/app
 *  - 主进程只依赖 electron 与 Node 内置模块，渲染层已被 Vite 打包，因此不需要 node_modules
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE = path.join(ROOT, 'release');
const OUT = path.join(RELEASE, 'live2dLumiPet-win32-x64');
const EXE = 'live2dLumiPet.exe';

const log = (...a) => console.log('[package]', ...a);

async function copyDir(src, dest, skip = () => false) {
  await fsp.mkdir(dest, { recursive: true });
  for (const entry of await fsp.readdir(src, { withFileTypes: true })) {
    if (skip(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(s, d, skip);
    else if (entry.isSymbolicLink()) await fsp.copyFile(await fsp.realpath(s), d);
    else await fsp.copyFile(s, d);
  }
}

async function main() {
  const dist = path.join(ROOT, 'dist');
  if (!fs.existsSync(path.join(dist, 'renderer', 'pet.html'))) {
    throw new Error('缺少构建产物，请先执行 npm run build');
  }
  const electronDist = path.join(ROOT, 'node_modules', 'electron', 'dist');
  if (!fs.existsSync(electronDist)) {
    throw new Error('缺少 node_modules/electron/dist，请先执行 node node_modules/electron/install.js');
  }

  await fsp.rm(OUT, { recursive: true, force: true });
  await fsp.mkdir(OUT, { recursive: true });

  log('拷贝 Electron 运行时…');
  await copyDir(electronDist, OUT);

  // 去掉模板应用与调试符号，减小体积
  for (const name of ['default_app.asar', 'resources/default_app.asar']) {
    await fsp.rm(path.join(OUT, name), { force: true });
  }

  const pkg = JSON.parse(await fsp.readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const appPkg = {
    name: pkg.name,
    productName: pkg.productName,
    version: pkg.version,
    description: pkg.description,
    main: pkg.main,
    private: true,
  };
  const appDir = path.join(OUT, 'resources', 'app');
  await fsp.mkdir(appDir, { recursive: true });
  await fsp.writeFile(path.join(appDir, 'package.json'), JSON.stringify(appPkg, null, 2), 'utf8');

  log('拷贝应用产物…');
  await copyDir(path.join(dist, 'main'), path.join(appDir, 'dist', 'main'));
  await copyDir(path.join(dist, 'preload'), path.join(appDir, 'dist', 'preload'));
  await copyDir(path.join(dist, 'shared'), path.join(appDir, 'dist', 'shared'));
  await copyDir(path.join(dist, 'renderer'), path.join(appDir, 'dist', 'renderer'));

  const exePath = path.join(OUT, 'electron.exe');
  if (fs.existsSync(exePath)) await fsp.rename(exePath, path.join(OUT, EXE));

  let total = 0;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else total += fs.statSync(p).size;
    }
  };
  walk(OUT);
  log(`完成: ${OUT}`);
  log(`体积: ${(total / 1024 / 1024).toFixed(1)} MB`);
  log(`启动: ${path.join(OUT, EXE)}`);
}

main().catch((err) => {
  console.error('[package] 失败:', err);
  process.exit(1);
});
