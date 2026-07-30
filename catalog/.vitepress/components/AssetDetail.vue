<script setup>
import { computed } from 'vue';
import { withBase } from 'vitepress';
import data from '../../src/data/catalog.json';

// 与 .vitepress/config.ts 的 editLink 同源仓库
const REPO = 'https://github.com/ziangtin/zt-ai-doctor';

const props = defineProps({
  id: { type: String, required: true },
});

const asset = computed(() => data.assets.find((a) => a.id === props.id));
// 资产详情页内容来自 cli/market/<marketPath>，编辑入口应指向源文件
const sourceUrl = computed(
  () => `${REPO}/edit/main/cli/market/${asset.value?.marketPath ?? ''}`,
);
</script>

<template>
  <a class="asset-back" :href="withBase('/')">← 返回药典</a>
  <article v-if="asset" class="asset-detail">
    <div class="asset-detail-head">
      <span class="type-badge" :data-type="asset.type">{{ asset.type }}</span>
      <h1>{{ asset.title || asset.id }}</h1>
      <code class="asset-id">{{ asset.id }}</code>
    </div>
    <p v-if="asset.description" class="asset-desc">{{ asset.description }}</p>
    <dl class="asset-meta">
      <dt>layer</dt><dd>{{ asset.layer }}</dd>
      <dt>priority</dt><dd>{{ asset.priority }}</dd>
      <dt>agents</dt><dd>{{ (asset.agents ?? []).join(', ') || '-' }}</dd>
      <dt>tags</dt><dd>{{ (asset.tags ?? []).join(', ') || '-' }}</dd>
      <dt>marketPath</dt><dd><code>{{ asset.marketPath }}</code></dd>
      <template v-if="asset.stack">
        <dt>stack</dt>
        <dd>deps=[{{ (asset.stack.deps ?? []).join(', ') }}] files=[{{ (asset.stack.files ?? []).join(', ') }}]</dd>
      </template>
    </dl>
    <pre v-if="asset.type === 'mcp'" class="mcp-body">{{ asset.content }}</pre>
    <div v-else class="asset-prose" v-html="asset.contentHtml"></div>
    <a class="asset-source" :href="sourceUrl" target="_blank" rel="noopener">在 GitHub 编辑此资产源文件 ↗</a>
  </article>
  <p v-else class="catalog-empty">未找到资产：{{ id }}</p>
</template>
