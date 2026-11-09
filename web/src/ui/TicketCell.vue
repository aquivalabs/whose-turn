<script setup lang="ts">
// The ticket cell every row starts with: the key as a link with the row's labels beside it, and the summary under it; a PR without a ticket links its PR.
import type { TurnRow } from '@/lib/types.ts';
import { isPrOnly } from '@/lib/moves.ts';
import ExtLink from './ExtLink.vue';
import LabelChips from './LabelChips.vue';
defineProps<{ row: TurnRow }>();
</script>
<template>
  <td class="ticket-cell">
    <span class="ticket-cell__head"
      ><ExtLink :text="row.key" :url="isPrOnly(row) ? row.pr_url : row.ticket_url" class="ticket-key" /><LabelChips
        :labels="row.labels || []"
        :badges="row.badges"
    /></span
    ><span class="ticket-cell__summary">{{ row.summary }}</span>
  </td>
</template>
<style scoped>
.ticket-cell__head {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  max-width: 44ch;
}

.ticket-cell__summary {
  display: block;
  max-width: 44ch;
  margin-top: 0.125rem;
  color: var(--md-on-surface-variant);
  font-size: 0.75rem;
  line-height: 1rem;
  letter-spacing: 0.03em;
}
</style>
