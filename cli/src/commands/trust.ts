import { findAssetById } from '../core/market.js';
import { readLockfile, writeLockfile, trustMcp } from '../core/lockfile.js';
import { lockfilePath, resolveMarketPath } from '../core/paths.js';
import { validateMcpBody, type McpBody } from '../core/schema.js';
import { UsageError } from '../core/errors.js';

function parseMcpBody(content: string): McpBody {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new UsageError('MCP body 非法 JSON');
  }
  return validateMcpBody(raw);
}

/** 检查 npx 命令是否固定了包版本，返回未固定的包名 */
function findUnpinnedPackage(body: McpBody): string | null {
  const cmd = String(body.command ?? '');
  const args = Array.isArray(body.args) ? body.args : [];
  if (cmd === 'npx' || cmd.endsWith('\\npx') || cmd.endsWith('/npx')) {
    const pkg = args.find((a) => !a.startsWith('-'));
    if (pkg && pkg.lastIndexOf('@') <= 0) return pkg; // 无 @version（scope 的 @ 在 index 0，不算固定）
  }
  return null;
}

/** trust <id>：展示 MCP 将执行的 command/args，标记为信任。MCP 必须先 trust，sync 才写入配置。 */
export async function trustCommand(
  projectRoot: string,
  id: string,
  opts: { market?: string },
): Promise<void> {
  const marketPath = resolveMarketPath(opts.market);
  const asset = await findAssetById(marketPath, id);
  if (!asset) {
    throw new UsageError(`药典中未找到: ${id}`);
  }
  if (asset.meta.type !== 'mcp') {
    throw new UsageError(`${id} 不是 mcp 类型（trust 仅用于 MCP）`);
  }

  const body = parseMcpBody(asset.content);
  console.log(`🔐 MCP ${id} 将执行：`);
  console.log(`   command: ${body.command ?? '(未指定)'}`);
  console.log(`   args:    ${JSON.stringify(body.args ?? [])}`);
  const unpinned = findUnpinnedPackage(body);
  if (unpinned) {
    console.log(`   ⚠ ${unpinned} 未固定版本，建议改为 ${unpinned}@<version>`);
  }

  const lockPath = lockfilePath(projectRoot);
  const lock = await readLockfile(lockPath);
  if (!lock) {
    throw new UsageError('未建档，先运行 zai-doctor init');
  }
  const updated = trustMcp(lock, id);
  await writeLockfile(lockPath, updated);
  console.log(`✓ 已信任 ${id}（sync 时将写入 MCP 配置）`);
}
