import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

const execFileP = promisify(execFile);

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function cacheDir(url: string): string {
  const h = createHash('sha256').update(url).digest('hex').slice(0, 16);
  return path.join(os.homedir(), '.zai-doctor', 'cache', h);
}

/** git 源：clone 或 pull 到用户级缓存（~/.zai-doctor/cache/），返回本地路径 */
export async function syncGitSource(url: string, ref?: string): Promise<string> {
  const dir = cacheDir(url);
  await fs.mkdir(path.dirname(dir), { recursive: true });
  if (await exists(path.join(dir, '.git'))) {
    await execFileP('git', ['-C', dir, 'pull', '--ff-only']);
  } else {
    const args = ['clone', '--depth', '1'];
    if (ref) args.push('--branch', ref);
    args.push(url, dir);
    await execFileP('git', args);
  }
  return dir;
}

/** 读取 git 仓库当前 commit sha */
export async function gitHead(repo: string): Promise<string> {
  const { stdout } = await execFileP('git', ['-C', repo, 'rev-parse', 'HEAD']);
  return stdout.trim();
}
