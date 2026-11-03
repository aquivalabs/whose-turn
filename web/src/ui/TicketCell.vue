<script setup lang="ts">
// The ticket cell every row starts with: the key as a link and the summary under it; a PR without a ticket links its PR.
import type { TurnRow } from '@/lib/types.ts';
import { isPrOnly } from '@/lib/moves.ts';
import ExtLink from './ExtLink.vue';
defineProps<{ row: TurnRow }>();
</script>
<template>
  <td class="ticket-cell">
    <ExtLink :text="row.key" :url="isPrOnly(row) ? row.pr_url : row.ticket_url" class="ticket-key" /><span
      class="ticket-cell__summary"
      >{{ row.summary }}</span
    >
  </td>
</template>
<style scoped>
.ticket-cell__summary {
  display: block;
  max-width: 44ch;
  margin-top: 2px;
  color: var(--md-on-surface-variant);
  font-size: 12px;
  line-height: 16px;
  letter-spacing: 0.03em;
}
</style>
