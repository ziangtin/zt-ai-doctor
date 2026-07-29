import fs from 'node:fs/promises';
import path from 'node:path';
import type { AgentRenderer, Placement } from '../core/types.js';
import { aggregateRules, aggregateMcp, exists } from './util.js';

/** Copilot: rule -> .github/copilot-instructions.md（合并）；mcp -> .vscode/mcp.json；skill = skip */
export const copilotRenderer: AgentRenderer = {
  name: 'copilot',
  supports: ['rule', 'mcp'],

  async detect(projectRoot) {
    return (
      (await exists(path.join(projectRoot, '.github', 'copilot-instructions.md'))) ||
      (await exists(path.join(projectRoot, '.vscode', 'mcp.json')))
    );
  },

  async renderAll(assets, ctx): Promise<Placement[]> {
    const placements: Placement[] = [];
    await fs.mkdir(ctx.buildDir, { recursive: true });

    const rules = assets.filter((a) => a.meta.type === 'rule');
    if (rules.length) {
      const build = path.join(ctx.buildDir, 'copilot-instructions.md');
      await fs.writeFile(build, aggregateRules(rules), 'utf8');
      placements.push({
        assetIds: rules.map((r) => r.meta.id),
        agent: 'copilot',
        targetPath: path.join(ctx.projectRoot, '.github', 'copilot-instructions.md'),
        sourcePath: build,
        action: 'symlink',
        aggregate: true,
      });
    }

    const mcps = assets.filter((a) => a.meta.type === 'mcp');
    if (mcps.length) {
      const { mcpServers, errors } = aggregateMcp(mcps);
      for (const id of errors) {
        placements.push({
          assetIds: [id],
          agent: 'copilot',
          targetPath: '',
          sourcePath: '',
          action: 'skip',
          reason: 'MCP body 非法 JSON',
        });
      }
      const valid = mcps.filter((m) => !errors.includes(m.meta.id));
      if (valid.length) {
        const build = path.join(ctx.buildDir, 'mcp.json');
        await fs.writeFile(build, JSON.stringify({ mcpServers }, null, 2), 'utf8');
        placements.push({
          assetIds: valid.map((m) => m.meta.id),
          agent: 'copilot',
          targetPath: path.join(ctx.projectRoot, '.vscode', 'mcp.json'),
          sourcePath: build,
          action: 'symlink',
          aggregate: true,
        });
      }
    }

    return placements;
  },
};
