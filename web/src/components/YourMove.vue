<script setup>
// Your move: the rows where the next step is yours, with the age, the why, and the Handled mark kept on this machine.
import { computed } from 'vue';
import { S, ui, now, setMarks } from '../store.js';
import { yourRows } from '../lib/moves.js';
import { age, ago, when } from '../lib/time.js';
import Island from './Island.vue';
import Segmented from './Segmented.vue';
import TicketCell from './TicketCell.vue';
import PrCell from './PrCell.vue';
import ExtLink from './ExtLink.vue';
import AiButton from './AiButton.vue';
const view = computed(() => { void now.value; const v = yourRows(S.turn, S.marks, ui.move); return { ...v, rows: v.rows.map((item) => ({ ...item, age: age(item.row.activity_at) })) }; });
const options = computed(() => [{ id: 'open', label: 'Open', count: view.value.open }, { id: 'handled', label: 'Handled', count: view.value.handled }]);
const mark = (item) => setMarks({ handled: { [item.row.row_id]: item.handled ? null : new Date().toISOString() } });
</script>
<template>
  <Island id="your-move" title="Your move" note="Next step is yours" tip="Each row is something where the next step is yours. Ticket, PR and comment open in a new tab.">
    <template #head><Segmented v-model="ui.move" :options="options" label="Show" class="wt-move-view" /></template>
    <div class="wt-scroll">
      <table>
        <thead><tr><th>Ticket</th><th>Next step</th><th>PR</th><th class="wt-hide-narrow">Last comment</th><th class="wt-act-col"><span class="wt-sr">Mark</span></th></tr></thead>
        <tbody>
          <tr v-for="item in view.rows" :key="item.row.row_id" :class="{ 'is-handled': item.handled }">
            <TicketCell :row="item.row" />
            <td>
              <span class="wt-hint-row">
                <span class="wt-next">{{ item.row.next }}</span>
                <span v-if="item.age.text" class="wt-age" :class="{ old: item.age.old }" :data-tip="'Waiting since ' + when(item.row.activity_at)">{{ item.age.text }}</span>
                <span v-if="item.row.why" class="wt-hint-icon" role="button" tabindex="0" aria-label="Why this is your move" :data-tip="item.row.why">?</span>
                <span v-if="item.handled" class="wt-handled-chip" :data-tip="'Marked ' + ago(S.marks.handled[item.row.row_id]) + '. Comes back in 7 days if it is still open, or sooner when something new happens.'">handled</span>
              </span>
            </td>
            <PrCell :row="item.row" />
            <td class="wt-hide-narrow" :class="{ 'wt-quote': item.row.comment }"><ExtLink v-if="item.row.comment" :text="item.row.comment" :url="item.row.comment_url" /></td>
            <td class="wt-actions">
              <AiButton :query="{ ws: S.workspace.id, kind: 'row', ref: item.row.row_id }" />
              <span class="wt-mark" :class="{ undo: item.handled }" role="button" tabindex="0" :aria-label="(item.handled ? 'Move back to open: ' : 'Mark as handled: ') + item.row.key" @click.stop="mark(item)" @keydown.enter.prevent.stop="mark(item)">{{ item.handled ? 'Undo' : 'Handled' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!view.rows.length" class="wt-empty">{{ ui.move === 'handled' ? 'Nothing marked as handled.' : 'Nothing is waiting on you.' }}</p>
  </Island>
</template>
