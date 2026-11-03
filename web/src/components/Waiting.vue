<script setup lang="ts">
// Waiting on others: tickets you touched where someone else holds the next step.
import { computed } from 'vue';
import { snapshot, now } from '../store.ts';
import { waitingRows, statusTone } from '../lib/moves.ts';
import { age, when } from '../lib/time.ts';
import Island from './Island.vue';
import TicketCell from './TicketCell.vue';
import PrCell from './PrCell.vue';
import ExtLink from './ExtLink.vue';
import AiButton from './AiButton.vue';
const rows = computed(() => {
  void now.value;
  return waitingRows(snapshot.turn).map((row) => ({
    row,
    since: row.status_since ? age(row.status_since) : null,
  }));
});
</script>
<template>
  <Island
    id="waiting"
    title="Waiting on others"
    note="Someone else holds the next step"
    tip="Tickets you touched in the last 30 days where someone else holds the next step: a reviewer, QA, or a new owner."
  >
    <p v-if="!rows.length" class="wt-empty">Nothing is waiting on someone else.</p>
    <div v-else class="wt-scroll">
      <table>
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Status</th>
            <th>With</th>
            <th class="wt-hide-narrow">Waiting for</th>
            <th>PR</th>
            <th class="wt-act-col"><span class="wt-sr">Copy for AI</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="{ row, since } in rows" :key="row.row_id">
            <TicketCell :row="row" />
            <td>
              <span class="wt-pill" :class="statusTone(row.status)">{{ row.status }}</span>
            </td>
            <td>
              {{ row.whose }}
              <span
                v-if="since"
                class="wt-age"
                :class="{ old: since.hours >= 72 }"
                :data-tip="row.status + ' since ' + when(row.status_since)"
                >{{ since.text }}</span
              >
            </td>
            <td class="wt-hide-narrow">
              <span v-if="row.hold_url" class="wt-hint-row"
                ><ExtLink :text="row.next" :url="row.hold_url" class="wt-oneline" /><span
                  class="wt-hint-icon"
                  role="button"
                  tabindex="0"
                  aria-label="Full reason"
                  :data-tip="row.hold_full || row.next"
                  >?</span
                ></span
              >
              <template v-else>{{ row.next }}</template>
            </td>
            <PrCell :row="row" />
            <td class="wt-actions">
              <AiButton :query="{ ws: snapshot.workspace.id, kind: 'row', ref: row.row_id }" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </Island>
</template>
