import type { Layer, LayerOverride, LoadedAsset } from './types.js';

/** 层级优先级：personal > baseline（market 侧 curation 层） */
export function layerRank(layer: Layer | undefined): number {
  switch (layer) {
    case 'personal':
      return 20;
    case 'baseline':
    default:
      return 10;
  }
}

/**
 * 按 id 合并资产：同 id 取层级更高者，同层级取 priority 更高者（per-rule 替换）。
 * 返回合并后的资产列表 + 覆盖记录。
 */
export function resolveAssets(assets: LoadedAsset[]): {
  resolved: LoadedAsset[];
  overrides: LayerOverride[];
} {
  const groups = new Map<string, LoadedAsset[]>();
  for (const a of assets) {
    const arr = groups.get(a.meta.id) ?? [];
    arr.push(a);
    groups.set(a.meta.id, arr);
  }

  const resolved: LoadedAsset[] = [];
  const overrides: LayerOverride[] = [];

  for (const [id, arr] of groups) {
    const winner = arr.reduce((best, cur) => {
      const rc = layerRank(cur.meta.layer);
      const rb = layerRank(best.meta.layer);
      if (rc > rb) return cur;
      if (rc === rb && (cur.meta.priority ?? 0) > (best.meta.priority ?? 0)) return cur;
      return best;
    });
    resolved.push(winner);
    if (arr.length > 1) {
      overrides.push({
        id,
        layers: arr.map((a) => a.meta.layer ?? 'baseline'),
        winner: winner.meta.layer ?? 'baseline',
      });
    }
  }

  return { resolved, overrides };
}
