<script setup lang="ts">
// Your move: the rows where the next step is yours, with the age, the why, and the Handled mark kept on this machine.
import { computed, reactive } from 'vue';
import { AnimatePresence, M as Motion } from 'motion-v';
import { snapshot, ui, now, setMarks, justHandled, holdScroller, sourcesDown } from '@/store.ts';
import { yourRows, hasPrColumn } from '@/lib/moves.ts';
import type { YourRow } from '@/lib/moves.ts';
import { age, ago, when } from '@/lib/time.ts';
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
import { fade, leaving, listed } from '@/motion.ts';
import { useText } from '@/i18n/index.ts';
const t = useText();
const holdPanelScroller = holdScroller('your_move');
const moveView = useMoveView();
const view = computed(() => {
  void now.value;
  const mine = yourRows(snapshot.turn, moveView.value, snapshot.marks.info);
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
  { id: 'open', label: t('yourMove.view.open'), count: view.value.open },
  { id: 'handled', label: t('yourMove.view.handled'), count: view.value.handled },
]);
const emptyText = computed(() => {
  if (moveView.value === 'handled') {
    return t('yourMove.empty.nothingHandled');
  }
  return sourcesDown.value.length
    ? t('yourMove.empty.noData', { names: sourcesDown.value.join(', ') }, sourcesDown.value.length)
    : t('yourMove.empty.nothingWaiting');
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
  if (!item.handled) {
    ui.note = id;
    return;
  }
  const problem = await setMarks({ handled: { [id]: null } });
  if (problem) {
    problems.set(id, problem);
  } else {
    problems.delete(id);
    justHandled.value = '';
  }
};
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
    :title="t('yourMove.island.title')"
    :note="t('yourMove.island.note')"
    :tip="t('yourMove.island.tip')"
  >
    <template #head
      ><Segmented
        v-model="moveView"
        :options="options"
        :label="t('yourMove.view.label')"
        class="your-move__view"
    /></template>
    <AnimatePresence>
      <Motion v-if="justHandled" v-bind="fade" as="p" class="your-move__undo" role="status">
        {{ t('yourMove.undo.marked') }}
        <button type="button" class="your-move__undo-btn" @click="undoHandled">
          {{ t('yourMove.undo.button') }}
        </button>
      </Motion>
    </AnimatePresence>
    <RowScroll floor @scroller="holdPanelScroller">
      <table class="table">
        <thead>
          <tr>
            <th>{{ t('yourMove.columns.ticket') }}</th>
            <th>{{ t('yourMove.columns.nextStep') }}</th>
            <th v-if="showPr">{{ t('yourMove.columns.pr') }}</th>
            <th v-if="showComment" class="hide-narrow">{{ t('yourMove.columns.lastComment') }}</th>
            <th class="table__actions-col">
              <span class="visually-hidden">{{ t('yourMove.columns.mark') }}</span>
            </th>
          </tr>
        </thead>
        <AnimatePresence @before-leave="leaving">
          <Motion v-for="item in view.rows" :key="item.row.row_id" v-bind="listed" as="tbody">
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
                    :data-tip="t('yourMove.row.waitingSince', { when: when(item.row.activity_at) })"
                    >{{ item.age.text }}</span
                  >
                  <button
                    v-if="item.row.why"
                    type="button"
                    class="hint-label"
                    :aria-label="t('yourMove.row.whyLabel')"
                    :data-tip="item.row.why"
                    data-tip-click
                  >
                    {{ t('yourMove.row.why') }}
                  </button>
                  <span
                    v-if="item.handled && !item.auto"
                    class="handled-chip"
                    :data-tip="
                      t('yourMove.row.handledTip', {
                        ago: ago(snapshot.marks.handled[item.row.row_id] || ''),
                      })
                    "
                    >{{ t('yourMove.row.handledChip') }}</span
                  >
                </span>
                <AnimatePresence>
                  <Motion
                    v-if="problems.get(item.row.row_id)"
                    v-bind="fade"
                    as="p"
                    class="alert alert--inline your-move__problem"
                    role="alert"
                  >
                    {{ problems.get(item.row.row_id) }}
                  </Motion>
                </AnimatePresence>
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
                    item.handled
                      ? t('yourMove.row.moveBack', { key: item.row.key })
                      : t('yourMove.row.markHandled', { key: item.row.key })
                  "
                  @click.stop="mark(item)"
                >
                  {{ item.handled ? t('yourMove.row.undo') : t('yourMove.row.handled') }}
                </button>
              </td>
            </tr>
            <AnimatePresence>
              <Motion
                v-if="item.lined"
                v-bind="fade"
                as="tr"
                class="your-move__line-row"
                :class="{ 'your-move__line-row--handled': item.handled }"
              >
                <td colspan="99" class="your-move__line-cell">
                  <button
                    type="button"
                    class="your-move__line"
                    :data-tip="t('yourMove.row.openNote')"
                    @click="ui.note = item.row.row_id"
                  >
                    <span class="your-move__arrow" aria-hidden="true">&rarr;</span>
                    <span class="your-move__outcome">{{ item.line }}</span>
                    <time class="your-move__time">{{ markedAt(item) }}</time>
                  </button>
                </td>
              </Motion>
            </AnimatePresence>
          </Motion>
        </AnimatePresence>
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
  padding: 0.25rem 0;
  color: var(--md-on-surface-variant);
  font-size: 0.8125rem;
}

.your-move__undo-btn {
  color: var(--md-primary);
  font-weight: 500;
  cursor: pointer;
}

.your-move__view {
  margin-left: 0.625rem;
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
  gap: 0.5rem;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 1.5rem;
  padding: 0 0.625rem 0 0.5rem;
  border-left: 2px solid var(--md-outline);
  border-radius: 0 0.375rem 0.375rem 0;
  background: var(--md-s-high);
  color: var(--md-on-surface-variant);
  font-size: 0.75rem;
  line-height: 1rem;
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
  font-size: 0.75rem;
  line-height: 1rem;
}

.your-move__quote a {
  color: var(--md-on-surface-variant);
}

.your-move__problem {
  margin: 0.25rem 0 0;
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
}

.your-move__mark {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  height: 1.875rem;
  padding: 0 0.75rem;
  border: 1px solid var(--md-outline);
  border-radius: 62.4375rem;
  color: var(--md-on-surface);
  font-size: 0.75rem;
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
  width: 0.5625rem;
  height: 0.3125rem;
  border-bottom: 2px solid currentcolor;
  border-left: 2px solid currentcolor;
  transform: translateY(-0.125rem) rotate(-45deg);
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
  padding-bottom: 0.5rem;
}

.your-move__row td,
.your-move__line-row td {
  transition: opacity var(--motion-base) var(--motion-ease);
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
