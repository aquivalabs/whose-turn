<script setup lang="ts">
// One feed item: the source badge, the reference, the kind, who, when, and the comment expanded in place with its actions.
import { computed } from 'vue';
import { snapshot, ui, now, setMarks, tellProblem } from '../store.ts';
import { toneOf, hasBody, badgeOf, subjectOf, itemLine } from '../lib/feed.ts';
import type { ConnectorSummary, FeedItem } from '../lib/types.ts';
import { ago } from '../lib/time.ts';
import ExtLink from './ExtLink.vue';
import AiButton from './AiButton.vue';
import { modifier } from '../lib/bem.ts';
const props = defineProps<{
  item: FeedItem;
  source: ConnectorSummary;
  fresh: boolean;
  lit?: boolean;
}>();
const emit = defineEmits<{ open: [item: FeedItem] }>();
const badge = computed(() => badgeOf(props.source));
const subject = computed(() => subjectOf(props.item));
const line = computed(() => itemLine(props.item));
const tone = computed(() => toneOf(props.item.kind));
const iconTone = computed(() => tone.value || (props.source.type === 'github' ? '' : 'jira'));
const written = computed(() => hasBody(props.item));
const open = computed(() => written.value && ui.open.has(props.item.id));
const when = computed(() => {
  void now.value;
  return ago(props.item.at);
});
const seen = () => {
  if (props.fresh) {
    setMarks({ seen: [props.item.id] }).then(tellProblem);
  }
};
const toggle = () => {
  if (ui.open.has(props.item.id)) {
    ui.open.delete(props.item.id);
  } else {
    ui.open.add(props.item.id);
  }
  seen();
};
</script>
<template>
  <li
    class="feed-item"
    :class="{ 'feed-item--new': fresh, 'feed-item--lit': lit, 'feed-item--open': open }"
    @click="seen"
  >
    <span class="feed-item__icon" :class="modifier('feed-item__icon', iconTone)">{{ badge }}</span>
    <div class="feed-item__body">
      <div class="feed-item__top">
        <ExtLink :text="item.ref" :url="item.url" />
        <span class="feed-item__kind" :class="{ 'feed-item__kind--bad': tone === 'bad' }">{{
          item.kind
        }}</span>
        <span v-if="item.who" class="feed-item__who">{{ item.who }}</span>
        <span v-if="item.mention" class="at-you">@you</span>
        <span class="feed-item__right">
          <span class="timestamp feed-item__when">{{ when }}</span>
          <span
            v-if="written"
            class="feed-item__toggle"
            role="button"
            tabindex="0"
            :aria-label="open ? 'Collapse' : 'Expand'"
            :aria-expanded="open"
            @click.stop="toggle"
            @keydown.enter.prevent.stop="toggle"
          ></span>
        </span>
      </div>
      <template v-if="open">
        <span v-if="subject" class="feed-item__text">{{ subject }}</span>
        <div class="feed-item__full">{{ item.body }}</div>
        <div class="feed-item__actions">
          <span
            class="btn btn--tonal"
            role="button"
            tabindex="0"
            @click.stop="emit('open', item)"
            @keydown.enter.prevent.stop="emit('open', item)"
            >Open formatted</span
          >
          <AiButton :query="{ ws: snapshot.workspace.id, kind: 'feed', ref: item.id }" />
          <ExtLink :text="'Open in ' + source.label" :url="item.url" class="btn" />
        </div>
      </template>
      <span v-else-if="line" class="feed-item__text">{{ line }}</span>
    </div>
  </li>
</template>
<style scoped>
.feed-item {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: start;
  gap: 12px;
  padding: 10px 20px;
  cursor: default;
}

.feed-item:hover {
  background: var(--state-hover);
}

.feed-item.feed-item--open {
  background: rgb(var(--md-state), 0.05);
}

.feed-item.feed-item--new {
  background: var(--new-bg);
  box-shadow:
    inset 4px 0 0 var(--new),
    inset 0 0 0 1px var(--new-edge);
}

.feed-item__icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--md-s-highest);
  color: var(--md-on-surface-variant);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.feed-item__icon--jira {
  background: var(--md-primary-container);
  color: var(--md-on-primary-container);
}

.feed-item__icon--bad {
  background: var(--md-error-container);
  color: var(--md-on-error-container);
}

.feed-item__icon--ok {
  background: var(--md-tertiary-container);
  color: var(--md-on-tertiary-container);
}

.feed-item__body {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.feed-item__top {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  font-size: 14px;
}

.feed-item__right {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.feed-item__kind {
  font-weight: 500;
}

.feed-item__kind--bad {
  color: var(--md-error);
}

.feed-item__who {
  color: var(--md-on-surface-variant);
}

.feed-item__text {
  display: -webkit-box;
  overflow: hidden;
  color: var(--md-on-surface-variant);
  font-size: 12px;
  line-height: 16px;
  letter-spacing: 0.03em;
  overflow-wrap: anywhere;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.feed-item__toggle {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  margin-left: 2px;
  border-radius: 50%;
  color: var(--md-on-surface-variant);
  font-size: 0;
  line-height: 1;
  cursor: pointer;
  user-select: none;
  transition: transform 0.15s ease;
}

.feed-item__toggle::before {
  content: '';
  width: 7px;
  height: 7px;
  border-right: 2px solid currentcolor;
  border-bottom: 2px solid currentcolor;
  transform: translateY(-2px) rotate(45deg);
}

.feed-item__toggle:hover {
  background: rgb(var(--md-state), 0.1);
}

.feed-item__toggle[aria-expanded='true'] {
  transform: rotate(180deg);
}

.feed-item__toggle:focus-visible {
  outline: var(--focus-ring);
}

.feed-item__full {
  max-height: 16rem;
  margin-top: 6px;
  padding: 10px 12px;
  overflow: auto;
  border: 1px solid var(--glass-edge);
  border-radius: var(--md-r-chip);
  background: rgb(var(--glass), 0.55);
  color: var(--md-on-surface);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.feed-item__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.feed-item--new .feed-item__kind,
.feed-item--lit .feed-item__kind {
  color: var(--md-on-surface);
  font-weight: 700;
}

.feed-item--new .feed-item__text,
.feed-item--lit .feed-item__text {
  color: var(--md-on-surface);
}

.feed-item--new .feed-item__icon,
.feed-item--lit .feed-item__icon {
  box-shadow: 0 0 0 2px var(--new);
}

.feed-item--new .feed-item__when::before,
.feed-item--lit .feed-item__when::before {
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

.feed-item:not(.feed-item--new) .feed-item__body {
  opacity: 0.78;
}
</style>
