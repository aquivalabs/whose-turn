<script setup>
// One animal, one seed, one pose, drawn flat in the mask frame; a species that fails to build shows its error instead.
import { ref, computed, watchEffect } from 'vue';
import { randomTools } from '../lib/random.js';
import { buildSpecies } from '../lib/species.js';
import { paintSilhouette } from '../lib/silhouette.js';
import { registry } from '../species/index.js';

const props = defineProps({ name: String, pose: String, seed: Number, ink: String });
const canvas = ref(null);
const built = computed(() => {
  try {
    return { shapes: buildSpecies(registry, props.name, randomTools(props.seed), { pose: props.pose }).shapes, error: '' };
  } catch (error) {
    return { shapes: [], error: error.message };
  }
});
watchEffect(() => {
  if (canvas.value && !built.value.error && props.ink) {
    paintSilhouette(canvas.value, built.value.shapes, props.ink);
  }
});
</script>
<template>
  <figure class="cell">
    <p v-if="built.error" class="cell__error">{{ built.error }}</p>
    <canvas v-else ref="canvas" class="cell__canvas" width="260" height="260"></canvas>
    <figcaption class="cell__seed">{{ seed }}</figcaption>
  </figure>
</template>
<style scoped>
.cell { margin: 0; display: grid; gap: 2px; min-width: 0; }
.cell__canvas { width: 100%; aspect-ratio: 1; background: var(--md-s-low); border-radius: var(--md-r-chip); color: var(--md-on-surface); }
.cell__error { margin: 0; aspect-ratio: 1; padding: 8px; font-size: 11px; color: var(--md-error); background: var(--md-error-container); border-radius: var(--md-r-chip); overflow: auto; }
.cell__seed { font-size: 11px; color: var(--md-on-surface-variant); text-align: center; }
</style>
