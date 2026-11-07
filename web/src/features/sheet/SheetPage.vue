<script setup lang="ts">
// Test sheet: every species over several seeds, flat, without the glass, to judge a new silhouette by eye.
import { ref, computed, onMounted, watch } from 'vue';
import { speciesNames, posesOf } from '@/lib/species.ts';
import { registry } from '@/species/index.ts';
import { dark } from '@/scheme.ts';
import SpeciesCell from './SpeciesCell.vue';
import { useText } from '@/i18n/index.ts';

const t = useText();
const query = new URLSearchParams(location.search);
const count = ref(Math.min(12, Math.max(1, Number(query.get('seeds')) || 6)));
const first = ref(Number(query.get('from')) || 1);
const only = ref(query.get('species') || '');
const names = speciesNames(registry);
const seeds = computed(() =>
  Array.from({ length: count.value }, (unused, index) => first.value + index),
);
const rows = computed(() =>
  names
    .filter((name) => !only.value || name === only.value)
    .flatMap((name) =>
      posesOf(registry, name).map((pose) => ({ name, pose, key: `${name}:${pose}` })),
    ),
);
const page = ref<HTMLElement | null>(null);
const ink = ref('');
const readInk = () => {
  if (page.value) {
    ink.value = getComputedStyle(page.value).color;
  }
};
onMounted(readInk);
watch(dark, readInk);
</script>
<template>
  <main ref="page" class="app sheet-page">
    <header class="sheet-page__head">
      <h1 class="sheet-page__title">{{ t('sheet.title') }}</h1>
      <label class="sheet-page__field"
        >{{ t('sheet.species') }}
        <select v-model="only">
          <option value="">{{ t('sheet.allSpecies', { count: names.length }) }}</option>
          <option v-for="name in names" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
      <label class="sheet-page__field"
        >{{ t('sheet.seeds') }}
        <input v-model.number="count" class="sheet-page__number" type="number" min="1" max="12"
      /></label>
      <label class="sheet-page__field"
        >{{ t('sheet.fromSeed') }} <input v-model.number="first" class="sheet-page__number" type="number" min="0"
      /></label>
    </header>
    <section v-for="row in rows" :key="row.key" class="sheet-page__row">
      <h2 class="sheet-page__label">
        {{ row.name }}<small v-if="row.pose" class="sheet-page__pose">{{ row.pose }}</small>
      </h2>
      <div
        class="sheet-page__cells"
        :style="{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }"
      >
        <SpeciesCell
          v-for="seed in seeds"
          :key="seed"
          :name="row.name"
          :pose="row.pose"
          :seed="seed"
          :ink="ink"
        />
      </div>
    </section>
  </main>
</template>
<style scoped>
.sheet-page {
  font-family: var(--md-font);
  color: var(--md-on-surface);
  background: var(--md-surface);
  height: auto;
  min-height: 100%;
  padding: 1rem 1.5rem 2rem;
  box-sizing: border-box;
}

.sheet-page__head {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

.sheet-page__title {
  font-size: 1.25rem;
  font-weight: 500;
  margin: 0 1rem 0 0;
}

.sheet-page__field {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: var(--md-on-surface-variant);
}

.sheet-page__number {
  width: 4rem;
}

.sheet-page__row {
  display: grid;
  grid-template-columns: 7.5rem minmax(0, 1fr);
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 0.5rem;
}

.sheet-page__label {
  font-size: 0.875rem;
  font-weight: 500;
  margin: 0;
  display: grid;
}

.sheet-page__pose {
  font-weight: 400;
  font-size: 0.75rem;
  color: var(--md-on-surface-variant);
}

.sheet-page__cells {
  display: grid;
  gap: 0.5rem;
}
</style>
