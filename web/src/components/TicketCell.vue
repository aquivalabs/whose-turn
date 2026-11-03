<script setup lang="ts">
// The ticket cell every row starts with: the key as a link and the summary under it.
import type { TurnRow } from '../lib/types.ts';
import ExtLink from './ExtLink.vue';
defineProps<{ row: TurnRow }>();
</script>
<template>
  <td>
    <ExtLink :text="row.key" :url="row.ticket_url" class="wt-key" /><span class="wt-sum">{{
      row.summary
    }}</span>
  </td>
</template>
