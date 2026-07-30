import { describe, it, expect, vi } from 'vitest';
import { type Layer } from './helpers.js';
import { resolveAssets } from '../src/core/layers.js';
import type { LoadedAsset } from '../src/core/types.js';

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

function makeAsset(id: string, layer: Layer = 'baseline', priority = 0): LoadedAsset {
  return {
    entry: { id, type: 'rule', path: `rules/${id}.md`, versions: [{ path: `rules/${id}.md` }] },
    meta: {
      id,
      type: 'rule',
      title: '',
      description: '',
      tags: [],
      agents: [],
      layer,
      priority,
    },
    raw: '',
    content: '',
    hash: '',
  };
}

describe('分层覆盖 resolveAssets（纯函数）', () => {
  it('personal > baseline', () => {
    const { resolved, overrides } = resolveAssets([
      makeAsset('a', 'baseline'),
      makeAsset('a', 'personal'),
    ]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].meta.layer).toBe('personal');
    expect(overrides[0].winner).toBe('personal');
  });

  it('同层 priority 高者胜', () => {
    const { resolved } = resolveAssets([makeAsset('a', 'baseline', 10), makeAsset('a', 'baseline', 50)]);
    expect(resolved[0].meta.priority).toBe(50);
  });

  it('不同 id 共存，无覆盖记录', () => {
    const { resolved, overrides } = resolveAssets([makeAsset('a'), makeAsset('b')]);
    expect(resolved).toHaveLength(2);
    expect(overrides).toHaveLength(0);
  });
});
