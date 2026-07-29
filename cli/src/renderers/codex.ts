import fs from 'node:fs/promises';
import path from 'node:path';
import type { AgentRenderer, Placement } from '../core/types.js';
import { aggregateRules, exists } from './util.js';

/** Codex: rule -> AGENTS.md（项目根，合并）；skill/mcp = skip（mcp 在全局 ~/.codex/config.toml，不自动改） */
export const codexRenderer: AgentRenderer = {
  name: 'codex',
  supports: ['rule'],

  async detect(projectRoot) {
    return exists(path.join(projectRoot, 'AGENTS.md'));
  },

  async renderAll(assets, ctx): Promise<Placement[]> {
    const placements: Placement[] = [];
    await fs.mkdir(ctx.buildDir, { recursive: true });

    const rules = assets.filter((a) => a.meta.type === 'rule');
    if (rules.length) {
      const build = path.join(ctx.buildDir, 'AGENTS.md');
      await fs.writeFile(build, aggregateRules(rules), 'utf8');
      placements.push({
        assetIds: rules.map((r) => r.meta.id),
        agent: 'codex',
        targetPath: path.join(ctx.projectRoot, 'AGENTS.md'),
        sourcePath: build,
        action: 'symlink',
        aggregate: true,
      });
    }

    return placements;
  },
};
