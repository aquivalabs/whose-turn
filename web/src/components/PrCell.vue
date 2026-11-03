<script setup lang="ts">
// The PR cell: the PR as a link with its checks as a pill while open, or its state once it is not.
import { checksTone } from '../lib/moves.ts';
import { modifier } from '../lib/bem.ts';
import type { TurnRow } from '../lib/types.ts';
import ExtLink from './ExtLink.vue';
defineProps<{ row: TurnRow }>();
</script>
<template>
  <td>
    <template v-if="row.pr">
      <ExtLink :text="row.pr" :url="row.pr_url" />
      <template v-if="row.pr_state === 'OPEN' && row.checks">
        <span class="pill" :class="modifier('pill', checksTone(row.checks))">{{
          row.checks
        }}</span></template
      >
      <template v-else-if="row.pr_state">
        <span class="pill">{{ row.pr_state.toLowerCase() }}</span></template
      >
    </template>
  </td>
</template>
