<script setup lang="ts">
// A link to a source: followed only when it is https, otherwise the text alone (data is untrusted). Class and title fall through from the caller.
import { computed } from 'vue';
import { safeUrl } from '@/lib/api.ts';
const props = withDefaults(defineProps<{ text?: string; url?: string }>(), { text: '', url: '' });
const href = computed(() => safeUrl(props.url));
</script>
<template>
  <a v-if="href" :href="href" target="_blank" rel="noopener">{{ text }}</a>
  <span v-else>{{ text }}</span>
</template>
