<script setup lang="ts">
// One feed item: the source badge, the reference, the kind, who, when, and the comment expanded in place with its actions. Expanding and reading are events; the feed applies them.
import { computed } from 'vue';
import { M as Motion } from 'motion-v';
import { fade } from '@/motion.ts';
import { snapshot, now } from '@/store.ts';
import { toneOf, hasBody, badgeOf, subjectOf, itemLine } from '@/lib/feed.ts';
import type { ConnectorSummary, FeedItem } from '@/lib/types.ts';
import { ago } from '@/lib/time.ts';
import ExtLink from '@/ui/ExtLink.vue';
import AiButton from '@/ui/AiButton.vue';
import Chevron from '@/ui/Chevron.vue';
import { modifier } from '@/lib/bem.ts';
import { useText } from '@/i18n/index.ts';
const props = defineProps<{
  item: FeedItem;
  source: ConnectorSummary;
  fresh: boolean;
  flash?: boolean;
  expanded: boolean;
}>();
const emit = defineEmits<{ open: [item: FeedItem]; toggle: [id: string]; seen: [id: string] }>();
const t = useText();
const badge = computed(() => badgeOf(props.source));
const subject = computed(() => subjectOf(props.item));
const line = computed(() => itemLine(props.item));
const tone = computed(() => toneOf(props.item.kind));
const iconTone = computed(() => tone.value || (props.source.tone ?? 'jira'));
const written = computed(() => hasBody(props.item));
const open = computed(() => written.value && props.expanded);
const when = computed(() => {
  void now.value;
  return ago(props.item.at);
});
const seen = () => {
  if (props.fresh) {
    emit('seen', props.item.id);
  }
};
const toggle = () => {
  emit('toggle', props.item.id);
  seen();
};
</script>
<template>
  <Motion
    v-bind="fade"
    :id="'feed-' + item.id"
    as="li"
    class="feed-item"
    :class="{ 'feed-item--new': fresh, 'feed-item--open': open, 'feed-item--flash': flash }"
    @click="seen"
  >
    <span class="feed-item__icon" :class="modifier('feed-item__icon', iconTone)">{{ badge }}</span>
    <div class="feed-item__body">
      <div class="feed-item__top">
        <Chevron
          v-if="written"
          :open="open"
          :aria-label="open ? t('feed.item.collapse') : t('feed.item.expand')"
          @click.stop="toggle"
        />
        <ExtLink :text="item.ref" :url="item.url" />
        <span class="feed-item__kind" :class="{ 'feed-item__kind--bad': tone === 'bad' }">{{
          item.kind
        }}</span>
        <span v-if="item.who" class="feed-item__who">{{ item.who }}</span>
        <span v-if="item.mention" class="at-you">{{ t('feed.item.you') }}</span>
        <span class="feed-item__right">
          <span class="timestamp feed-item__when" :data-new="t('feed.item.new')">{{ when }}</span>
        </span>
      </div>
      <template v-if="open">
        <span v-if="subject" class="feed-item__text">{{ subject }}</span>
        <div class="feed-item__full">{{ item.body }}</div>
        <div class="feed-item__actions">
          <button type="button" class="btn btn--tonal" @click.stop="emit('open', item)">
            {{ t('feed.item.openFormatted') }}
          </button>
          <AiButton :query="{ ws: snapshot.workspace.id, kind: 'feed', ref: item.id }" />
          <ExtLink :text="t('feed.item.openIn', { source: source.label })" :url="item.url" class="btn" />
        </div>
      </template>
      <span v-else-if="line" class="feed-item__text">{{ line }}</span>
    </div>
  </Motion>
</template>
<style scoped>
.feed-item {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr);
  align-items: start;
  gap: 0.75rem;
  padding: 0.625rem 1.25rem;
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

.feed-item.feed-item--flash {
  box-shadow: inset 0 0 0 2px var(--md-primary);
}

.feed-item__icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--md-s-highest);
  color: var(--md-on-surface-variant);
  font-size: 0.6875rem;
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
  gap: 0.125rem;
  min-width: 0;
}

.feed-item__top {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.375rem;
  font-size: 0.875rem;
}

.feed-item__right {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
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
  font-size: 0.75rem;
  line-height: 1rem;
  letter-spacing: 0.03em;
  overflow-wrap: anywhere;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.feed-item__full {
  max-height: 16rem;
  margin-top: 0.375rem;
  padding: 0.625rem 0.75rem;
  overflow: auto;
  border: 1px solid var(--glass-edge);
  border-radius: var(--md-r-chip);
  background: rgb(var(--glass), 0.55);
  color: var(--md-on-surface);
  font-size: 0.8125rem;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.feed-item__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.feed-item--new .feed-item__kind {
  color: var(--md-on-surface);
  font-weight: 700;
}

.feed-item--new .feed-item__text {
  color: var(--md-on-surface);
}

.feed-item--new .feed-item__icon {
  box-shadow: 0 0 0 2px var(--new);
}

.feed-item--new .feed-item__when::before {
  content: attr(data-new);
  display: inline-block;
  margin-right: 0.375rem;
  padding: 0.0625rem 0.375rem;
  border-radius: 0.25rem;
  background: var(--new);
  color: var(--new-ink);
  font-size: 0.625rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  vertical-align: 0.0625rem;
}

.feed-item:not(.feed-item--new) .feed-item__body {
  opacity: 0.78;
}
</style>
