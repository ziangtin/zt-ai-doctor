import fs from 'node:fs/promises';
import path from 'node:path';
import type { LoadedAsset } from './types.js';

export interface ProjectStack {
  deps: Set<string>;
  hasPackageJson: boolean;
}

export interface AssetMatch {
  /** 信号描述列表，如 ['deps=react', 'files=tsconfig.json'] */
  matched: string[];
  matchedCount: number;
  total: number;
  confidence: '高' | '中' | null;
  noStack: boolean;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** 读项目 package.json 的依赖包名集合（dependencies + devDependencies） */
export async function detectStack(projectRoot: string): Promise<ProjectStack> {
  try {
    const raw = await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = new Set<string>([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]);
    return { deps, hasPackageJson: true };
  } catch {
    return { deps: new Set(), hasPackageJson: false };
  }
}

/** 资产与项目技术栈的匹配度 */
export async function matchAsset(
  asset: LoadedAsset,
  projectRoot: string,
  stack: ProjectStack,
): Promise<AssetMatch> {
  const s = asset.meta.stack;
  if (!s || (!s.deps?.length && !s.files?.length)) {
    return { matched: [], matchedCount: 0, total: 0, confidence: null, noStack: true };
  }
  const matchedDeps = (s.deps ?? []).filter((d) => stack.deps.has(d));
  const matchedFiles: string[] = [];
  for (const f of s.files ?? []) {
    if (await exists(path.join(projectRoot, f))) matchedFiles.push(f);
  }
  const matched = [
    ...matchedDeps.map((d) => `deps=${d}`),
    ...matchedFiles.map((f) => `files=${f}`),
  ];
  const total = (s.deps?.length ?? 0) + (s.files?.length ?? 0);
  const matchedCount = matched.length;
  let confidence: '高' | '中' | null = null;
  if (matchedCount > 0) {
    confidence = matchedCount >= 2 || matchedCount / total >= 0.66 ? '高' : '中';
  }
  return { matched, matchedCount, total, confidence, noStack: false };
}
