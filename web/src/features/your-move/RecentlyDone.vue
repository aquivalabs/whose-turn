<script setup lang="ts">
// Recently done: a block under Your move with the last tickets that are done, folded by default; the fold is remembered in the browser.
import { computed } from 'vue';
import { useLocalStorage } from '@vueuse/core';
import { snapshot, now } from '@/store.ts';
import { recentlyDone, statusTone } from '@/lib/moves.ts';
import { modifier } from '@/lib/bem.ts';
import { age, when } from '@/lib/time.ts';
import TicketCell from '@/ui/TicketCell.vue';
import AiButton from '@/ui/AiButton.vue';
const open = useLocalStorage('wt-recent-open', false, {
  writeDefaults: false,
  serializer: { read: (raw) => raw === '1', write: (value) => (value ? '1' : '0') },
});
const remember = (event: Event) => {
  open.value = (event.target as HTMLDetailsElement).open;
};
const rows = computed(() => {
  void now.value;
  return recentlyDone(snapshot.turn).map((row) => ({
    row,
    since: age(row.status_since || row.updated),
  }));
});
</script>
<template>
  <details v-if="rows.length" class="recently-done" :open="open" @toggle="remember">
    <summary class="recently-done__summary">
      Recently done <span class="recently-done__count">{{ rows.length }}</span>
    </summary>
    <div class="recently-done__list">
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
  </details>
</template>
<style scoped>
.recently-done {
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

.recently-done__summary::before {
  content: '▾';
  display: inline-grid;
  place-items: center;
  width: 24px;
  font-size: 18px;
  transform: rotate(-90deg);
  transition: transform 0.15s ease;
}

.recently-done[open] .recently-done__summary::before {
  transform: none;
}

.recently-done__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--md-s-high);
  color: var(--md-on-surface-variant);
  font-size: 12px;
  font-weight: 700;
}

.recently-done__list {
  flex: 1 1 auto;
  min-height: 0;
  max-height: min(30vh, 240px);
  margin: 0 -20px;
  padding-bottom: 8px;
  overflow: auto;
}
</style>
