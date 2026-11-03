<script setup lang="ts">
// Recently done: the last tickets that left your move because they are done, folded by default; the fold is remembered in the browser.
import { computed } from 'vue';
import { useLocalStorage } from '@vueuse/core';
import { snapshot, now } from '../store.ts';
import { recentlyDone, statusTone } from '../lib/moves.ts';
import { age, when } from '../lib/time.ts';
import TicketCell from './TicketCell.vue';
// Stored as '1' or '0', as before VueUse, so a choice made earlier still holds.
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
  <details v-if="rows.length" class="wt-recent" :open="open" @toggle="remember">
    <summary>
      Recently done <span class="wt-count">{{ rows.length }}</span>
    </summary>
    <table>
      <tbody>
        <tr v-for="{ row, since } in rows" :key="row.row_id">
          <TicketCell :row="row" />
          <td>
            <span class="wt-pill" :class="statusTone(row.status)">{{ row.status }}</span>
          </td>
          <td>
            <span class="wt-age" :data-tip="'Done ' + when(row.status_since || row.updated)">{{
              since.text
            }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </details>
</template>
