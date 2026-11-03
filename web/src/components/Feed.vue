<script setup lang="ts">
// What changed: newest first, filtered by source, searched by words, grouped by ticket or flat; unread stays lit until clicked.
import { computed, ref } from 'vue';
import { snapshot, ui, now, setMarks } from '../store.ts';
import { isNew, matchesQuery, groupFeed, moveChip } from '../lib/feed.ts';
import type { FeedGroup } from '../lib/feed.ts';
import type { ConnectorSummary, FeedItem, TurnRow } from '../lib/types.ts';
import { ago } from '../lib/time.ts';
import Island from './Island.vue';
import Segmented from './Segmented.vue';
import FeedItemRow from './FeedItem.vue';
import ExtLink from './ExtLink.vue';
import AiButton from './AiButton.vue';
const emit = defineEmits<{ open: [item: FeedItem] }>();
const VIEWS = [
  { id: 'ticket', label: 'By ticket' },
  { id: 'flat', label: 'Flat' },
];
const connectors = computed(() => snapshot.workspace.connectors || []);
const sources = computed(() =>
  Object.fromEntries(connectors.value.map((connector) => [connector.id, connector])),
);
const sourceOf = (id: string): ConnectorSummary => sources.value[id] || { id, type: id, label: id };
const filters = computed(() =>
  connectors.value.length > 1
    ? [{ id: 'all', label: 'All' }].concat(
        connectors.value.map((connector) => ({ id: connector.id, label: connector.label })),
      )
    : [],
);
const feedFilter = computed({
  get: () => (filters.value.some((filter) => filter.id === ui.feed) ? ui.feed : 'all'),
  set: (id: string) => {
    ui.feed = id;
  },
});
// marks with seen as a Set, built once per change instead of an array scan per item
const marks = computed(() => ({ base: snapshot.marks.base, seen: new Set(snapshot.marks.seen) }));
const fresh = (item: FeedItem) => isNew(item, marks.value);
const newCount = computed(() => snapshot.feed.filter(fresh).length);
const bySource = computed(() =>
  snapshot.feed.filter((item) => feedFilter.value === 'all' || item.source === feedFilter.value),
);
const rows = computed(() =>
  bySource.value.filter((item) => matchesQuery(item, ui.feedQuery)).slice(0, 200),
);
const turnByKey = computed(() => new Map(snapshot.turn.map((row) => [row.key, row])));
const rowsByKey = computed(() => {
  const byKey = new Map<string, TurnRow[]>();
  for (const row of snapshot.turn) {
    byKey.set(row.key, [...(byKey.get(row.key) || []), row]);
  }
  return byKey;
});
const groups = computed(() => {
  void now.value;
  return groupFeed(rows.value, marks.value).map((group) => ({
    ...group,
    row: turnByKey.value.get(group.id),
    chip: moveChip(rowsByKey.value.get(group.id) || []),
    when: ago(group.newest),
    kinds: [...new Set(group.items.map((item) => item.kind))].slice(0, 3).join(' · '),
    open: ui.openGroups.has(group.id) || Boolean(ui.feedQuery),
  }));
});
const toggleGroup = (group: FeedGroup) => {
  if (ui.openGroups.has(group.id)) {
    ui.openGroups.delete(group.id);
  } else {
    ui.openGroups.add(group.id);
  }
};
const problem = ref('');
const markAll = async () => {
  problem.value = await setMarks({ seen: snapshot.feed.map((item) => item.id), base: Date.now() });
};
</script>
<template>
  <Island
    id="feed"
    title="What changed"
    note="Newest first, every source"
    tip="Newest first: comments, reviews, merges and failed checks on your PRs, and ticket changes. Each item opens where it happened."
    extra-class="wt-feed"
  >
    <div class="wt-feed-bar">
      <Segmented
        v-if="filters.length"
        v-model="feedFilter"
        :options="filters"
        label="Feed source"
        chips
      />
      <Segmented v-model="ui.feedView" :options="VIEWS" label="Feed view" class="wt-feed-view" />
      <span v-if="newCount" class="wt-new-count">{{ newCount }} new</span>
      <span
        class="wt-mark-read"
        role="button"
        tabindex="0"
        @click="markAll"
        @keydown.enter.prevent="markAll"
        >Mark all read</span
      >
    </div>
    <p v-if="problem" class="wt-alert wt-todo-problem" role="alert">{{ problem }}</p>
    <div class="wt-feed-search">
      <input
        v-model.trim="ui.feedQuery"
        class="wt-input"
        type="search"
        placeholder="Search the feed: key, author, words…"
        aria-label="Search the feed"
        autocomplete="off"
      />
      <span class="wt-feed-search-count">{{
        ui.feedQuery ? rows.length + ' of ' + bySource.length : ''
      }}</span>
    </div>
    <p v-if="!snapshot.feed.length" class="wt-empty">
      No changes yet. New comments, reviews and status changes show up here.
    </p>
    <ol v-else class="wt-feed-list">
      <template v-if="ui.feedView === 'ticket'">
        <li
          v-for="group in groups"
          :key="group.id"
          class="wt-feed-group"
          :class="{ 'is-new': group.unread, 'is-open': group.open }"
        >
          <div class="wt-feed-group-head" @click="toggleGroup(group)">
            <span class="wt-feed-group-caret">›</span>
            <div>
              <div class="wt-feed-group-key">
                <ExtLink
                  :text="group.id"
                  :url="group.row ? group.row.ticket_url : group.items[0].url"
                  class="wt-key"
                />
                <span v-if="group.row" class="wt-feed-group-sum">{{ group.row.summary }}</span>
              </div>
              <div class="wt-feed-group-meta">
                <span class="wt-feed-group-count" :class="{ new: group.unread }">{{
                  group.unread ? group.unread + ' new' : group.items.length
                }}</span>
                <span>{{ group.kinds }}</span>
                <span class="wt-feed-when">{{ group.when }}</span>
                <span
                  v-if="group.chip"
                  :class="group.chip === 'handled' ? 'wt-handled-chip' : 'wt-at-you'"
                  >{{ group.chip }}</span
                >
              </div>
            </div>
            <AiButton
              class="wt-feed-group-copy"
              :query="{ ws: snapshot.workspace.id, kind: 'thread', ref: group.id }"
            />
          </div>
          <ul v-if="group.open" class="wt-feed-children">
            <FeedItemRow
              v-for="item in group.items"
              :key="item.id"
              :item="item"
              :source="sourceOf(item.source)"
              :fresh="fresh(item)"
              @open="emit('open', $event)"
            />
          </ul>
        </li>
      </template>
      <template v-else>
        <FeedItemRow
          v-for="item in rows"
          :key="item.id"
          :item="item"
          :source="sourceOf(item.source)"
          :fresh="fresh(item)"
          @open="emit('open', $event)"
        />
      </template>
    </ol>
  </Island>
</template>
