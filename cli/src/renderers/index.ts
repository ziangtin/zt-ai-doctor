import path from 'node:path';
import fs from 'node:fs/promises';
import type { AgentRenderer, AssetType, LoadedAsset, Placement, RenderContext } from '../core/types.js';
import { agentsDir } from '../core/paths.js';
import { loadAgentConfig, type AgentConfig, type Mapping } from '../core/agentConfig.js';
import { detectConfig } from '../core/configDetect.js';
import { aggregateTransforms, perAssetTransforms } from './transforms.js';

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** 替换 targetPath 模板里的 {id}（聚合型无 id） */
function substitute(tpl: string, id?: string): string {
  return id ? tpl.replaceAll('{id}', id) : tpl;
}

function skipPlacement(agent: string, id: string, reason: string): Placement {
  return { assetIds: [id], agent, targetPath: '', sourcePath: '', action: 'skip', reason };
}

/** 由 AgentConfig 生成 renderer：路径/聚合/action 读 config，转换走 transform profile（仍 TS） */
function makeRenderer(cfg: AgentConfig): AgentRenderer {
  return {
    name: cfg.name,
    supports: cfg.supports,
    detectConfig: (projectRoot) => detectConfig(cfg, projectRoot),

    async renderAll(assets: LoadedAsset[], ctx: RenderContext): Promise<Placement[]> {
      const placements: Placement[] = [];
      await fs.mkdir(ctx.buildDir, { recursive: true });

      for (const [type, mapping] of Object.entries(cfg.mappings) as [AssetType, Mapping][]) {
        const typeAssets = assets.filter((a) => a.meta.type === type);
        if (typeAssets.length === 0) continue;

        if (mapping.aggregate) {
          const transform = aggregateTransforms[mapping.transform];
          if (!transform) {
            throw new Error(
              `未知 aggregate transform: ${mapping.transform}（agent=${cfg.name}, type=${type}）`,
            );
          }
          const { content, errors } = transform(typeAssets);
          for (const id of errors ?? []) {
            placements.push(skipPlacement(cfg.name, id, 'MCP body 非法 JSON'));
          }
          const valid = errors?.length
            ? typeAssets.filter((a) => !errors.includes(a.meta.id))
            : typeAssets;
          if (valid.length === 0) continue;

          const targetRel = substitute(mapping.targetPath);
          const sourcePath = mapping.aggregateSource
            ? path.join(agentsDir(ctx.projectRoot), mapping.aggregateSource)
            : path.join(ctx.buildDir, path.basename(targetRel));
          await fs.mkdir(path.dirname(sourcePath), { recursive: true });
          await fs.writeFile(sourcePath, content, 'utf8');
          placements.push({
            assetIds: valid.map((a) => a.meta.id),
            agent: cfg.name,
            targetPath: path.join(ctx.projectRoot, targetRel),
            sourcePath,
            action: mapping.action,
            aggregate: true,
          });
        } else {
          const transform = perAssetTransforms[mapping.transform];
          if (!transform) {
            throw new Error(
              `未知 per-asset transform: ${mapping.transform}（agent=${cfg.name}, type=${type}）`,
            );
          }
          for (const asset of typeAssets) {
            const targetRel = substitute(mapping.targetPath, asset.meta.id);
            const sourcePath = path.join(ctx.buildDir, targetRel);
            await fs.mkdir(path.dirname(sourcePath), { recursive: true });
            await fs.writeFile(sourcePath, transform(asset), 'utf8');
            placements.push({
              assetIds: [asset.meta.id],
              agent: cfg.name,
              targetPath: path.join(ctx.projectRoot, targetRel),
              sourcePath,
              action: mapping.action,
            });
          }
        }
      }
      return placements;
    },
  };
}

/** 加载 renderer：内置默认 + 项目 .agents/agents.json 覆盖（按 projectRoot）。 */
export async function loadRenderers(projectRoot: string): Promise<AgentRenderer[]> {
  const configs = await loadAgentConfig(projectRoot);
  return configs.map(makeRenderer);
}

export { exists };
