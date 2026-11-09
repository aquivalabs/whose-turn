<script setup lang="ts">
// A row's tracker labels in one line: the highlighted ones first in the accent colour, the rest folded into +N, all of them on hover. RMA-434.
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import { useResizeObserver } from '@vueuse/core';
import { modifier } from '@/lib/bem.ts';
import { useText } from '@/i18n/index.ts';

const props = defineProps<{ labels: string[]; badges?: string[] }>();
const t = useText();
const line = useTemplateRef<HTMLElement>('line');
const shown = ref(props.labels.length);
const widths = ref<number[]>([]);

const isBadge = (label: string) => (props.badges || []).includes(label);
const hidden = computed(() => props.labels.length - shown.value);
const tip = computed(() => (hidden.value > 0 ? t('common.labels.all', { labels: props.labels.join(', ') }) : undefined));

const fit = () => {
  const style = line.value ? getComputedStyle(line.value) : null;
  const gap = parseFloat(style?.columnGap || '') || 0;
  const more = 3 * (parseFloat(style?.fontSize || '') || 0);
  const room = line.value?.clientWidth || 0;
  let used = 0;
  let count = 0;
  for (const [index, width] of widths.value.entries()) {
    const reserve = index < widths.value.length - 1 ? more + gap : 0;
    if (used + width + reserve > room && count > 0) {
      break;
    }
    used += width + gap;
    count += 1;
  }
  shown.value = count;
};

const measure = async () => {
  shown.value = props.labels.length;
  await nextTick();
  widths.value = [...(line.value?.querySelectorAll<HTMLElement>('.label-chips__chip') || [])].map((chip) => chip.offsetWidth);
  fit();
};

watch(() => props.labels.join('\n'), () => void measure(), { immediate: true });
useResizeObserver(line, fit);
</script>
<template>
  <span v-if="labels.length" ref="line" class="label-chips" :data-tip="tip">
    <span
      v-for="(label, index) in labels"
      v-show="index < shown"
      :key="label"
      class="label-chips__chip"
      :class="modifier('label-chips__chip', isBadge(label) ? 'badge' : '')"
      >{{ label }}</span
    ><span v-if="hidden > 0" class="label-chips__chip label-chips__chip--more">{{ t('common.labels.more', { count: hidden }) }}</span>
  </span>
</template>
<style scoped>
.label-chips {
  display: flex;
  flex: 1;
  gap: 0.25rem;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.label-chips__chip {
  flex: none;
  height: var(--chip-height);
  padding: 0 var(--chip-pad-x);
  border-radius: var(--chip-radius);
  background: var(--md-s-highest);
  color: var(--md-on-surface-variant);
  font-size: var(--chip-font-size);
  line-height: var(--chip-height);
}

.label-chips__chip--badge {
  background: var(--md-label-container);
  color: var(--md-on-label-container);
  font-weight: 600;
}

.label-chips__chip--more {
  background: none;
}
</style>
