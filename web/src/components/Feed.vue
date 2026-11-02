<script setup>
// What changed: newest first, filtered by source, searched by words, grouped by ticket or flat; unread stays lit until clicked.
import { computed } from 'vue';
import { S, ui, setMarks, setFeedView } from '../store.js';
import { isNew, matchesQuery, groupFeed } from '../lib/feed.js';
import { ago } from '../lib/time.js';
import Island from './Island.vue';
import FeedItem from './FeedItem.vue';
import ExtLink from './ExtLink.vue';
import AiButton from './AiButton.vue';
const emit = defineEmits(['open']);
const filters = computed(() => { const c = S.workspace.connectors || []; return c.length > 1 ? [{ id: 'all', label: 'All' }].concat(c.map((x) => ({ id: x.id, label: x.label }))) : []; });
const feedFilter = computed(() => (filters.value.some((f) => f.id === ui.feed) ? ui.feed : 'all'));
const newCount = computed(() => S.feed.filter((r) => isNew(r, S.marks)).length);
const bySource = computed(() => S.feed.filter((r) => feedFilter.value === 'all' || r.source === feedFilter.value));
const rows = computed(() => bySource.value.filter((r) => matchesQuery(r, ui.feedQuery)).slice(0, 200));
const groups = computed(() => groupFeed(rows.value, S.marks));
const rowOf = (id) => (S.turn || []).find((r) => r.key === id);
const isOpen = (g) => ui.openGroups.has(g.id) || Boolean(ui.feedQuery);
const toggleGroup = (g) => { if (ui.openGroups.has(g.id)) ui.openGroups.delete(g.id); else ui.openGroups.add(g.id); };
const markAll = () => setMarks({ seen: S.feed.map((r) => r.id), base: Date.now() });
const kinds = (g) => [...new Set(g.items.map((r) => r.kind))].slice(0, 3).join(' · ');
</script>
<template>
  <Island id="feed" title="What changed" note="Newest first, every source" tip="Newest first: comments, reviews, merges and failed checks on your PRs, and ticket changes. Each item opens where it happened." extra-class="wt-feed">
    <div class="wt-feed-bar">
      <div v-if="filters.length" class="wt-filters" role="group" aria-label="Feed source">
        <span v-for="f in filters" :key="f.id" class="wt-f" role="button" tabindex="0" :aria-pressed="String(feedFilter === f.id)" @click="ui.feed = f.id" @keydown.enter.prevent="ui.feed = f.id">{{ f.label }}</span>
      </div>
      <span class="wt-seg wt-feed-view" role="group" aria-label="Feed view">
        <span class="wt-seg-b" role="button" tabindex="0" :aria-pressed="String(ui.feedView === 'ticket')" @click="setFeedView('ticket')" @keydown.enter.prevent="setFeedView('ticket')">By ticket</span>
        <span class="wt-seg-b" role="button" tabindex="0" :aria-pressed="String(ui.feedView === 'flat')" @click="setFeedView('flat')" @keydown.enter.prevent="setFeedView('flat')">Flat</span>
      </span>
      <span v-if="newCount" class="wt-new-count">{{ newCount }} new</span>
      <span class="wt-mark-read" role="button" tabindex="0" @click="markAll" @keydown.enter.prevent="markAll">Mark all read</span>
    </div>
    <div class="wt-feed-search">
      <input v-model.trim="ui.feedQuery" class="wt-input" type="search" placeholder="Search the feed: key, author, words…" aria-label="Search the feed" autocomplete="off">
      <span class="wt-feed-search-count">{{ ui.feedQuery ? rows.length + ' of ' + bySource.length : '' }}</span>
    </div>
    <ol class="wt-feed-list">
      <template v-if="ui.feedView === 'ticket'">
        <li v-for="g in groups" :key="g.id" class="wt-feed-group" :class="{ 'is-new': g.unread, 'is-open': isOpen(g) }">
          <div class="wt-feed-group-head" @click="toggleGroup(g)">
            <span class="wt-feed-group-caret">›</span>
            <div>
              <div class="wt-feed-group-key">
                <ExtLink :text="g.id" :url="rowOf(g.id) ? rowOf(g.id).ticket_url : g.items[0].url" cls="wt-key" />
                <span v-if="rowOf(g.id)" class="wt-feed-group-sum">{{ rowOf(g.id).summary }}</span>
              </div>
              <div class="wt-feed-group-meta">
                <span class="wt-feed-group-count" :class="{ new: g.unread }">{{ g.unread ? g.unread + ' new' : g.items.length }}</span>
                <span>{{ kinds(g) }}</span>
                <span class="wt-feed-when">{{ ago(g.newest) }}</span>
                <span v-if="rowOf(g.id) && rowOf(g.id).group === 'you'" class="wt-at-you">your move</span>
              </div>
            </div>
            <AiButton class="wt-feed-group-copy" :query="{ ws: S.workspace.id, kind: 'thread', ref: g.id }" />
          </div>
          <ul v-if="isOpen(g)" class="wt-feed-children"><FeedItem v-for="r in g.items" :key="r.id" :item="r" @open="emit('open', $event)" /></ul>
        </li>
      </template>
      <FeedItem v-else v-for="r in rows" :key="r.id" :item="r" @open="emit('open', $event)" />
    </ol>
  </Island>
</template>
