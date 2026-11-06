import { protocol, net } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { rendererRoot, userModelsDir } from './store';

/**
 * app:// 自定义协议
 *   app://bundle/<rel>  -> dist/renderer/<rel>   (应用产物：HTML/JS/内置模型/厂商运行时)
 *   app://user/<rel>    -> %APPDATA%/.../models/<rel> (用户导入的模型)
 *
 * 走自定义协议而不是 file:// 的原因：
 *   1. file:// 下的 fetch/XHR 会被 Chromium 拦掉，Live2D 的 model3/moc3 加载不了；
 *   2. 统一 origin，纹理不会污染 WebGL 画布；
 *   3. 开发和打包后行为完全一致。
 */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.moc3': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
};

export function registerAppScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

export function installAppProtocol() {
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      const host = url.hostname;
      let root: string | null = null;
      if (host === 'bundle') root = rendererRoot();
      else if (host === 'user') root = userModelsDir();
      else return new Response('unknown host', { status: 404 });

      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const abs = path.normalize(path.join(root, rel));
      if (abs !== root && !abs.startsWith(root + path.sep)) {
        return new Response('forbidden', { status: 403 });
      }
      let stat: fs.Stats;
      try {
        stat = fs.statSync(abs);
      } catch {
        return new Response('not found', { status: 404 });
      }
      if (!stat.isFile()) return new Response('not found', { status: 404 });

      const res = await net.fetch(pathToFileURL(abs).toString());
      const headers = new Headers();
      const ext = path.extname(abs).toLowerCase();
      headers.set('Content-Type', MIME[ext] ?? 'application/octet-stream');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Cache-Control', 'no-cache');
      if (typeof stat.size === 'number') headers.set('Content-Length', String(stat.size));
      return new Response(res.body, { status: 200, headers });
    } catch (err) {
      console.error('[protocol] error', request.url, err);
      return new Response('error', { status: 500 });
    }
  });
}
