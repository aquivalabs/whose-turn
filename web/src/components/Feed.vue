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
    class="feed"
    column
  >
    <div class="feed__bar">
      <Segmented
        v-if="filters.length"
        v-model="feedFilter"
        :options="filters"
        label="Feed source"
        chips
      />
      <Segmented v-model="ui.feedView" :options="VIEWS" label="Feed view" class="feed__view" />
      <span v-if="newCount" class="feed__new-count">{{ newCount }} new</span>
      <span
        class="feed__mark-read"
        role="button"
        tabindex="0"
        @click="markAll"
        @keydown.enter.prevent="markAll"
        >Mark all read</span
      >
    </div>
    <p v-if="problem" class="alert alert--inline" role="alert">{{ problem }}</p>
    <div class="feed__search">
      <input
        v-model.trim="ui.feedQuery"
        class="input feed__search-input"
        type="search"
        placeholder="Search the feed: key, author, words…"
        aria-label="Search the feed"
        autocomplete="off"
      />
      <span class="feed__search-count">{{
        ui.feedQuery ? rows.length + ' of ' + bySource.length : ''
      }}</span>
    </div>
    <p v-if="!snapshot.feed.length" class="empty">
      No changes yet. New comments, reviews and status changes show up here.
    </p>
    <ol v-else class="feed__list">
      <template v-if="ui.feedView === 'ticket'">
        <li
          v-for="group in groups"
          :key="group.id"
          class="feed__group"
          :class="{ 'feed__group--new': group.unread, 'feed__group--open': group.open }"
        >
          <div class="feed__group-head" @click="toggleGroup(group)">
            <span class="feed__group-caret">›</span>
            <div>
              <div class="feed__group-key">
                <ExtLink
                  :text="group.id"
                  :url="group.row ? group.row.ticket_url : group.items[0].url"
                  class="ticket-key feed__group-ticket"
                />
                <span v-if="group.row || group.title" class="feed__group-sum">{{
                  group.row ? group.row.summary : group.title
                }}</span>
              </div>
              <div class="feed__group-meta">
                <span
                  class="feed__group-count"
                  :class="{ 'feed__group-count--new': group.unread }"
                  >{{ group.unread ? group.unread + ' new' : group.items.length }}</span
                >
                <span>{{ group.kinds }}</span>
                <span class="timestamp">{{ group.when }}</span>
                <span
                  v-if="group.chip"
                  :class="group.chip === 'handled' ? 'handled-chip' : 'at-you'"
                  >{{ group.chip }}</span
                >
              </div>
            </div>
            <AiButton
              class="feed__group-copy"
              :query="{ ws: snapshot.workspace.id, kind: 'thread', ref: group.id }"
            />
          </div>
          <ul v-if="group.open" class="feed__children">
            <FeedItemRow
              v-for="item in group.items"
              :key="item.id"
              :item="item"
              :source="sourceOf(item.source)"
              :fresh="fresh(item)"
              :lit="Boolean(group.unread)"
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
<style scoped>
.feed__bar {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
}

.feed__view {
  margin-left: 10px;
}

.feed__new-count {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 9px;
  border-radius: 999px;
  background: var(--new);
  color: var(--new-ink);
  box-shadow: 0 0 12px var(--new-glow);
  font-size: 12px;
  font-weight: 800;
}

.feed__mark-read {
  margin-left: auto;
  padding: 4px 8px;
  border-radius: 999px;
  color: var(--md-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  user-select: none;
}

.feed__mark-read:hover {
  background: var(--state-hover);
}

.feed__mark-read:focus-visible {
  outline: var(--focus-ring);
}

.feed__search {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
}

.feed__search-input {
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 0 10px;
  font-size: 13px;
}

.feed__search-count {
  flex: none;
  color: var(--md-on-surface-variant);
  font-size: 12px;
}

.feed__list {
  flex: 1 1 auto;
  min-height: 12rem;
  margin: 0 -20px;
  padding: 0 0 4px;
  overflow-y: auto;
  list-style: none;
}

.feed__group {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 0;
  padding: 0;
  cursor: default;
}

.feed__group:hover {
  background: var(--state-hover);
}

.feed__group.feed__group--open {
  background: rgb(var(--md-state), 0.05);
}

.feed__group.feed__group--new {
  background: var(--new-bg);
  box-shadow:
    inset 4px 0 0 var(--new),
    inset 0 0 0 1px var(--new-edge);
}

.feed__group-head {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  cursor: pointer;
}

.feed__group-copy {
  opacity: 0.55;
}

.feed__group-head:hover .feed__group-copy {
  opacity: 1;
}

.feed__group-head:hover {
  background: var(--state-hover);
}

.feed__group--new > .feed__group-head {
  background: var(--new-bg);
  box-shadow: inset 4px 0 0 var(--new);
}

.feed__group-key {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  font-size: 14px;
}

.feed__group-ticket {
  font-weight: 600;
}

.feed__group-sum {
  overflow: hidden;
  color: var(--md-on-surface-variant);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feed__group-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
  color: var(--md-on-surface-variant);
  font-size: 12px;
}

.feed__group-count {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--md-s-highest);
  color: var(--md-on-surface-variant);
  font-size: 11px;
  font-weight: 700;
}

.feed__group-count--new {
  background: var(--new);
  color: var(--new-ink);
}

.feed__children {
  margin: 0 0 0 35px;
  padding: 0 0 4px;
  border-left: 2px solid var(--md-outline-variant);
  list-style: none;
}

.feed__children .feed-item {
  padding-left: 14px;
}

.feed__group-caret {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--md-s-highest);
  color: var(--md-on-surface-variant);
  font-size: 14px;
  transition: transform 0.15s ease;
}

.feed__group--open .feed__group-caret {
  transform: rotate(90deg);
}

.feed__group--new .feed__group-meta .timestamp::before {
  content: 'NEW';
  display: inline-block;
  margin-right: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--new);
  color: var(--new-ink);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  vertical-align: 1px;
}

@media (width >= 901px) {
  .dashboard--fit .feed__list::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .dashboard--fit .feed__list::-webkit-scrollbar-thumb {
    border-radius: 4px;
    background: var(--md-outline-variant);
  }
}

@media (width <= 900px) {
  .feed__list {
    max-height: 28rem;
  }
}
</style>
