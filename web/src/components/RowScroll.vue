<script setup lang="ts">
// The scroll area of a table island; when rows end below its bottom, a "+N more" line under it scrolls to the first of them. floor keeps a few rows' height when the island shrinks.
import { computed, ref } from 'vue';
import { useElementSize, useScroll } from '@vueuse/core';
import { hiddenBelow } from '../lib/moves.ts';
defineProps<{ floor?: boolean }>();
// A row cut only through its cell padding and border still reads as shown.
const cellSlack = 13;
const scroller = ref<HTMLElement | null>(null);
const content = ref<HTMLElement | null>(null);
const { y } = useScroll(scroller);
const { height } = useElementSize(scroller);
const { height: contentHeight } = useElementSize(content);
const rows = () => [...(content.value?.querySelector('table')?.tBodies[0]?.rows || [])];
const viewBottom = () => {
  const el = scroller.value;
  return el ? el.getBoundingClientRect().top + el.clientTop + el.clientHeight : 0;
};
const hidden = computed(() => {
  void [y.value, height.value, contentHeight.value];
  return hiddenBelow(
    rows().map((row) => row.getBoundingClientRect().bottom),
    viewBottom(),
    cellSlack,
  );
});
const reveal = () => {
  const el = scroller.value;
  const list = rows();
  const first = list[list.length - hidden.value];
  if (!el || !first) {
    return;
  }
  const head = content.value?.querySelector('thead')?.getBoundingClientRect().bottom;
  const top = head ?? el.getBoundingClientRect().top;
  el.scrollBy({ top: first.getBoundingClientRect().top - top, behavior: 'smooth' });
};
</script>
<template>
  <div ref="scroller" class="row-scroll" :class="{ 'row-scroll--floor': floor }">
    <div ref="content"><slot /></div>
  </div>
  <span
    v-if="hidden"
    class="row-scroll__more"
    role="button"
    tabindex="0"
    @click="reveal"
    @keydown.enter.prevent="reveal"
    @keydown.space.prevent="reveal"
    >+{{ hidden }} more</span
  >
</template>
<style scoped>
.row-scroll {
  overflow-x: auto;
  margin: 0 -20px;
}

@media (width >= 901px) {
  .dashboard--fit .dashboard__main .row-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }

  .dashboard--fit .row-scroll::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .dashboard--fit .row-scroll::-webkit-scrollbar-thumb {
    border-radius: 4px;
    background: var(--md-outline-variant);
  }
}

.dashboard--fit .dashboard__main .row-scroll--floor {
  min-height: 5rem;
}

.row-scroll__more {
  flex: none;
  display: block;
  margin: 0 -20px;
  padding: 4px 20px 6px;
  border-top: 1px solid var(--md-outline-variant);
  color: var(--md-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.row-scroll__more:hover {
  background: rgb(var(--md-state), 0.06);
}

.row-scroll__more:focus-visible {
  outline: var(--focus-ring);
  outline-offset: -2px;
}
</style>
