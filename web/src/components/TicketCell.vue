<script setup>
// The ticket cell every row starts with: the key as a link and the summary under it.
import ExtLink from './ExtLink.vue';
defineProps({ row: { type: Object, required: true } });
</script>
<template><td><ExtLink :text="row.key" :url="row.ticket_url" class="wt-key" /><span class="wt-sum">{{ row.summary }}</span></td></template>
