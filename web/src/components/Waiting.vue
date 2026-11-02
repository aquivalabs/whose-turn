<script setup>
// Waiting on others: tickets you touched where someone else holds the next step.
import { computed } from 'vue';
import { S } from '../store.js';
import { waitingRows, statusTone } from '../lib/moves.js';
import { age, when } from '../lib/time.js';
import Island from './Island.vue';
import RowCells from './RowCells.vue';
import ExtLink from './ExtLink.vue';
import AiButton from './AiButton.vue';
const rows = computed(() => waitingRows(S.turn));
</script>
<template>
  <Island id="waiting" title="Waiting on others" note="Someone else holds the next step" tip="Tickets you touched in the last 30 days where someone else holds the next step: a reviewer, QA, or a new owner.">
    <div class="wt-scroll">
      <table>
        <thead><tr><th>Ticket</th><th>Status</th><th>With</th><th class="wt-hide-narrow">Waiting for</th><th>PR</th><th class="wt-act-col"><span class="wt-sr">Copy for AI</span></th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.row_id">
            <RowCells :row="r" part="key" />
            <td><span class="wt-pill" :class="statusTone(r.status)">{{ r.status }}</span></td>
            <td>{{ r.whose }} <span v-if="r.status_since" class="wt-age" :class="{ old: age(r.status_since).hours >= 72 }" :data-tip="r.status + ' since ' + when(r.status_since)">{{ age(r.status_since).text }}</span></td>
            <td class="wt-hide-narrow">
              <span v-if="r.hold_url" class="wt-hint-row"><ExtLink :text="r.next" :url="r.hold_url" cls="wt-oneline" /><span class="wt-hint-icon" role="button" tabindex="0" aria-label="Full reason" :data-tip="r.hold_full || r.next">?</span></span>
              <template v-else>{{ r.next }}</template>
            </td>
            <RowCells :row="r" part="pr" />
            <td class="wt-actions"><AiButton :query="{ ws: S.workspace.id, kind: 'row', ref: r.row_id }" /></td>
          </tr>
        </tbody>
      </table>
    </div>
  </Island>
</template>
