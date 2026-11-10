<script setup lang="ts">
// The theme switch: each click moves System → Light → Dark; ?scheme= in the address overrides it. RMA-457.
import { computed } from 'vue';
import { cycleScheme, pinnedByAddress, schemeChoice } from '@/scheme.ts';
import { SCHEME_DARK, SCHEME_LIGHT, SCHEME_SYSTEM } from '@/lib/icons.ts';
import { useText } from '@/i18n/index.ts';

const t = useText();
const ICONS = { system: SCHEME_SYSTEM, light: SCHEME_LIGHT, dark: SCHEME_DARK };
const label = computed(() => t(`status.scheme.${schemeChoice.value}`));
</script>

<template>
  <button
    type="button"
    class="btn scheme-toggle"
    :aria-label="label"
    :aria-disabled="pinnedByAddress"
    :data-tip="pinnedByAddress ? t('status.scheme.pinned') : t('status.scheme.tip')"
    @click="cycleScheme"
  >
    <svg class="scheme-toggle__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path :d="ICONS[schemeChoice]" fill="currentColor" /></svg
    ><span class="scheme-toggle__label">{{ label }}</span>
  </button>
</template>

<style scoped>
.scheme-toggle {
  gap: 0.375rem;
  height: 1.625rem;
  padding: 0 0.75rem;
  font-size: 0.75rem;
  white-space: nowrap;
}

@media (width <= 80em) {
  .scheme-toggle {
    padding: 0 0.5rem;
  }

  .scheme-toggle__label {
    display: none;
  }
}

.scheme-toggle__icon {
  width: 1rem;
  height: 1rem;
}
</style>
