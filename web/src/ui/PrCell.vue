<script setup lang="ts">
// The PR cell: the PR as a link with its checks as a pill under it while open, or its state once it is not.
import { checksTone, isPrOnly } from '@/lib/moves.ts';
import { modifier } from '@/lib/bem.ts';
import type { TurnRow } from '@/lib/types.ts';
import ExtLink from './ExtLink.vue';
defineProps<{ row: TurnRow }>();
</script>
<template>
  <td>
    <span v-if="row.pr && !isPrOnly(row)" class="pr-cell">
      <ExtLink :text="row.pr" :url="row.pr_url" class="pr-cell__link" />
      <span
        v-if="row.pr_state === 'OPEN' && row.checks"
        class="pill"
        :class="modifier('pill', checksTone(row.checks))"
        >{{ row.checks }}</span
      >
      <span v-else-if="row.pr_state" class="pill">{{ row.pr_state.toLowerCase() }}</span>
    </span>
  </td>
</template>
<style scoped>
.pr-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.pr-cell__link {
  max-width: 100%;
  overflow-wrap: anywhere;
}
</style>
