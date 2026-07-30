import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const marketDir = path.resolve(__dirname, '..', '..', 'cli', 'market');
const outFile = path.resolve(__dirname, '..', 'src', 'data', 'catalog.json');

const manifest = JSON.parse(
  fs.readFileSync(path.join(marketDir, 'manifest.json'), 'utf8'),
);

const SEMVER = /^\d+\.\d+\.\d+$/;
/** 与 cli core/semver 一致：缺省/非法视为 0.0.0，按 x.y.z 数值比较。 */
function cmpVer(a, b) {
  const pa = (a && SEMVER.test(a) ? a : '0.0.0').split('.').map(Number);
  const pb = (b && SEMVER.test(b) ? b : '0.0.0').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

const assets = [];
for (const entry of manifest.assets) {
  // manifest 归一化：versions 数组（新格式）或单 path（旧格式）-> 取 semver 最高的版本
  const versions = Array.isArray(entry.versions)
    ? entry.versions
    : typeof entry.path === 'string'
      ? [{ path: entry.path }]
      : [];
  if (versions.length === 0) continue;
  let best = 0;
  for (let i = 1; i < versions.length; i++) {
    if (cmpVer(versions[i].version, versions[best].version) > 0) best = i;
  }
  const relPath = versions[best].path;
  const full = path.join(marketDir, relPath);
  const raw = fs.readFileSync(full, 'utf8');
  const parsed = matter(raw);
  const meta = parsed.data;
  const content = parsed.content.trim();
  assets.push({
    id: meta.id ?? entry.id,
    type: meta.type ?? entry.type,
    title: meta.title ?? '',
    description: meta.description ?? '',
    tags: meta.tags ?? [],
    agents: meta.agents ?? [],
    layer: meta.layer ?? 'baseline',
    priority: meta.priority ?? 0,
    version: meta.version ?? versions[best].version ?? '',
    stack: meta.stack ?? null,
    content,
    // 非 mcp 资产预渲染 HTML，前端直接 v-html（mcp body 是 JSON，前端用 <pre> 展示原文）
    contentHtml: meta.type === 'mcp' ? '' : marked.parse(content),
    marketPath: relPath,
  });
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(
  outFile,
  JSON.stringify(
    { market: { name: manifest.name, version: manifest.version }, assets },
    null,
    2,
  ),
  'utf8',
);
console.log(
  `[build-data] ${assets.length} assets -> ${path.relative(path.resolve(__dirname, '..'), outFile)}`,
);
