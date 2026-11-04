<script setup lang="ts">
// Your move: the rows where the next step is yours, with the age, the why, and the Handled mark kept on this machine.
import { computed, reactive } from 'vue';
import { refAutoReset } from '@vueuse/core';
import { snapshot, ui, now, setMarks } from '@/store.ts';
import { yourRows, hasPrColumn } from '@/lib/moves.ts';
import type { YourRow } from '@/lib/moves.ts';
import { age, ago, when } from '@/lib/time.ts';
import { liveStatus } from '@/lib/live-status.ts';
import { useClearOnReconnect } from '@/composables/useClearOnReconnect.ts';
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
  const mine = yourRows(snapshot.turn, moveView.value, snapshot.marks.info, ui.note);
  const rows = mine.rows.map((item) => {
    const info = snapshot.marks.info[item.row.row_id];
    const auto = Boolean(info?.auto);
    return {
      ...item,
      age: age(item.row.activity_at),
      auto,
      lined: auto || Boolean(info?.note),
      line: (auto ? info?.outcome : info?.note) || '',
    };
  });
  return { ...mine, rows };
});
const showPr = computed(() => hasPrColumn(view.value.rows.map((item) => item.row)));
const showComment = computed(() => view.value.rows.some((item) => item.row.comment));
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
useClearOnReconnect(() => problems.clear());
const markedAt = (item: YourRow) =>
  new Date(snapshot.marks.handled[item.row.row_id] || '').toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
const mark = async (item: YourRow) => {
  const id = item.row.row_id;
  const nowHandled = !item.handled;
  const problem = await setMarks({
    handled: { [id]: nowHandled ? new Date().toISOString() : null },
  });
  if (problem) {
    problems.set(id, problem);
  } else {
    problems.delete(id);
    justHandled.value = nowHandled ? id : '';
    ui.note = nowHandled ? id : '';
  }
};
const justHandled = refAutoReset('', 8000);
const undoHandled = () => {
  const id = justHandled.value;
  justHandled.value = '';
  return setMarks({ handled: { [id]: null } });
};
</script>
<template>
  <Island
    id="your-move"
    :size-key="`${snapshot.workspace.id}:your-move`"
    title="Your move"
    note="Next step is yours"
    tip="Each row is something where the next step is yours. Ticket, PR and comment open in a new tab."
  >
    <template #head
      ><Segmented v-model="moveView" :options="options" label="Show" class="your-move__view"
    /></template>
    <p v-if="justHandled" class="your-move__undo" role="status">
      Marked handled.
      <button type="button" class="your-move__undo-btn" @click="undoHandled">Undo</button>
    </p>
    <RowScroll floor>
      <table class="table">
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Next step</th>
            <th v-if="showPr">PR</th>
            <th v-if="showComment" class="hide-narrow">Last comment</th>
            <th class="table__actions-col"><span class="visually-hidden">Mark</span></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="item in view.rows" :key="item.row.row_id">
            <tr
              class="your-move__row"
              :class="{
                'your-move__row--handled': item.handled,
                'your-move__row--lined': item.lined,
              }"
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
                    class="hint-label"
                    aria-label="Why this is your move"
                    :data-tip="item.row.why"
                    data-tip-click
                  >
                    why
                  </button>
                  <span
                    v-if="item.handled && !item.auto"
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
              <PrCell v-if="showPr" :row="item.row" />
              <td
                v-if="showComment"
                class="hide-narrow"
                :class="{ 'your-move__quote': item.row.comment }"
              >
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
                  v-if="!item.auto"
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
            <tr
              v-if="item.lined"
              data-row-tail
              class="your-move__line-row"
              :class="{ 'your-move__line-row--handled': item.handled }"
            >
              <td colspan="99" class="your-move__line-cell">
                <button
                  type="button"
                  class="your-move__line"
                  data-tip="Open the full text and edit the note"
                  @click="ui.note = item.row.row_id"
                >
                  <span class="your-move__arrow" aria-hidden="true">&rarr;</span>
                  <span class="your-move__outcome">{{ item.line }}</span>
                  <time class="your-move__time">{{ markedAt(item) }}</time>
                </button>
              </td>
            </tr>
          </template>
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
.your-move__undo {
  margin: 0;
  padding: 4px 0;
  color: var(--md-on-surface-variant);
  font-size: 13px;
}

.your-move__undo-btn {
  color: var(--md-primary);
  font-weight: 500;
  cursor: pointer;
}

.your-move__view {
  margin-left: 10px;
}

.your-move__next {
  font-weight: 500;
}

.your-move__line-cell {
  max-width: 0;
  padding-top: 0;
}

.your-move__line {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 24px;
  padding: 0 10px 0 8px;
  border-left: 2px solid var(--md-outline);
  border-radius: 0 6px 6px 0;
  background: var(--md-s-high);
  color: var(--md-on-surface-variant);
  font-size: 12px;
  line-height: 16px;
  text-align: left;
  cursor: pointer;
}

.your-move__line:hover {
  background: var(--md-s-highest);
}

.your-move__line:focus-visible {
  outline: var(--focus-ring);
  outline-offset: 1px;
}

.your-move__arrow {
  flex: none;
}

.your-move__outcome {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.your-move__time {
  flex: none;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
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

.your-move__row--lined td {
  border-bottom: 0;
  padding-bottom: 8px;
}

.your-move__row--handled td,
.your-move__line-row--handled td {
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
