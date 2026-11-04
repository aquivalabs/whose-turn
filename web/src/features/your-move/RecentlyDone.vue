<script setup lang="ts">
// Recently done: a block under Your move with the last tickets that are done, folded by default; the fold is remembered in the browser.
import { computed, useTemplateRef } from 'vue';
import { useLocalStorage } from '@vueuse/core';
import { snapshot, now } from '@/store.ts';
import { recentlyDone, statusTone } from '@/lib/moves.ts';
import { modifier } from '@/lib/bem.ts';
import { age, when } from '@/lib/time.ts';
import TicketCell from '@/ui/TicketCell.vue';
import AiButton from '@/ui/AiButton.vue';
import Chevron from '@/ui/Chevron.vue';
import ResizeHandle from '@/ui/ResizeHandle.vue';
import { usePanelSize } from '@/composables/usePanelSize.ts';
import { glideThrough } from '@/motion.ts';
const LIST_MAX = 480;
const { size: listHeight, set: setListHeight } = usePanelSize(() => `${snapshot.workspace.id}:recently-done`);
const list = useTemplateRef<HTMLElement>('list');
const scrollerRoom = (element: HTMLElement) => {
  const scroller = element.closest('.island__body')?.querySelector<HTMLElement>('.row-scroll');
  return scroller
    ? Math.max(0, scroller.clientHeight - (parseFloat(getComputedStyle(scroller).minHeight) || 0))
    : 0;
};
const listBounds = () => {
  const element = list.value as HTMLElement;
  const first = element.querySelector('tbody > tr');
  const bottom = (first ?? element).getBoundingClientRect().bottom - element.getBoundingClientRect().top;
  const padding = parseFloat(getComputedStyle(element).paddingBottom) || 0;
  return {
    current: element.offsetHeight,
    min: Math.ceil(bottom + element.scrollTop + padding),
    max: Math.min(LIST_MAX, element.offsetHeight + scrollerRoom(element)),
  };
};
const open = useLocalStorage('wt-recent-open', false, {
  writeDefaults: false,
  serializer: { read: (raw) => raw === '1', write: (value) => (value ? '1' : '0') },
});
const root = useTemplateRef<HTMLElement>('root');
// docs/mechanisms/motion.md § A group and Recently done fold on the way out
const toggle = () => glideThrough(root.value, 'height', () => (open.value = !open.value));
const rows = computed(() => {
  void now.value;
  return recentlyDone(snapshot.turn).map((row) => ({
    row,
    since: age(row.status_since || row.updated),
  }));
});
</script>
<template>
  <details v-if="rows.length" ref="root" class="recently-done" :open="open">
    <summary class="recently-done__summary" @click.prevent="toggle">
      <Chevron tag="span" :open="open" />
      Recently done <span class="count">{{ rows.length }}</span>
    </summary>
    <div
      ref="list"
      class="recently-done__list"
      :style="listHeight === null ? undefined : { maxHeight: listHeight + 'px', height: listHeight + 'px' }"
    >
      <table class="table">
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Status</th>
            <th>Done</th>
            <th class="table__actions-col"><span class="visually-hidden">Copy for AI</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="{ row, since } in rows" :key="row.row_id">
            <TicketCell :row="row" />
            <td>
              <span class="pill" :class="modifier('pill', statusTone(row.status_group))">{{
                row.status
              }}</span>
            </td>
            <td>
              <span class="age" :data-tip="'Done ' + when(row.status_since || row.updated)">{{
                since.text
              }}</span>
            </td>
            <td class="table__actions">
              <AiButton
                class="table__ai"
                :query="{ ws: snapshot.workspace.id, kind: 'row', ref: row.row_id }"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <ResizeHandle
      v-if="open"
      label="Resize Recently done"
      axis="y"
      top
      :grow="-1"
      :bounds="listBounds"
      @resize="setListHeight"
      @reset="setListHeight(null)"
    />
  </details>
</template>
<style scoped>
.recently-done {
  position: relative;
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  min-height: 33px;
  margin: 0 -20px;
  padding: 0 20px;
  overflow: hidden;
  border-top: 1px solid var(--md-outline-variant);
}

.recently-done[open] {
  min-height: 128px;
}

.recently-done__summary {
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
  min-height: 40px;
  list-style: none;
  color: var(--md-on-surface-variant);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.recently-done__summary::-webkit-details-marker {
  display: none;
}

.recently-done__list {
  flex: 1 1 auto;
  min-height: 0;
  max-height: min(30vh, 240px);
  margin: 0 -20px;
  padding-bottom: 8px;
  overflow: auto;
}

.recently-done[open] > .recently-done__list {
  animation: recently-done-open var(--motion-base) var(--motion-ease);
}

@keyframes recently-done-open {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
}
</style>
