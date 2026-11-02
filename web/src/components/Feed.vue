<script setup>
// What changed: newest first, filtered by source, searched by words, grouped by ticket or flat; unread stays lit until clicked.
import { computed } from 'vue';
import { S, ui, now, setMarks, setFeedView } from '../store.js';
import { isNew, matchesQuery, groupFeed } from '../lib/feed.js';
import { ago } from '../lib/time.js';
import Island from './Island.vue';
import Segmented from './Segmented.vue';
import FeedItem from './FeedItem.vue';
import ExtLink from './ExtLink.vue';
import AiButton from './AiButton.vue';
const emit = defineEmits(['open']);
const VIEWS = [{ id: 'ticket', label: 'By ticket' }, { id: 'flat', label: 'Flat' }];
const connectors = computed(() => S.workspace.connectors || []);
const sources = computed(() => Object.fromEntries(connectors.value.map((c) => [c.id, c])));
const sourceOf = (id) => sources.value[id] || { id, type: id, label: id };
const filters = computed(() => (connectors.value.length > 1 ? [{ id: 'all', label: 'All' }].concat(connectors.value.map((c) => ({ id: c.id, label: c.label }))) : []));
const feedFilter = computed({ get: () => (filters.value.some((f) => f.id === ui.feed) ? ui.feed : 'all'), set: (id) => { ui.feed = id; } });
// marks with seen as a Set, built once per change instead of an array scan per item
const marks = computed(() => ({ base: S.marks.base, seen: new Set(S.marks.seen) }));
const fresh = (item) => isNew(item, marks.value);
const newCount = computed(() => S.feed.filter(fresh).length);
const bySource = computed(() => S.feed.filter((r) => feedFilter.value === 'all' || r.source === feedFilter.value));
const rows = computed(() => bySource.value.filter((r) => matchesQuery(r, ui.feedQuery)).slice(0, 200));
const turnByKey = computed(() => new Map(S.turn.map((r) => [r.key, r])));
const groups = computed(() => { void now.value; return groupFeed(rows.value, marks.value).map((g) => ({ ...g, row: turnByKey.value.get(g.id), when: ago(g.newest), kinds: [...new Set(g.items.map((r) => r.kind))].slice(0, 3).join(' · '), open: ui.openGroups.has(g.id) || Boolean(ui.feedQuery) })); });
const toggleGroup = (g) => { if (ui.openGroups.has(g.id)) ui.openGroups.delete(g.id); else ui.openGroups.add(g.id); };
const markAll = () => setMarks({ seen: S.feed.map((r) => r.id), base: Date.now() });
</script>
<template>
  <Island id="feed" title="What changed" note="Newest first, every source" tip="Newest first: comments, reviews, merges and failed checks on your PRs, and ticket changes. Each item opens where it happened." extra-class="wt-feed">
    <div class="wt-feed-bar">
      <Segmented v-if="filters.length" v-model="feedFilter" :options="filters" label="Feed source" chips />
      <Segmented :model-value="ui.feedView" :options="VIEWS" label="Feed view" class="wt-feed-view" @update:model-value="setFeedView" />
      <span v-if="newCount" class="wt-new-count">{{ newCount }} new</span>
      <span class="wt-mark-read" role="button" tabindex="0" @click="markAll" @keydown.enter.prevent="markAll">Mark all read</span>
    </div>
    <div class="wt-feed-search">
      <input v-model.trim="ui.feedQuery" class="wt-input" type="search" placeholder="Search the feed: key, author, words…" aria-label="Search the feed" autocomplete="off">
      <span class="wt-feed-search-count">{{ ui.feedQuery ? rows.length + ' of ' + bySource.length : '' }}</span>
    </div>
    <ol class="wt-feed-list">
      <template v-if="ui.feedView === 'ticket'">
        <li v-for="g in groups" :key="g.id" class="wt-feed-group" :class="{ 'is-new': g.unread, 'is-open': g.open }">
          <div class="wt-feed-group-head" @click="toggleGroup(g)">
            <span class="wt-feed-group-caret">›</span>
            <div>
              <div class="wt-feed-group-key">
                <ExtLink :text="g.id" :url="g.row ? g.row.ticket_url : g.items[0].url" class="wt-key" />
                <span v-if="g.row" class="wt-feed-group-sum">{{ g.row.summary }}</span>
              </div>
              <div class="wt-feed-group-meta">
                <span class="wt-feed-group-count" :class="{ new: g.unread }">{{ g.unread ? g.unread + ' new' : g.items.length }}</span>
                <span>{{ g.kinds }}</span>
                <span class="wt-feed-when">{{ g.when }}</span>
                <span v-if="g.row && g.row.group === 'you'" class="wt-at-you">your move</span>
              </div>
            </div>
            <AiButton class="wt-feed-group-copy" :query="{ ws: S.workspace.id, kind: 'thread', ref: g.id }" />
          </div>
          <ul v-if="g.open" class="wt-feed-children"><FeedItem v-for="r in g.items" :key="r.id" :item="r" :source="sourceOf(r.source)" :fresh="fresh(r)" @open="emit('open', $event)" /></ul>
        </li>
      </template>
      <FeedItem v-else v-for="r in rows" :key="r.id" :item="r" :source="sourceOf(r.source)" :fresh="fresh(r)" @open="emit('open', $event)" />
    </ol>
  </Island>
</template>
