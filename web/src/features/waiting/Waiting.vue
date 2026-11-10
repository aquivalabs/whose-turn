<script setup lang="ts">
import { CLOCK } from '@/lib/icons.ts';
// Waiting on others: tickets you touched where someone else holds the next step.
import { computed } from 'vue';
import { AnimatePresence, M as Motion } from 'motion-v';
import { fade, leaving, listed } from '@/motion.ts';
import { snapshot, now, holdScroller, noDataText } from '@/store.ts';
import { waitingRows, statusTone, hasPrColumn } from '@/lib/moves.ts';
import { modifier } from '@/lib/bem.ts';
import { age, when } from '@/lib/time.ts';
import Island from '@/ui/Island.vue';
import TicketCell from '@/ui/TicketCell.vue';
import PrCell from '@/ui/PrCell.vue';
import ExtLink from '@/ui/ExtLink.vue';
import AiButton from '@/ui/AiButton.vue';
import RowScroll from '@/ui/RowScroll.vue';
import Swap from '@/ui/Swap.vue';
import { useText } from '@/i18n/index.ts';
const t = useText();
const holdPanelScroller = holdScroller('waiting');
const MARK_APPROVED = '✓';
const MARK_CHANGES = '✗';
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
    ? t('waiting.note.backlog')
    : t('waiting.note.others'),
);
</script>
<template>
  <Island
    id="waiting"
    :icon="CLOCK"
    hue="var(--sys-indigo)"
    rank="quiet"
    :size-key="`${snapshot.workspace.id}:waiting`"
    :title="t('waiting.title')"
    :note="note"
    :tip="t('waiting.tip')"
  >
    <template #head
      ><span v-if="rows.length" class="count">{{ rows.length }}</span></template
    >
    <Swap v-slot="{ face }" :face="rows.length ? 'list' : 'empty'">
    <Motion v-if="face === 'empty'" key="empty" v-bind="fade" as="p" class="empty">{{ noDataText('waiting.noData') || t('waiting.empty') }}</Motion>
    <Motion v-else-if="face === 'list'" key="list" v-bind="fade" class="island__fade">
    <RowScroll @scroller="holdPanelScroller">
      <table class="table waiting__table">
        <thead>
          <tr>
            <th class="waiting__col waiting__col--ticket">{{ t('waiting.col.ticket') }}</th>
            <th class="waiting__col waiting__col--status">{{ t('waiting.col.status') }}</th>
            <th class="waiting__col waiting__col--with">{{ t('waiting.col.with') }}</th>
            <th v-if="showReason" class="hide-narrow waiting__col--reason">{{ t('waiting.col.waitingFor') }}</th>
            <th v-if="showPr" class="waiting__col waiting__col--pr">{{ t('waiting.col.pr') }}</th>
            <th class="table__actions-col waiting__col waiting__col--actions">
              <span class="visually-hidden">{{ t('waiting.col.copyForAi') }}</span>
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
                      reviewer.state === 'approved' ? MARK_APPROVED : MARK_CHANGES
                    }}</span
                    ><span class="visually-hidden">{{
                      reviewer.state === 'approved' ? t('waiting.row.approvedBy') : t('waiting.row.changesBy')
                    }}</span> </template
                  >{{ reviewer.name }}{{ ' ' }}</span
                >
              </template>
              <template v-else>{{ own ? t('waiting.row.you') : row.whose }}</template>
              <span
                v-if="since"
                class="age"
                :class="{ 'age--old': since.hours >= 72 }"
                :data-tip="t('waiting.row.since', { status: row.status, when: when(row.status_since) })"
                >{{ t('waiting.row.for', { age: since.text }) }}</span
              >
            </td>
            <td v-if="showReason" class="hide-narrow">
              <span v-if="row.hold_url" class="hint-row"
                ><ExtLink :text="row.next" :url="row.hold_url" class="waiting__reason" /><button
                  type="button"
                  class="hint-label"
                  :aria-label="t('waiting.row.fullReason')"
                  :data-tip="row.hold_full || row.next"
                >
                  {{ t('waiting.row.full') }}
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
    </Swap>
  </Island>
</template>
<style scoped>
.waiting__table {
  table-layout: fixed;
}

.waiting__table th {
  overflow: hidden;
  text-overflow: ellipsis;
}

.waiting__table th.waiting__col--reason {
  white-space: normal;
}

.waiting__col--ticket {
  width: 24%;
}

.waiting__col--status,
.waiting__col--with {
  width: 5.5rem;
}

.waiting__col--pr {
  width: 4rem;
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
