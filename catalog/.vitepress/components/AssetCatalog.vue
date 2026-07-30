<script setup>
import { ref, computed } from 'vue';
import { withBase } from 'vitepress';
import data from '../../src/data/catalog.json';

const assets = data.assets;
const types = [...new Set(assets.map((a) => a.type))];
const tags = [...new Set(assets.flatMap((a) => a.tags ?? []))];

const activeType = ref('');
const activeTag = ref('');

const visible = computed(() =>
  assets.filter(
    (a) =>
      (!activeType.value || a.type === activeType.value) &&
      (!activeTag.value || (a.tags ?? []).includes(activeTag.value)),
  ),
);
</script>

<template>
  <section class="catalog-filters">
    <div class="filter-group">
      <strong>类型</strong>
      <button class="filter-btn" :class="{ active: activeType === '' }" @click="activeType = ''">全部</button>
      <button
        v-for="t in types"
        :key="t"
        class="filter-btn"
        :class="{ active: activeType === t }"
        @click="activeType = t"
      >{{ t }}</button>
    </div>
    <div class="filter-group">
      <strong>标签</strong>
      <button class="filter-btn" :class="{ active: activeTag === '' }" @click="activeTag = ''">全部</button>
      <button
        v-for="t in tags"
        :key="t"
        class="filter-btn"
        :class="{ active: activeTag === t }"
        @click="activeTag = t"
      >{{ t }}</button>
    </div>
  </section>

  <section class="asset-grid">
    <a
      v-for="a in visible"
      :key="a.id"
      class="asset-card"
      :href="withBase(`/assets/${a.id}.html`)"
    >
      <div class="asset-card-head">
        <span class="type-badge" :data-type="a.type">{{ a.type }}</span>
        <span class="asset-layer">{{ a.layer }}</span>
      </div>
      <h3>{{ a.title || a.id }}</h3>
      <code class="asset-id">{{ a.id }}</code>
      <p v-if="a.description">{{ a.description }}</p>
      <div v-if="a.tags && a.tags.length" class="asset-tags">
        <span v-for="t in a.tags" :key="t" class="asset-tag">{{ t }}</span>
      </div>
    </a>
  </section>

  <p v-if="!visible.length" class="catalog-empty">无匹配资产</p>
</template>
