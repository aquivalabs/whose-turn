<script setup>
// Your move: the rows where the next step is yours, with the age, the why, and the Handled mark kept on this machine.
import { computed } from 'vue';
import { S, ui, setMarks } from '../store.js';
import { yourRows, isHandled } from '../lib/moves.js';
import { age, ago, when } from '../lib/time.js';
import Island from './Island.vue';
import RowCells from './RowCells.vue';
import ExtLink from './ExtLink.vue';
import AiButton from './AiButton.vue';
const view = computed(() => yourRows(S.turn, S.marks, ui.move));
const handled = (r) => isHandled(r, S.marks);
const mark = (r) => setMarks({ handled: { [r.row_id]: handled(r) ? null : new Date().toISOString() } });
</script>
<template>
  <Island id="your-move" title="Your move" note="Next step is yours" tip="Each row is something where the next step is yours. Ticket, PR and comment open in a new tab.">
    <template #head>
      <span class="wt-seg wt-move-view" role="group" aria-label="Show">
        <span class="wt-seg-b" role="button" tabindex="0" :aria-pressed="String(ui.move === 'open')" @click="ui.move = 'open'" @keydown.enter.prevent="ui.move = 'open'">Open <b>{{ view.open }}</b></span>
        <span class="wt-seg-b" role="button" tabindex="0" :aria-pressed="String(ui.move === 'handled')" @click="ui.move = 'handled'" @keydown.enter.prevent="ui.move = 'handled'">Handled <b>{{ view.handled }}</b></span>
      </span>
    </template>
    <div class="wt-scroll">
      <table>
        <thead><tr><th>Ticket</th><th>Next step</th><th>PR</th><th class="wt-hide-narrow">Last comment</th><th class="wt-act-col"><span class="wt-sr">Mark</span></th></tr></thead>
        <tbody>
          <tr v-for="r in view.rows" :key="r.row_id" :class="{ 'is-handled': handled(r) }">
            <RowCells :row="r" part="key" />
            <td>
              <span class="wt-hint-row">
                <span class="wt-next">{{ r.next }}</span>
                <span v-if="age(r.activity_at).text" class="wt-age" :class="{ old: age(r.activity_at).old }" :data-tip="'Waiting since ' + when(r.activity_at)">{{ age(r.activity_at).text }}</span>
                <span v-if="r.why" class="wt-hint-icon" role="button" tabindex="0" aria-label="Why this is your move" :data-tip="r.why">?</span>
                <span v-if="handled(r)" class="wt-handled-chip" :data-tip="'Marked ' + ago(S.marks.handled[r.row_id]) + '. Comes back in 7 days if it is still open, or sooner when something new happens.'">handled</span>
              </span>
            </td>
            <RowCells :row="r" part="pr" />
            <td class="wt-hide-narrow" :class="{ 'wt-quote': r.comment }"><ExtLink v-if="r.comment" :text="r.comment" :url="r.comment_url" /></td>
            <td class="wt-actions">
              <AiButton :query="{ ws: S.workspace.id, kind: 'row', ref: r.row_id }" />
              <span class="wt-mark" :class="{ undo: handled(r) }" role="button" tabindex="0" :aria-label="(handled(r) ? 'Move back to open: ' : 'Mark as handled: ') + r.key" @click.stop="mark(r)" @keydown.enter.prevent.stop="mark(r)">{{ handled(r) ? 'Undo' : 'Handled' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!view.rows.length" class="wt-empty">{{ ui.move === 'handled' ? 'Nothing marked as handled.' : 'Nothing is waiting on you.' }}</p>
  </Island>
</template>
