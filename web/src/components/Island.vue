<script setup>
// One panel of the dashboard: a head with the title, a note and a hint, a body, and a chevron that folds it; the fold is remembered in the browser.
import { ref } from 'vue';
const props = defineProps({ id: { type: String, required: true }, title: { type: String, required: true }, note: { type: String, default: '' }, tip: { type: String, default: '' }, extraClass: { type: String, default: '' } });
const read = () => { try { return JSON.parse(localStorage.getItem('wt-collapsed') || '[]'); } catch { return []; } };
const collapsed = ref(read().includes(props.id));
const toggle = () => {
  collapsed.value = !collapsed.value;
  const set = new Set(read());
  if (collapsed.value) set.add(props.id); else set.delete(props.id);
  try { localStorage.setItem('wt-collapsed', JSON.stringify([...set])); } catch { /* storage may be blocked */ }
};
</script>
<template>
  <section class="wt-island" :class="[extraClass, { 'is-collapsed': collapsed }]" :id="id">
    <div class="wt-island-head">
      <h2>{{ title }} <slot name="head" /></h2>
      <p class="wt-note">
        <span class="wt-note-text">{{ note }}</span>
        <span v-if="tip" class="wt-hint-icon" role="button" tabindex="0" aria-label="More info" :data-tip="tip">?</span>
        <span class="wt-collapse" role="button" tabindex="0" :aria-label="'Collapse or expand ' + id" data-tip="Fold this panel; it stays folded until you open it again"
          @click.stop="toggle" @keydown.enter.prevent="toggle" @keydown.space.prevent="toggle">▾</span>
      </p>
    </div>
    <div class="wt-island-body"><slot /></div>
  </section>
</template>
