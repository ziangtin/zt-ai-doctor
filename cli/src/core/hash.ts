import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

/** 文件内容 sha256（前 16 hex），用于受管文件冲突检测 */
export async function hashFile(p: string): Promise<string> {
  const buf = await fs.readFile(p);
  return createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

/** 文件内容完整 sha256（64 hex），用于药典 integrity */
export async function hashFileFull(p: string): Promise<string> {
  const buf = await fs.readFile(p);
  return createHash('sha256').update(buf).digest('hex');
}
