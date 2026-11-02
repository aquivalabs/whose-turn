<script setup>
// Test sheet: every species over several seeds, flat, without the glass, to judge a new silhouette by eye.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { speciesNames, posesOf } from '../lib/species.js';
import { registry } from '../species/index.js';
import SpeciesCell from './SpeciesCell.vue';

const query = new URLSearchParams(location.search);
const count = ref(Math.min(12, Math.max(1, Number(query.get('seeds')) || 6)));
const first = ref(Number(query.get('from')) || 1);
const only = ref(query.get('species') || '');
const names = speciesNames(registry);
const seeds = computed(() => Array.from({ length: count.value }, (unused, index) => first.value + index));
const rows = computed(() => names.filter((name) => !only.value || name === only.value)
  .flatMap((name) => posesOf(registry, name).map((pose) => ({ name, pose, key: `${name}:${pose}` }))));
const page = ref(null);
const ink = ref('');
const dark = window.matchMedia('(prefers-color-scheme: dark)');
const readInk = () => { ink.value = getComputedStyle(page.value).color; };
onMounted(() => { readInk(); dark.addEventListener('change', readInk); });
onBeforeUnmount(() => dark.removeEventListener('change', readInk));
</script>
<template>
  <main ref="page" class="wt-app sheet">
    <header class="sheet__head">
      <h1 class="sheet__title">Species sheet</h1>
      <label class="sheet__field">Species
        <select v-model="only"><option value="">all ({{ names.length }})</option><option v-for="name in names" :key="name" :value="name">{{ name }}</option></select>
      </label>
      <label class="sheet__field">Seeds <input v-model.number="count" type="number" min="1" max="12"></label>
      <label class="sheet__field">From seed <input v-model.number="first" type="number" min="0"></label>
    </header>
    <section v-for="row in rows" :key="row.key" class="sheet__row">
      <h2 class="sheet__label">{{ row.name }}<small v-if="row.pose">{{ row.pose }}</small></h2>
      <div class="sheet__cells" :style="{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }">
        <SpeciesCell v-for="seed in seeds" :key="seed" :name="row.name" :pose="row.pose" :seed="seed" :ink="ink" />
      </div>
    </section>
  </main>
</template>
<style scoped>
.sheet { font-family: var(--md-font); color: var(--md-on-surface); background: var(--md-surface); height: auto; min-height: 100%; padding: 16px 24px 32px; box-sizing: border-box; }
.sheet__head { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; }
.sheet__title { font-size: 20px; font-weight: 500; margin: 0 16px 0 0; }
.sheet__field { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--md-on-surface-variant); }
.sheet__field input { width: 64px; }
.sheet__row { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 12px; align-items: center; margin-bottom: 8px; }
.sheet__label { font-size: 14px; font-weight: 500; margin: 0; display: grid; }
.sheet__label small { font-weight: 400; font-size: 12px; color: var(--md-on-surface-variant); }
.sheet__cells { display: grid; gap: 8px; }
</style>
