import fs from 'node:fs/promises';
import path from 'node:path';
import type { AgentRenderer, LoadedAsset, Placement } from '../core/types.js';
import { agentsDir } from '../core/paths.js';
import { aggregateMcp, exists } from './util.js';

/** rules 聚合成 README：按 priority 降序拼接正文 */
function aggregateRules(rules: LoadedAsset[]): string {
  const sorted = [...rules].sort((a, b) => (b.meta.priority ?? 0) - (a.meta.priority ?? 0));
  const parts = sorted.map((r) => `## ${r.meta.title ?? r.meta.id}\n\n${r.content.trim()}`);
  return [
    '# Agent Rules',
    '',
    '> 由 zai-doctor sync 生成，勿手改。改 `.agents/rules/*.md` 后重跑 `zai-doctor sync`。',
    '',
    parts.join('\n\n---\n\n'),
    '',
  ].join('\n');
}

export const claudeRenderer: AgentRenderer = {
  name: 'claude',
  supports: ['rule', 'skill', 'mcp'],

  async detect(projectRoot) {
    return (
      (await exists(path.join(projectRoot, '.claude'))) ||
      (await exists(path.join(projectRoot, 'CLAUDE.md')))
    );
  },

  async renderAll(assets, ctx): Promise<Placement[]> {
    const placements: Placement[] = [];
    await fs.mkdir(ctx.buildDir, { recursive: true });

    // rules -> 聚合成 .agents/README.md，项目根 CLAUDE.md 软链到它
    const rules = assets.filter((a) => a.meta.type === 'rule');
    if (rules.length) {
      const readme = path.join(agentsDir(ctx.projectRoot), 'README.md');
      await fs.writeFile(readme, aggregateRules(rules), 'utf8');
      placements.push({
        assetIds: rules.map((r) => r.meta.id),
        agent: 'claude',
        targetPath: path.join(ctx.projectRoot, 'CLAUDE.md'),
        sourcePath: readme,
        action: 'symlink',
        aggregate: true,
      });
    }

    // skills -> .claude/skills/<id>/SKILL.md
    for (const skill of assets.filter((a) => a.meta.type === 'skill')) {
      const build = path.join(ctx.buildDir, 'skills', skill.meta.id, 'SKILL.md');
      await fs.mkdir(path.dirname(build), { recursive: true });
      const body = [
        '---',
        `name: ${skill.meta.id}`,
        `description: ${JSON.stringify(skill.meta.description ?? skill.meta.title ?? '')}`,
        '---',
        '',
        skill.content.trim(),
        '',
      ].join('\n');
      await fs.writeFile(build, body, 'utf8');
      placements.push({
        assetIds: [skill.meta.id],
        agent: 'claude',
        targetPath: path.join(ctx.projectRoot, '.claude', 'skills', skill.meta.id, 'SKILL.md'),
        sourcePath: build,
        action: 'symlink',
      });
    }

    // mcp -> .mcp.json
    const mcps = assets.filter((a) => a.meta.type === 'mcp');
    if (mcps.length) {
      const build = path.join(ctx.buildDir, 'mcp.json');
      await fs.writeFile(build, JSON.stringify(aggregateMcp(mcps), null, 2), 'utf8');
      placements.push({
        assetIds: mcps.map((m) => m.meta.id),
        agent: 'claude',
        targetPath: path.join(ctx.projectRoot, '.mcp.json'),
        sourcePath: build,
        action: 'symlink',
        aggregate: true,
      });
    }

    return placements;
  },
};
