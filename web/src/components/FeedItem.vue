<script setup>
// One feed item: the source badge, the reference, the kind, who, when, and the comment expanded in place with its actions.
import { computed } from 'vue';
import { S, ui, now, setMarks } from '../store.js';
import { toneOf, hasBody } from '../lib/feed.js';
import { ago } from '../lib/time.js';
import ExtLink from './ExtLink.vue';
import AiButton from './AiButton.vue';
const props = defineProps({ item: { type: Object, required: true }, source: { type: Object, required: true }, fresh: { type: Boolean, required: true } });
const emit = defineEmits(['open']);
const badge = computed(() => (props.source.type === 'github' ? 'GH' : String(props.source.label).slice(0, 2).toUpperCase()));
const tone = computed(() => toneOf(props.item.kind));
const written = computed(() => hasBody(props.item));
const open = computed(() => written.value && ui.open.has(props.item.id));
const when = computed(() => { void now.value; return ago(props.item.at); });
const seen = () => { if (props.fresh) setMarks({ seen: [props.item.id] }); };
const toggle = () => { if (ui.open.has(props.item.id)) ui.open.delete(props.item.id); else ui.open.add(props.item.id); seen(); };
</script>
<template>
  <li :class="{ 'is-new': fresh, 'is-open': open }" @click="seen">
    <span class="wt-feed-icon" :class="tone || (source.type === 'github' ? '' : 'jira')">{{ badge }}</span>
    <div class="wt-feed-body">
      <div class="wt-feed-top">
        <ExtLink :text="item.ref" :url="item.url" />
        <span class="wt-feed-kind" :class="{ bad: tone === 'bad' }">{{ item.kind }}</span>
        <span v-if="item.who" class="wt-feed-who">{{ item.who }}</span>
        <span v-if="item.mention" class="wt-at-you">@you</span>
        <span class="wt-feed-right">
          <span class="wt-feed-when">{{ when }}</span>
          <span v-if="written" class="wt-feed-toggle" role="button" tabindex="0" :aria-label="open ? 'Collapse' : 'Expand'" :aria-expanded="String(open)" @click.stop="toggle" @keydown.enter.prevent.stop="toggle"></span>
        </span>
      </div>
      <template v-if="open">
        <span v-if="item.key && item.source === 'github'" class="wt-feed-text">{{ item.key }}</span>
        <div class="wt-feed-full">{{ item.body }}</div>
        <div class="wt-feed-actions">
          <span class="wt-btn tonal" role="button" tabindex="0" @click.stop="emit('open', item)" @keydown.enter.prevent.stop="emit('open', item)">Open formatted</span>
          <AiButton :query="{ ws: S.workspace.id, kind: 'feed', ref: item.id }" />
          <ExtLink :text="'Open in ' + source.label" :url="item.url" class="wt-btn" />
        </div>
      </template>
      <span v-else-if="item.text" class="wt-feed-text">{{ (item.source === 'github' && item.key ? item.key + ' · ' : '') + item.text }}</span>
    </div>
  </li>
</template>
