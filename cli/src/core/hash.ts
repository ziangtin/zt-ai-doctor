import fs from 'node:fs/promises';
import path from 'node:path';
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

/** 目录聚合 hash：递归收集 `relPath:fileHash`，按 relPath 排序拼接后 sha256。
 *  relPath 用 posix 分隔符保证跨平台一致。用于目录资产（skill <id>/SKILL.md + scripts/）完整性校验。 */
export async function hashDir(dir: string): Promise<string> {
  const entries: string[] = [];
  async function walk(d: string, relBase: string): Promise<void> {
    let names: string[];
    try {
      names = await fs.readdir(d);
    } catch {
      return; // 子目录不存在
    }
    for (const name of names) {
      const full = path.join(d, name);
      const stat = await fs.stat(full);
      if (stat.isDirectory()) {
        await walk(full, path.posix.join(relBase, name));
      } else {
        const h = createHash('sha256').update(await fs.readFile(full)).digest('hex');
        entries.push(`${path.posix.join(relBase, name)}:${h}`);
      }
    }
  }
  await walk(dir, '');
  entries.sort();
  return createHash('sha256').update(entries.join('\n')).digest('hex');
}
