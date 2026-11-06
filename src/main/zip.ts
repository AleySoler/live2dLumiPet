import zlib from 'node:zlib';

/**
 * 极简 ZIP 读取器（只读，支持 store / deflate）。
 *
 * 为什么不用 adm-zip 之类的依赖：主进程要保持"只用 Node 内置模块"，
 * 打包时就不用带 node_modules，绿色版体积也不膨胀。ZIP 的中央目录结构不复杂，
 * 自己解析 100 行就够用。
 *
 * 文件名编码：ZIP 规范里 bit 11 置位表示 UTF-8；否则按 CP437。
 * 但中文环境打的包基本都是 GBK 而且没置位，所以这里退化为先试 GBK 再试 CP437。
 */

export interface ZipEntry {
  /** 包内路径，统一用 / 分隔，已去除开头的 ./ */
  name: string;
  /** 是否为目录 */
  isDir: boolean;
  /** 解压后的内容（目录为空 Buffer） */
  data: Buffer;
}

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

function decodeName(buf: Buffer, utf8Flag: boolean): string {
  if (utf8Flag) return buf.toString('utf8');
  try {
    return new TextDecoder('gbk').decode(buf);
  } catch {
    return buf.toString('latin1');
  }
}

/** 规范化包内路径，顺便挡掉 zip-slip（../ 与绝对路径） */
function safeName(raw: string): string {
  const unified = raw.replace(/\\/g, '/');
  if (unified.startsWith('/') || /^[a-zA-Z]:/.test(unified)) return '';
  const parts = unified.split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (!p || p === '.') continue;
    if (p === '..') return '';
    out.push(p);
  }
  return out.join('/');
}

export function readZip(buf: Buffer): ZipEntry[] {
  // 1. 从尾部找 EOCD（可能带注释，最大 65557 字节）
  let eocd = -1;
  const minPos = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('不是有效的 ZIP 文件（找不到目录尾记录）');

  const count = buf.readUInt16LE(eocd + 10);
  const cenOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0) return [];

  const entries: ZipEntry[] = [];
  let p = cenOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) break;
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const locOffset = buf.readUInt32LE(p + 42);
    const nameBuf = buf.slice(p + 46, p + 46 + nameLen);
    const name = safeName(decodeName(nameBuf, (flags & 0x800) !== 0));
    p += 46 + nameLen + extraLen + commentLen;
    if (!name) continue;

    const isDir = name.endsWith('/');
    if (isDir) {
      entries.push({ name: name.slice(0, -1), isDir: true, data: Buffer.alloc(0) });
      continue;
    }

    // 2. 本地头：文件名/extra 长度可能与中央目录不同，必须以本地头为准
    if (locOffset + 30 > buf.length || buf.readUInt32LE(locOffset) !== LOC_SIG) continue;
    const locNameLen = buf.readUInt16LE(locOffset + 26);
    const locExtraLen = buf.readUInt16LE(locOffset + 28);
    const dataStart = locOffset + 30 + locNameLen + locExtraLen;
    const raw = buf.slice(dataStart, dataStart + compSize);

    let data: Buffer;
    if (method === 0) {
      data = raw;
    } else if (method === 8) {
      try {
        data = zlib.inflateRawSync(raw);
      } catch (err) {
        console.warn('[zip] 解压失败，跳过', name, err);
        continue;
      }
    } else {
      console.warn('[zip] 不支持的压缩方式', method, name);
      continue;
    }
    entries.push({ name, isDir: false, data });
  }
  return entries;
}
