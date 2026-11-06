<script setup lang="ts">
// What changed: newest first, filtered by source, searched by words, grouped by ticket or flat; unread stays lit until clicked.
import { computed, nextTick, ref, watch } from 'vue';
import { watchDebounced } from '@vueuse/core';
import { snapshot, ui, now, setMarks, tellProblem } from '@/store.ts';
import { isNew, matchesQuery, groupFeed, kindsLabel, moveKeys } from '@/lib/feed.ts';
import type { FeedGroup } from '@/lib/feed.ts';
import type { ConnectorSummary, FeedItem } from '@/lib/types.ts';
import { ago } from '@/lib/time.ts';
import { AnimatePresence, M as Motion } from 'motion-v';
import { fade, fold } from '@/motion.ts';
import { useClearOnReconnect } from '@/composables/useClearOnReconnect.ts';
import Island from '@/ui/Island.vue';
import Segmented from '@/ui/Segmented.vue';
import FeedItemRow from './FeedItem.vue';
import ExtLink from '@/ui/ExtLink.vue';
import AiButton from '@/ui/AiButton.vue';
import Chevron from '@/ui/Chevron.vue';
import { useFeedState } from './useFeedState.ts';
const emit = defineEmits<{ open: [item: FeedItem] }>();
const feedState = useFeedState();
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
  get: () =>
    filters.value.some((filter) => filter.id === feedState.source) ? feedState.source : 'all',
  set: (id: string) => {
    feedState.source = id;
  },
});
const SEARCH_DEBOUNCE_MS = 150;
// The box shows every keystroke; the list filters 150 ms after the last one.
const typed = ref(feedState.query);
watch(() => feedState.query, (query) => (typed.value = query));
watchDebounced(typed, (text) => (feedState.query = text), { debounce: SEARCH_DEBOUNCE_MS });
watch(
  () => snapshot.workspace.id,
  () => {
    feedState.query = '';
  },
);
const FOCUS_MS = 2500;
const flashed = ref('');
watch(
  () => ui.focusFeed,
  async (id) => {
    const item = snapshot.feed.find((candidate) => candidate.id === id);
    ui.focusFeed = '';
    if (!item) {
      return;
    }
    feedState.source = 'all';
    feedState.query = '';
    feedState.openGroups.add(item.key || item.ref || item.id);
    flashed.value = id;
    await nextTick();
    document.getElementById(`feed-${id}`)?.scrollIntoView({ block: 'center' });
    setTimeout(() => {
      flashed.value = '';
    }, FOCUS_MS);
  },
);
const marks = computed(() => ({ base: snapshot.marks.base, seen: new Set(snapshot.marks.seen) }));
const fresh = (item: FeedItem) => isNew(item, marks.value);
const newCount = computed(() => snapshot.feed.filter(fresh).length);
const bySource = computed(() =>
  snapshot.feed.filter((item) => feedFilter.value === 'all' || item.source === feedFilter.value),
);
const rows = computed(() =>
  bySource.value.filter((item) => matchesQuery(item, feedState.query)).slice(0, 200),
);
const turnByKey = computed(() => new Map(snapshot.turn.map((row) => [row.key, row])));
const onYou = computed(() => moveKeys(snapshot.turn));
const groups = computed(() => {
  void now.value;
  return groupFeed(rows.value, marks.value).map((group) => ({
    ...group,
    row: turnByKey.value.get(group.id),
    move: onYou.value.has(group.id),
    when: ago(group.newest),
    kinds: kindsLabel(group.items),
    open: feedState.openGroups.has(group.id) || Boolean(feedState.query),
  }));
});
const toggleMember = (members: Set<string>, id: string) => {
  if (members.has(id)) {
    members.delete(id);
  } else {
    members.add(id);
  }
};
const toggleGroup = (group: FeedGroup) => toggleMember(feedState.openGroups, group.id);
const toggleItem = (id: string) => toggleMember(ui.open, id);
const markSeen = (id: string) => setMarks({ seen: [id] }).then(tellProblem);
const problem = ref('');
useClearOnReconnect(() => {
  problem.value = '';
});
const cleared = ref<{ base: number; added: string[] } | null>(null);
const markAll = async () => {
  const already = new Set(snapshot.marks.seen);
  const before = { base: snapshot.marks.base, added: snapshot.feed.map((item) => item.id).filter((id) => !already.has(id)) };
  problem.value = await setMarks({ all: true });
  cleared.value = problem.value ? null : before;
};
const restoreMarks = async () => {
  const before = cleared.value;
  cleared.value = null;
  if (before) {
    problem.value = await setMarks({ unseen: before.added, base: before.base });
  }
};
</script>
<template>
  <Island
    id="feed"
    :size-key="`${snapshot.workspace.id}:feed`"
    title="What changed"
    note="Newest first, every source"
    tip="Newest first: comments, reviews, merges and failed checks on your PRs, and ticket changes. Each item opens where it happened."
    class="feed"
    column
    resize="width"
  >
    <template #head
      ><AnimatePresence
        ><Motion v-if="newCount" v-bind="fade" as="span" class="feed__new-count">{{ newCount }} new</Motion></AnimatePresence
      ></template
    >
    <div class="feed__bar">
      <Segmented
        v-if="filters.length"
        v-model="feedFilter"
        :options="filters"
        label="Feed source"
      />
      <Segmented v-model="feedState.view" :options="VIEWS" label="Feed view" />
    </div>
    <AnimatePresence>
      <Motion v-if="problem" v-bind="fade" as="p" class="alert alert--inline" role="alert">{{
        problem
      }}</Motion>
    </AnimatePresence>
    <AnimatePresence>
      <Motion v-if="cleared" v-bind="fade" as="p" class="feed__undo" role="status">
        Marked all read.
        <button type="button" class="feed__undo-btn" @click="restoreMarks">Undo</button>
      </Motion>
    </AnimatePresence>
    <div class="feed__search">
      <input
        v-model.trim="typed"
        class="input feed__search-input"
        type="search"
        placeholder="Search the feed: key, author, words…"
        aria-label="Search the feed"
        autocomplete="off"
      />
      <span class="feed__search-count">{{
        feedState.query ? rows.length + ' of ' + bySource.length : ''
      }}</span>
      <button type="button" class="feed__mark-read" @click="markAll">Mark all read</button>
    </div>
    <p v-if="!snapshot.feed.length" class="empty">
      No changes yet. New comments, reviews and status changes show up here.
    </p>
    <ol v-else class="feed__list">
      <template v-if="feedState.view === 'ticket'">
        <AnimatePresence :initial="false">
        <Motion
          v-for="group in groups"
          :key="group.id"
          v-bind="fade"
          as="li"
          class="feed__group"
          :class="{
            'feed__group--new': group.unread,
            'feed__group--open': group.open,
            'feed__group--move': group.move,
          }"
        >
          <div
            class="feed__group-head"
            :title="group.move ? 'Your move on this ticket' : undefined"
            @click="toggleGroup(group)"
          >
            <Chevron :open="group.open" :aria-label="'Fold ' + group.id" />
            <div class="feed__group-text">
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
                  >{{ group.unread ? group.unread + ' new' : group.items.length + (group.items.length === 1 ? ' event' : ' events') }}</span
                >
                <span class="feed__group-kinds">{{ group.kinds }}</span>
                <span class="timestamp feed__group-when">{{ group.when }}</span>
              </div>
            </div>
            <AiButton
              class="feed__group-copy"
              :query="{ ws: snapshot.workspace.id, kind: 'thread', ref: group.id }"
            />
          </div>
          <AnimatePresence :initial="false">
          <Motion v-if="group.open" v-bind="fold" as="ul" class="feed__children">
            <AnimatePresence :initial="false">
            <FeedItemRow
              v-for="item in group.items"
              :key="item.id"
              :item="item"
              :source="sourceOf(item.source)"
              :fresh="fresh(item)"
              :flash="flashed === item.id"
              :expanded="ui.open.has(item.id)"
              @open="emit('open', $event)"
              @toggle="toggleItem"
              @seen="markSeen"
            />
            </AnimatePresence>
          </Motion>
          </AnimatePresence>
        </Motion>
        </AnimatePresence>
      </template>
      <template v-else>
        <AnimatePresence :initial="false">
        <FeedItemRow
          v-for="item in rows"
          :key="item.id"
          :item="item"
          :source="sourceOf(item.source)"
          :fresh="fresh(item)"
          :flash="flashed === item.id"
          :expanded="ui.open.has(item.id)"
          @open="emit('open', $event)"
          @toggle="toggleItem"
          @seen="markSeen"
        />
        </AnimatePresence>
      </template>
    </ol>
  </Island>
