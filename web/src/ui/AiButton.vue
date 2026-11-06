<script setup lang="ts">
// The AI button: a copy icon with a sparkle badge everywhere; it copies the item with its context as text for any assistant.
import { computed, ref, watch } from 'vue';
import { refAutoReset } from '@vueuse/core';
import { handOffText } from '@/lib/api.ts';
import { COPY, SPARKLE } from '@/lib/icons.ts';
import { useText } from '@/i18n/index.ts';
const props = defineProps<{ query: Record<string, string>; big?: boolean }>();
const t = useText();
const TIPS = {
  '': 'common.aiButton.tip',
  sent: 'common.aiButton.copied',
  failed: 'common.aiButton.failed',
} as const;
const state = refAutoReset<'' | 'sent' | 'failed'>('', 1600);
const tip = computed(() => t(TIPS[state.value]));
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
    :aria-label="t('common.aiButton.label')"
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
  width: 1.625rem;
  height: 1.625rem;
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
  width: 0.9375rem;
  height: 0.9375rem;
}

.ai-button__badge {
  position: absolute;
  right: -0.1875rem;
  top: -0.1875rem;
  width: 0.75rem;
  height: 0.75rem;
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
  width: 2rem;
  height: 2rem;
  background: rgb(var(--glass), 0.7);
}

.ai-button--big .ai-button__icon {
  width: 1.125rem;
  height: 1.125rem;
}
</style>
