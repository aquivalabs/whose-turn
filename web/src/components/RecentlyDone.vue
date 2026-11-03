<script setup>
// Recently done: the last tickets that left your move because they are done, folded by default; the fold is remembered in the browser.
import { computed, ref } from 'vue';
import { S, now } from '../store.js';
import { recentlyDone, statusTone } from '../lib/moves.js';
import { age, when } from '../lib/time.js';
import TicketCell from './TicketCell.vue';
const KEY = 'wt-recent-open';
const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
const open = ref(read());
const remember = (event) => { open.value = event.target.open; try { localStorage.setItem(KEY, open.value ? '1' : '0'); } catch { /* storage may be blocked */ } };
const rows = computed(() => { void now.value; return recentlyDone(S.turn).map((row) => ({ row, since: age(row.status_since || row.updated) })); });
</script>
<template>
  <details v-if="rows.length" class="wt-recent" :open="open" @toggle="remember">
    <summary>Recently done <span class="wt-count">{{ rows.length }}</span></summary>
    <table>
      <tbody>
        <tr v-for="{ row, since } in rows" :key="row.row_id">
          <TicketCell :row="row" />
          <td><span class="wt-pill" :class="statusTone(row.status)">{{ row.status }}</span></td>
          <td><span class="wt-age" :data-tip="'Done ' + when(row.status_since || row.updated)">{{ since.text }}</span></td>
        </tr>
      </tbody>
    </table>
  </details>
</template>
