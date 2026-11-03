<script setup lang="ts">
// The AI button: one sparkle everywhere; it copies the item with its context as text for any assistant.
import { computed } from 'vue';
import { refAutoReset } from '@vueuse/core';
import { handOffText } from '../lib/api.ts';
import { SPARKLE } from '../lib/icons.ts';
const props = defineProps<{ query: Record<string, string>; big?: boolean }>();
const TIPS: Record<string, string> = {
  '': 'Copy for AI: this with its context as text, ready to paste into Claude or any other assistant',
  sent: 'Copied',
  failed: 'Could not copy',
};
const state = refAutoReset<'' | 'sent' | 'failed'>('', 1600);
const tip = computed(() => TIPS[state.value]);
const copy = () =>
  handOffText(props.query)
    .then((text) => navigator.clipboard.writeText(text))
    .then(
      () => {
        state.value = 'sent';
      },
      () => {
        state.value = 'failed';
      },
    );
</script>
<template>
  <span
    class="wt-ai"
    :class="[state, { 'wt-ai-big': big }]"
    role="button"
    tabindex="0"
    aria-label="Copy for AI"
    :data-tip="tip"
    @click.stop="copy"
    @keydown.enter.prevent.stop="copy"
    @keydown.space.prevent.stop="copy"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="SPARKLE" fill="currentColor" /></svg>
  </span>
</template>
