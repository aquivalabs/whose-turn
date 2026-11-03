<script setup lang="ts">
// One panel of the dashboard: a head with the title, a note and a hint, a body, and a chevron that folds it; the fold is remembered in the browser. The glass surface is the global island primitive; a caller's class falls through to the section.
import { useFold } from '@/composables/useFold.ts';
const props = withDefaults(
  defineProps<{ id: string; title: string; note?: string; tip?: string; column?: boolean }>(),
  {
    note: '',
    tip: '',
  },
);
const { collapsed, toggle } = useFold(props.id);
</script>
<template>
  <section
    :id="id"
    class="island"
    :class="{ 'island--collapsed': collapsed, 'island--column': column }"
  >
    <div class="island__head">
      <h2 class="island__title">{{ title }} <slot name="head" /></h2>
      <p class="island__note">
        <span class="island__note-text">{{ note }}</span>
        <button v-if="tip" type="button" class="hint-icon" aria-label="More info" :data-tip="tip">
          ?
        </button>
        <button
          type="button"
          class="fold-toggle"
          :class="{ 'fold-toggle--folded': collapsed }"
          :aria-label="'Collapse or expand ' + id"
          data-tip="Fold this panel; it stays folded until you open it again"
          @click.stop="toggle"
        >
          ▾
        </button>
      </p>
    </div>
    <div class="island__body"><slot /></div>
  </section>
</template>
<style scoped>
.island__head {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 20px;
}

.island__title {
  flex: none;
  margin: 0;
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.island__note {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
  margin: 0;
  overflow: visible;
  color: var(--md-on-surface-variant);
  font-size: 12px;
  line-height: 16px;
  letter-spacing: 0.03em;
  text-align: right;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.island__note-text {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.island__body {
  padding: 0 20px 12px;
}

.island--column .island__head {
  gap: 4px;
}

.island--column .island__body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding-top: 4px;
}

.island.island--collapsed .island__body {
  display: none;
}

@media (width >= 901px) {
  .dashboard--fit .dashboard__main .island__body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
    padding-bottom: 0;
  }

  .dashboard--fit .dashboard__main .island.island--collapsed .island__body {
    display: none;
  }
}
</style>
