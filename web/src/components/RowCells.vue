<script setup>
// The two cells every ticket row shares: the key with its summary, and the PR with its checks pill.
import { checksTone } from '../lib/moves.js';
import ExtLink from './ExtLink.vue';
defineProps({ row: { type: Object, required: true }, part: { type: String, required: true } });
</script>
<template>
  <td v-if="part === 'key'"><ExtLink :text="row.key" :url="row.ticket_url" cls="wt-key" /><span class="wt-sum">{{ row.summary }}</span></td>
  <td v-else-if="part === 'pr'">
    <template v-if="row.pr">
      <ExtLink :text="row.pr" :url="row.pr_url" />
      <template v-if="row.pr_state === 'OPEN' && row.checks"> <span class="wt-pill" :class="checksTone(row.checks)">{{ row.checks }}</span></template>
      <template v-else-if="row.pr_state"> <span class="wt-pill">{{ row.pr_state.toLowerCase() }}</span></template>
    </template>
  </td>
</template>