</template>
<style scoped>
@media (width <= 1500px) {
  .feed :deep(.island__note-text) {
    display: none;
  }
}

.feed__undo {
  margin: 0 0 0.25rem;
  color: var(--md-on-surface-variant);
  font-size: 0.8125rem;
}

.feed__undo-btn {
  color: var(--md-primary);
  font-weight: 500;
  cursor: pointer;
}

.feed__bar {
  display: flex;
  flex: none;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 0 0 0.5rem;
}

.feed__new-count {
  display: inline-flex;
  align-items: center;
  height: 1.375rem;
  padding: 0 0.5625rem;
  border-radius: 62.4375rem;
  background: var(--new);
  color: var(--new-ink);
  box-shadow: 0 0 12px var(--new-glow);
  font-size: 0.75rem;
  font-weight: 800;
}

.feed.island--strip .feed__new-count {
  justify-content: center;
  width: 1.25rem;
  height: auto;
  padding: 0.4375rem 0;
  font-size: 0.6875rem;
  line-height: 1;
  letter-spacing: -0.2em;
  word-spacing: -0.5em;
  writing-mode: vertical-rl;
  text-orientation: upright;
}

.feed__mark-read {
  flex: none;
  padding: 0.25rem 0.5rem;
  border-radius: 62.4375rem;
  color: var(--md-primary);
  font-size: 0.8125rem;
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
  gap: 0.5rem;
  margin: 0 0 0.5rem;
}

