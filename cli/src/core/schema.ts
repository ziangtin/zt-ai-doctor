import { z } from 'zod';
import path from 'node:path';
import type { AssetMeta, Lockfile, Manifest } from './types.js';

/** 安全 id 格式：小写字母数字开头，仅允许 . _ -，禁止路径分隔符 */
const idSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/, 'id 必须匹配 ^[a-z0-9][a-z0-9._-]*$');
const assetTypeSchema = z.enum(['rule', 'skill', 'mcp', 'prompt']);
const layerSchema = z.enum(['baseline', 'personal', 'company']);

const assetMetaSchema = z.object({
  id: idSchema,
  type: assetTypeSchema,
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  agents: z.array(z.string()).optional(),
  layer: layerSchema.optional(),
  priority: z.number().optional(),
  stack: z
    .object({
      deps: z.array(z.string()).optional(),
      files: z.array(z.string()).optional(),
    })
    .optional(),
});

const manifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  assets: z.array(
    z.object({
      id: idSchema,
      type: assetTypeSchema,
      path: z.string().min(1),
    }),
  ),
});

const lockfileSchema = z.object({
  version: z.string(),
  market: z.object({ name: z.string(), version: z.string() }),
  assets: z.array(
    z.object({
      id: idSchema,
      type: assetTypeSchema,
      hash: z.string(),
      installedAt: z.string(),
      marketPath: z.string(),
    }),
  ),
});

export const LOCKFILE_SCHEMA_VERSION = '1';

/** 路径越界防护：target 解析后必须落在 base 内（防 ../ 逃逸） */
export function assertWithinBase(base: string, target: string, label: string): void {
  const resolved = path.resolve(base, target);
  const rel = path.relative(base, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`${label} 越界: ${target}（解析到 ${resolved}，base ${base}）`);
  }
}

function parseOrThrow<T>(schema: z.ZodType, raw: unknown, label: string): T {
  try {
    return schema.parse(raw) as T;
  } catch (e) {
    if (e instanceof z.ZodError) {
      const issues = e.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      throw new Error(`${label} 校验失败: ${issues}`, { cause: e });
    }
    throw e;
  }
}

export function validateManifest(raw: unknown): Manifest {
  return parseOrThrow<Manifest>(manifestSchema, raw, 'manifest');
}

export function validateAssetMeta(raw: unknown): AssetMeta {
  return parseOrThrow<AssetMeta>(assetMetaSchema, raw, 'asset frontmatter');
}

export function validateLockfile(raw: unknown): Lockfile {
  const parsed = parseOrThrow<Lockfile>(lockfileSchema, raw, 'lockfile');
  if (parsed.version !== LOCKFILE_SCHEMA_VERSION) {
    throw new Error(
      `lockfile schema 版本不兼容: ${parsed.version}（期望 ${LOCKFILE_SCHEMA_VERSION}）`,
    );
  }
  return parsed;
}
