import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const marketDir = path.resolve(__dirname, '..', '..', 'cli', 'market');
const outFile = path.resolve(__dirname, '..', 'src', 'data', 'catalog.json');

const manifest = JSON.parse(
  fs.readFileSync(path.join(marketDir, 'manifest.json'), 'utf8'),
);

const assets = [];
for (const entry of manifest.assets) {
  const full = path.join(marketDir, entry.path);
  const raw = fs.readFileSync(full, 'utf8');
  const parsed = matter(raw);
  const meta = parsed.data;
  assets.push({
    id: meta.id ?? entry.id,
    type: meta.type ?? entry.type,
    title: meta.title ?? '',
    description: meta.description ?? '',
    tags: meta.tags ?? [],
    agents: meta.agents ?? [],
    layer: meta.layer ?? 'baseline',
    priority: meta.priority ?? 0,
    stack: meta.stack ?? null,
    content: parsed.content.trim(),
    marketPath: entry.path,
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
