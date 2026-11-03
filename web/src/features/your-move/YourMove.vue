<script setup lang="ts">
// Your move: the rows where the next step is yours, with the age, the why, and the Handled mark kept on this machine.
import { computed, reactive } from 'vue';
import { snapshot, ui, now, setMarks } from '@/store.ts';
import { yourRows } from '@/lib/moves.ts';
import type { YourRow } from '@/lib/moves.ts';
import { age, ago, when } from '@/lib/time.ts';
import { liveStatus } from '@/lib/live-status.ts';
import Island from '@/ui/Island.vue';
import Segmented from '@/ui/Segmented.vue';
import TicketCell from '@/ui/TicketCell.vue';
import PrCell from '@/ui/PrCell.vue';
import ExtLink from '@/ui/ExtLink.vue';
import AiButton from '@/ui/AiButton.vue';
import RecentlyDone from './RecentlyDone.vue';
import RowScroll from '@/ui/RowScroll.vue';
import { useMoveView } from './useMoveView.ts';
const moveView = useMoveView();
const view = computed(() => {
  void now.value;
  const mine = yourRows(snapshot.turn, moveView.value);
  return { ...mine, rows: mine.rows.map((item) => ({ ...item, age: age(item.row.activity_at) })) };
});
const options = computed(() => [
  { id: 'open', label: 'Open', count: view.value.open },
  { id: 'handled', label: 'Handled', count: view.value.handled },
]);
const emptyText = computed(() => {
  if (moveView.value === 'handled') {
    return 'Nothing marked as handled.';
  }
  const { noData, failing } = liveStatus(
    snapshot.health,
    snapshot.polled_at,
    snapshot.workspace.connectors.length,
    ui.live,
  );
  return noData
    ? 'No data: ' +
        failing.join(', ') +
        (failing.length === 1 ? ' is' : ' are') +
        ' failing. Check Settings.'
    : 'Nothing is waiting on you.';
});
const problems = reactive(new Map<string, string>());
const mark = async (item: YourRow) => {
  const id = item.row.row_id;
  const problem = await setMarks({
    handled: { [id]: item.handled ? null : new Date().toISOString() },
  });
  if (problem) {
    problems.set(id, problem);
  } else {
    problems.delete(id);
  }
};
</script>
<template>
  <Island
    id="your-move"
    title="Your move"
    note="Next step is yours"
    tip="Each row is something where the next step is yours. Ticket, PR and comment open in a new tab."
  >
    <template #head
      ><Segmented v-model="moveView" :options="options" label="Show" class="your-move__view"
    /></template>
    <RowScroll floor>
      <table class="table">
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Next step</th>
            <th>PR</th>
            <th class="hide-narrow">Last comment</th>
            <th class="table__actions-col"><span class="visually-hidden">Mark</span></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in view.rows"
            :key="item.row.row_id"
            class="your-move__row"
            :class="{ 'your-move__row--handled': item.handled }"
          >
            <TicketCell :row="item.row" />
            <td>
              <span class="hint-row">
                <span class="your-move__next">{{ item.row.next }}</span>
                <span
                  v-if="item.age.text"
                  class="age"
                  :class="{ 'age--old': item.age.old }"
                  :data-tip="'Waiting since ' + when(item.row.activity_at)"
                  >{{ item.age.text }}</span
                >
                <button
                  v-if="item.row.why"
                  type="button"
                  class="hint-icon"
                  aria-label="Why this is your move"
                  :data-tip="item.row.why"
                >
                  ?
                </button>
                <span
                  v-if="item.handled"
                  class="handled-chip"
                  :data-tip="
                    'Marked ' +
                    ago(snapshot.marks.handled[item.row.row_id] || '') +
                    '. Comes back in 7 days if it is still open, or sooner when something new happens.'
                  "
                  >handled</span
                >
              </span>
              <p
                v-if="problems.get(item.row.row_id)"
                class="alert alert--inline your-move__problem"
                role="alert"
              >
                {{ problems.get(item.row.row_id) }}
              </p>
            </td>
            <PrCell :row="item.row" />
            <td class="hide-narrow" :class="{ 'your-move__quote': item.row.comment }">
              <ExtLink
                v-if="item.row.comment"
                :text="item.row.comment"
                :url="item.row.comment_url"
              />
            </td>
            <td class="table__actions">
              <AiButton
                class="table__ai"
                :query="{ ws: snapshot.workspace.id, kind: 'row', ref: item.row.row_id }"
              />
              <button
                type="button"
                class="your-move__mark"
                :class="{ 'your-move__mark--undo': item.handled }"
                :aria-label="
                  (item.handled ? 'Move back to open: ' : 'Mark as handled: ') + item.row.key
                "
                @click.stop="mark(item)"
              >
                {{ item.handled ? 'Undo' : 'Handled' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </RowScroll>
    <p v-if="!view.rows.length" class="empty">
      {{ emptyText }}
    </p>
    <RecentlyDone v-if="moveView === 'open'" />
  </Island>
</template>
<style scoped>
.your-move__view {
  margin-left: 10px;
}

.your-move__next {
  font-weight: 500;
}

.your-move__quote {
  max-width: 48ch;
  color: var(--md-on-surface-variant);
  font-size: 12px;
  line-height: 16px;
}

.your-move__quote a {
  color: var(--md-on-surface-variant);
}

.your-move__problem {
  margin: 4px 0 0;
  padding: 4px 10px;
  font-size: 12px;
}

.your-move__mark {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--md-outline);
  border-radius: 999px;
  color: var(--md-on-surface);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}

.your-move__mark:hover {
  background: var(--state-hover);
}

.your-move__mark::before {
  content: '';
  width: 9px;
  height: 5px;
  border-bottom: 2px solid currentcolor;
  border-left: 2px solid currentcolor;
  transform: translateY(-2px) rotate(-45deg);
}

.your-move__mark--undo::before {
  display: none;
}

.your-move__mark:focus-visible {
  outline: var(--focus-ring);
  outline-offset: 2px;
}

.your-move__row--handled td {
  opacity: 0.55;
}

.your-move__row--handled .your-move__next {
  text-decoration: line-through;
  text-decoration-color: var(--md-outline);
}

.your-move__row--handled .table__actions {
  opacity: 1;
}
</style>
