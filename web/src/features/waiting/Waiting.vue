<script setup lang="ts">
// Waiting on others: tickets you touched where someone else holds the next step.
import { computed } from 'vue';
import { AnimatePresence, M as Motion } from 'motion-v';
import { fade, leaving, listed } from '@/motion.ts';
import { snapshot, now } from '@/store.ts';
import { waitingRows, statusTone, hasPrColumn } from '@/lib/moves.ts';
import { modifier } from '@/lib/bem.ts';
import { age, when } from '@/lib/time.ts';
import Island from '@/ui/Island.vue';
import TicketCell from '@/ui/TicketCell.vue';
import PrCell from '@/ui/PrCell.vue';
import ExtLink from '@/ui/ExtLink.vue';
import AiButton from '@/ui/AiButton.vue';
import RowScroll from '@/ui/RowScroll.vue';
const rows = computed(() => {
  void now.value;
  return waitingRows(snapshot.turn).map((row) => ({
    row,
    since: row.status_since ? age(row.status_since) : null,
    own: row.status_group === 'backlog',
  }));
});
const showPr = computed(() => hasPrColumn(rows.value.map(({ row }) => row)));
const showReason = computed(() => rows.value.some(({ row, own }) => row.hold_url || (!own && row.next)));
const note = computed(() =>
  rows.value.length && rows.value.every(({ own }) => own)
    ? 'Your backlog'
    : 'Someone else holds the next step',
);
</script>
<template>
  <Island
    id="waiting"
    :size-key="`${snapshot.workspace.id}:waiting`"
    title="Waiting on others"
    :note="note"
    tip="Tickets you touched in the last 30 days where someone else holds the next step: a reviewer, QA, or a new owner."
  >
    <template #head
      ><span v-if="rows.length" class="count">{{ rows.length }}</span></template
    >
    <!-- docs/mechanisms/motion.md § The empty text waits for the list to leave -->
    <AnimatePresence mode="wait" :initial="false">
    <Motion v-if="!rows.length" key="empty" v-bind="fade" as="p" class="empty">Nothing is waiting on someone else.</Motion>
    <Motion v-else key="list" v-bind="fade" class="island__fade">
    <RowScroll>
      <table class="table waiting__table">
        <thead>
          <tr>
            <th class="waiting__col waiting__col--ticket">Ticket</th>
            <th class="waiting__col waiting__col--status">Status</th>
            <th class="waiting__col waiting__col--with">With</th>
            <th v-if="showReason" class="hide-narrow">Waiting for</th>
            <th v-if="showPr" class="waiting__col waiting__col--pr">PR</th>
            <th class="table__actions-col waiting__col waiting__col--actions">
              <span class="visually-hidden">Copy for AI</span>
            </th>
          </tr>
        </thead>
        <AnimatePresence @before-leave="leaving">
        <Motion v-for="{ row, since, own } in rows" :key="row.row_id" v-bind="listed" as="tbody">
          <tr>
            <TicketCell :row="row" />
            <td>
              <span class="pill" :class="modifier('pill', statusTone(row.status_group))">{{
                row.status
              }}</span>
            </td>
            <td>
              <template v-if="!own && row.reviewers?.length">
                <span
                  v-for="reviewer in row.reviewers"
                  :key="reviewer.name"
                  class="waiting__reviewer"
                  ><template v-if="reviewer.state"
                    ><span class="waiting__mark" aria-hidden="true">{{
                      reviewer.state === 'approved' ? '✓' : '✗'
                    }}</span
                    ><span class="visually-hidden">{{
                      reviewer.state === 'approved' ? ' approved by ' : ' changes requested by '
                    }}</span> </template
                  >{{ reviewer.name }}{{ ' ' }}</span
                >
              </template>
              <template v-else>{{ own ? 'you' : row.whose }}</template>
              <span
                v-if="since"
                class="age"
                :class="{ 'age--old': since.hours >= 72 }"
                :data-tip="row.status + ' since ' + when(row.status_since)"
                >{{ since.text }}</span
              >
            </td>
            <td v-if="showReason" class="hide-narrow">
              <span v-if="row.hold_url" class="hint-row"
                ><ExtLink :text="row.next" :url="row.hold_url" class="waiting__reason" /><button
                  type="button"
                  class="hint-label"
                  aria-label="Full reason"
                  :data-tip="row.hold_full || row.next"
                >
                  full
                </button></span
              >
              <template v-else-if="!own">{{ row.next }}</template>
            </td>
            <PrCell v-if="showPr" :row="row" />
            <td class="table__actions">
              <AiButton
                class="table__ai"
                :query="{ ws: snapshot.workspace.id, kind: 'row', ref: row.row_id }"
              />
            </td>
          </tr>
        </Motion>
        </AnimatePresence>
      </table>
    </RowScroll>
    </Motion>
    </AnimatePresence>
  </Island>
</template>
<style scoped>
.waiting__table {
  table-layout: fixed;
}

.waiting__col--ticket {
  width: 22%;
}

.waiting__col--status,
.waiting__col--with {
  width: 6.5rem;
}

.waiting__col--pr {
  width: 4.5rem;
}

.waiting__col--actions {
  width: 2rem;
}

.waiting__reviewer {
  display: block;
  overflow-wrap: anywhere;
}

.waiting__mark {
  margin-right: 0.2em;
}

.waiting__reason {
  display: block;
  min-width: 0;
  max-width: 44ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
