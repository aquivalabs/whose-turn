<script setup>
// The AI button: one sparkle everywhere; it copies the item with its context as text for any assistant.
import { ref } from 'vue';
import { handOffText } from '../lib/api.js';
import { SPARKLE } from '../lib/icons.js';
const props = defineProps({ query: { type: Object, required: true }, big: { type: Boolean, default: false } });
const HINT = 'Copy for AI: this with its context as text, ready to paste into Claude or any other assistant';
const state = ref('');
const tip = ref(HINT);
const copy = () => handOffText(props.query).then((text) => navigator.clipboard.writeText(text))
  .then(() => { state.value = 'sent'; tip.value = 'Copied'; })
  .catch(() => { state.value = 'failed'; tip.value = 'Could not copy'; })
  .then(() => setTimeout(() => { state.value = ''; tip.value = HINT; }, 1600));
</script>
<template>
  <span class="wt-ai" :class="[state, { 'wt-ai-big': big }]" role="button" tabindex="0" aria-label="Copy for AI" :data-tip="tip"
    @click.stop="copy" @keydown.enter.prevent.stop="copy" @keydown.space.prevent.stop="copy">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="SPARKLE" fill="currentColor" /></svg>
  </span>
</template>
