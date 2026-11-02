<script setup>
// The PR cell: the PR as a link with its checks as a pill while open, or its state once it is not.
import { checksTone } from '../lib/moves.js';
import ExtLink from './ExtLink.vue';
defineProps({ row: { type: Object, required: true } });
</script>
<template>
  <td>
    <template v-if="row.pr">
      <ExtLink :text="row.pr" :url="row.pr_url" />
      <template v-if="row.pr_state === 'OPEN' && row.checks"> <span class="wt-pill" :class="checksTone(row.checks)">{{ row.checks }}</span></template>
      <template v-else-if="row.pr_state"> <span class="wt-pill">{{ row.pr_state.toLowerCase() }}</span></template>
    </template>
  </td>
</template>
