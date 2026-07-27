import fs from 'node:fs/promises';
import path from 'node:path';
import type { AgentRenderer, LoadedAsset, Placement } from '../core/types.js';
import { aggregateMcp, exists } from './util.js';

/** rule -> Cursor .mdc（带 frontmatter：description/globs/alwaysApply） */
function renderMdc(rule: LoadedAsset): string {
  return [
    '---',
    `description: ${JSON.stringify(rule.meta.description ?? rule.meta.title ?? rule.meta.id)}`,
    'globs: ""',
    'alwaysApply: true',
    '---',
    '',
    rule.content.trim(),
    '',
  ].join('\n');
}

export const cursorRenderer: AgentRenderer = {
  name: 'cursor',
  supports: ['rule', 'mcp'],

  async detect(projectRoot) {
    return (
      (await exists(path.join(projectRoot, '.cursor'))) ||
      (await exists(path.join(projectRoot, '.cursorrules')))
    );
  },

  async renderAll(assets, ctx): Promise<Placement[]> {
    const placements: Placement[] = [];
    await fs.mkdir(ctx.buildDir, { recursive: true });

    // rules -> .cursor/rules/<id>.mdc
    for (const rule of assets.filter((a) => a.meta.type === 'rule')) {
      const build = path.join(ctx.buildDir, 'rules', `${rule.meta.id}.mdc`);
      await fs.mkdir(path.dirname(build), { recursive: true });
      await fs.writeFile(build, renderMdc(rule), 'utf8');
      placements.push({
        assetIds: [rule.meta.id],
        agent: 'cursor',
        targetPath: path.join(ctx.projectRoot, '.cursor', 'rules', `${rule.meta.id}.mdc`),
        sourcePath: build,
        action: 'symlink',
      });
    }

    // skill -> Cursor 不支持，skip
    for (const skill of assets.filter((a) => a.meta.type === 'skill')) {
      placements.push({
        assetIds: [skill.meta.id],
        agent: 'cursor',
        targetPath: '',
        sourcePath: '',
        action: 'skip',
        reason: 'Cursor 不支持 skill',
      });
    }

    // mcp -> .cursor/mcp.json
    const mcps = assets.filter((a) => a.meta.type === 'mcp');
    if (mcps.length) {
      const build = path.join(ctx.buildDir, 'mcp.json');
      await fs.writeFile(build, JSON.stringify(aggregateMcp(mcps), null, 2), 'utf8');
      placements.push({
        assetIds: mcps.map((m) => m.meta.id),
        agent: 'cursor',
        targetPath: path.join(ctx.projectRoot, '.cursor', 'mcp.json'),
        sourcePath: build,
        action: 'symlink',
        aggregate: true,
      });
    }

    return placements;
  },
};
