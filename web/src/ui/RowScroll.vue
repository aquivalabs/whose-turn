<script setup lang="ts">
// Scroll area of a table island with a "+N more" line for the rows below it.
import { computed, ref } from 'vue';
import { useElementSize, useScroll } from '@vueuse/core';
import { hiddenBelow } from '@/lib/moves.ts';
import { reduced } from '@/motion.ts';
defineProps<{ floor?: boolean }>();
const cellSlack = 13;
const scroller = ref<HTMLElement | null>(null);
const content = ref<HTMLElement | null>(null);
const { y } = useScroll(scroller);
const { height } = useElementSize(scroller);
const { height: contentHeight } = useElementSize(content);
const head = computed(() => {
  void contentHeight.value;
  return content.value?.querySelector('thead') ?? null;
});
const { height: headHeight } = useElementSize(head);
const rows = () => [...(content.value?.querySelector('table')?.tBodies || [])];
const viewBottom = () => {
  const box = scroller.value;
  return box ? box.getBoundingClientRect().top + box.clientTop + box.clientHeight : 0;
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
  const box = scroller.value;
  const list = rows();
  const first = list[list.length - hidden.value];
  if (!box || !first) {
    return;
  }
  const head = content.value?.querySelector('thead')?.getBoundingClientRect().bottom;
  const top = head ?? box.getBoundingClientRect().top;
  box.scrollBy({ top: first.getBoundingClientRect().top - top, behavior: reduced.value ? 'auto' : 'smooth' });
};
</script>
<template>
  <div
    ref="scroller"
    class="row-scroll"
    :class="{ 'row-scroll--floor': floor }"
    :style="{ scrollPaddingTop: headHeight + 'px' }"
  >
    <div ref="content"><slot /></div>
  </div>
  <button v-if="hidden" type="button" class="row-scroll__more" @click="reveal">
    +{{ hidden }} more
  </button>
</template>
<style scoped>
.row-scroll {
  overflow-x: auto;
  margin: 0 -1.25rem;
}

@media (width >= 901px) {
  .dashboard--fit .dashboard__main .row-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }

  .dashboard--fit .row-scroll::-webkit-scrollbar {
    width: 0.5rem;
    height: 0.5rem;
  }

  .dashboard--fit .row-scroll::-webkit-scrollbar-thumb {
    border-radius: 0.25rem;
    background: var(--md-outline-variant);
  }
}

.dashboard--fit .dashboard__main .row-scroll--floor {
  min-height: 5rem;
}

.row-scroll__more {
  flex: none;
  display: block;
  margin: 0 -1.25rem;
  padding: 0.25rem 1.25rem 0.375rem;
  border-top: 1px solid var(--md-outline-variant);
  color: var(--md-primary);
  font-size: 0.8125rem;
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
