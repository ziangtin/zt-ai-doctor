import fs from 'node:fs/promises';
import path from 'node:path';
import type { AgentRenderer, Placement } from '../core/types.js';
import { aggregateRules, exists } from './util.js';

/** Windsurf: rule -> .windsurfrules（项目根，合并）；skill/mcp = skip（mcp 在全局 ~/.codeium/，不自动改） */
export const windsurfRenderer: AgentRenderer = {
  name: 'windsurf',
  supports: ['rule'],

  async detect(projectRoot) {
    return exists(path.join(projectRoot, '.windsurfrules'));
  },

  async renderAll(assets, ctx): Promise<Placement[]> {
    const placements: Placement[] = [];
    await fs.mkdir(ctx.buildDir, { recursive: true });

    const rules = assets.filter((a) => a.meta.type === 'rule');
    if (rules.length) {
      const build = path.join(ctx.buildDir, '.windsurfrules');
      await fs.writeFile(build, aggregateRules(rules), 'utf8');
      placements.push({
        assetIds: rules.map((r) => r.meta.id),
        agent: 'windsurf',
        targetPath: path.join(ctx.projectRoot, '.windsurfrules'),
        sourcePath: build,
        action: 'symlink',
        aggregate: true,
      });
    }

    return placements;
  },
};
