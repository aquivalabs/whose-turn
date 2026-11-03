<script setup lang="ts">
// One panel of the dashboard: a head with the title, a note and a hint, a body, and a chevron that folds it; the fold is remembered in the browser.
import { useFold } from '../composables/useFold.ts';
const props = withDefaults(
  defineProps<{ id: string; title: string; note?: string; tip?: string; extraClass?: string }>(),
  { note: '', tip: '', extraClass: '' },
);
const { collapsed, toggle } = useFold(props.id);
</script>
<template>
  <section :id="id" class="wt-island" :class="[extraClass, { 'is-collapsed': collapsed }]">
    <div class="wt-island-head">
      <h2>{{ title }} <slot name="head" /></h2>
      <p class="wt-note">
        <span class="wt-note-text">{{ note }}</span>
        <span
          v-if="tip"
          class="wt-hint-icon"
          role="button"
          tabindex="0"
          aria-label="More info"
          :data-tip="tip"
          >?</span
        >
        <span
          class="wt-collapse"
          role="button"
          tabindex="0"
          :aria-label="'Collapse or expand ' + id"
          data-tip="Fold this panel; it stays folded until you open it again"
          @click.stop="toggle"
          @keydown.enter.prevent="toggle"
          @keydown.space.prevent="toggle"
          >▾</span
        >
      </p>
    </div>
    <div class="wt-island-body"><slot /></div>
  </section>
</template>
