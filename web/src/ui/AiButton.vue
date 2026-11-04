<script setup lang="ts">
// The AI button: a copy icon with a sparkle badge everywhere; it copies the item with its context as text for any assistant.
import { computed, ref, watch } from 'vue';
import { refAutoReset } from '@vueuse/core';
import { handOffText } from '@/lib/api.ts';
import { COPY, SPARKLE } from '@/lib/icons.ts';
const props = defineProps<{ query: Record<string, string>; big?: boolean }>();
const TIPS: Record<string, string> = {
  '': 'Copy for AI: this with its context as text, ready to paste into Claude or any other assistant',
  sent: 'Copied',
  failed: 'Could not copy',
};
const state = refAutoReset<'' | 'sent' | 'failed'>('', 1600);
const tip = computed(() => TIPS[state.value]);
const button = ref<(HTMLButtonElement & { _tippy?: { setContent: (text: string) => void } }) | null>(null);
watch(tip, (text) => button.value?._tippy?.setContent(text));
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
  <button
    ref="button"
    type="button"
    class="ai-button"
    :class="{
      'ai-button--big': big,
      'ai-button--sent': state === 'sent',
      'ai-button--failed': state === 'failed',
    }"
    aria-label="Copy for AI"
    :data-tip="tip"
    @click.stop="copy"
  >
    <svg class="ai-button__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path :d="COPY" fill="currentColor" />
    </svg>
    <svg class="ai-button__badge" viewBox="0 0 24 24" aria-hidden="true">
      <path :d="SPARKLE" fill="currentColor" />
    </svg>
  </button>
</template>
<style scoped>
.ai-button {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  cursor: pointer;
  color: var(--md-primary);
  background: rgb(var(--md-state), 0.06);
  vertical-align: middle;
  transition:
    background var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}

.ai-button__icon {
  width: 15px;
  height: 15px;
}

.ai-button__badge {
  position: absolute;
  right: -3px;
  top: -3px;
  width: 12px;
  height: 12px;
}

.ai-button:hover {
  background: var(--md-secondary-container);
  transform: scale(1.08);
}

.ai-button:focus-visible {
  outline: var(--focus-ring);
  outline-offset: 1px;
}

.ai-button.ai-button--sent {
  background: var(--md-tertiary-container);
  color: var(--md-on-tertiary-container);
}

.ai-button.ai-button--failed {
  background: var(--md-error-container);
  color: var(--md-on-error-container);
}

.ai-button--big {
  width: 32px;
  height: 32px;
  background: rgb(var(--glass), 0.7);
}

.ai-button--big .ai-button__icon {
  width: 18px;
  height: 18px;
}
</style>
