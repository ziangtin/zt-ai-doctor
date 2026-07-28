import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

/** 文件内容完整 sha256（64 hex），用于受管文件冲突检测与 lockfile hash */
export async function hashFile(p: string): Promise<string> {
  const buf = await fs.readFile(p);
  return createHash('sha256').update(buf).digest('hex');
}

/** 文件内容完整 sha256（64 hex），用于药典 integrity */
export async function hashFileFull(p: string): Promise<string> {
  const buf = await fs.readFile(p);
  return createHash('sha256').update(buf).digest('hex');
}