.feed__search-input {
  flex: 1;
  min-width: 0;
  height: 1.875rem;
  padding: 0 0.625rem;
  font-size: 0.8125rem;
}

.feed__search-count {
  flex: none;
  color: var(--md-on-surface-variant);
  font-size: 0.75rem;
}

.feed__list {
  flex: 1 1 auto;
  min-height: 12rem;
  margin: 0 -1.25rem;
  padding: 0 0 0.25rem;
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
  grid-template-columns: 1.5rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 1.25rem;
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

.feed__group--move,
.feed__group--move > .feed__group-head {
  box-shadow: inset 4px 0 0 var(--move);
}

.feed__group.feed__group--new.feed__group--move {
  box-shadow:
    inset 4px 0 0 var(--move),
    inset 0 0 0 1px var(--new-edge);
}

.feed__group-text {
  min-width: 0;
}

.feed__group-key {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.feed__group-ticket {
  flex: none;
  font-weight: 600;
}

.feed__group-sum {
  overflow: hidden;
  color: var(--md-on-surface-variant);
  font-size: 0.8125rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feed__group-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.125rem;
  color: var(--md-on-surface-variant);
  font-size: 0.75rem;
}

.feed__group-kinds {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feed__group-when {
  margin-left: auto;
}

.feed__group-count {
  flex: none;
  display: inline-flex;
  align-items: center;
  height: 1.125rem;
  padding: 0 0.4375rem;
  border-radius: 62.4375rem;
  background: var(--md-s-highest);
  color: var(--md-on-surface-variant);
  font-size: 0.6875rem;
  font-weight: 700;
}

.feed__group-count--new {
  background: var(--new);
  color: var(--new-ink);
}

.feed__children {
  margin: 0 0 0 1.9375rem;
  padding: 0 0 0.25rem;
  border-left: 2px solid var(--md-outline-variant);
  list-style: none;
}

.feed__children .feed-item {
  padding-left: 0.875rem;
}

@media (width >= 901px) {
  .dashboard--fit .feed__list::-webkit-scrollbar {
    width: 0.5rem;
    height: 0.5rem;
  }

  .dashboard--fit .feed__list::-webkit-scrollbar-thumb {
    border-radius: 0.25rem;
    background: var(--md-outline-variant);
  }
}

@media (width <= 900px) {
  .feed__list {
    max-height: 28rem;
  }
}
</style>
