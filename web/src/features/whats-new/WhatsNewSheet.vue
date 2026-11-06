<script setup lang="ts">
// What's new: CHANGELOG.md by version, newest first, the running version marked and the versions since the last visit flagged; opening it marks them seen.
import { AnimatePresence } from 'motion-v';
import { ref, watch } from 'vue';
import { ui } from '@/store.ts';
import { useWhatsNew } from '@/composables/useWhatsNew.ts';
import { importantOf, versionMarkdown } from '@/lib/whats-new.ts';
import MarkdownView from '@/ui/MarkdownView.vue';
import { useText } from '@/i18n/index.ts';
import Modal from '@/ui/Modal.vue';

const t = useText();
const { changelog, problem, unseen, load, markSeen } = useWhatsNew();
const fresh = ref<string[]>([]);

const close = () => {
  ui.whatsNew = false;
};

watch(
  () => ui.whatsNew,
  async (open) => {
    if (!open) {
      return;
    }
    if (!changelog.value) {
      await load();
    }
    fresh.value = unseen.value.map((entry) => entry.version);
    markSeen();
  },
);
</script>
<template>
  <AnimatePresence>
    <Modal v-if="ui.whatsNew" :title="t('whatsNew.title')" label-id="whats-new-title" flush @close="close">
      <template v-if="changelog" #head>
        <span class="modal__meta">{{ t('whatsNew.running', { version: changelog.current }) }}</span>
      </template>
      <div v-if="problem" class="alert" role="alert">{{ problem }}</div>
      <article v-for="entry in changelog?.versions" :key="entry.version" class="whats-new-sheet__version">
        <header class="whats-new-sheet__head">
          <h4 class="whats-new-sheet__name">
            {{ entry.version }}
          </h4>
          <span v-if="entry.date" class="whats-new-sheet__date">{{ entry.date }}</span>
          <span
            v-if="entry.version === changelog?.current"
            class="whats-new-sheet__tag whats-new-sheet__tag--running"
            >{{ t('whatsNew.runningTag') }}</span
          >
          <span v-if="fresh.includes(entry.version)" class="whats-new-sheet__tag">{{ t('whatsNew.newTag') }}</span>
        </header>
        <div v-if="importantOf(entry).length" class="whats-new-sheet__important" role="note">
          <strong class="whats-new-sheet__important-title">{{ t('whatsNew.important') }}</strong>
          <MarkdownView v-for="item in importantOf(entry)" :key="item" :source="item" />
        </div>
        <MarkdownView v-if="versionMarkdown(entry)" :source="versionMarkdown(entry)" />
        <p v-else class="whats-new-sheet__empty">{{ t('whatsNew.noNotes') }}</p>
      </article>
    </Modal>
  </AnimatePresence>
</template>
<style scoped>
.whats-new-sheet__important {
  margin: 0.5rem 0 0.75rem;
  padding: 0.625rem 0.875rem;
  border-left: 3px solid var(--md-primary);
  border-radius: 0 var(--md-r-chip) var(--md-r-chip) 0;
  background: var(--md-primary-container);
  color: var(--md-on-primary-container);
}

.whats-new-sheet__important-title {
  display: block;
  margin-bottom: 0.25rem;
}

.whats-new-sheet__version {
  padding: 1rem 0 0.25rem;
  border-bottom: 1px solid var(--md-outline-variant);
}

.whats-new-sheet__version:last-child {
  border-bottom: 0;
}

.whats-new-sheet__head {
  display: flex;
  gap: 0.625rem;
  align-items: baseline;
  padding: 0 1.25rem;
}

.whats-new-sheet__name {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.whats-new-sheet__date {
  font-size: 0.75rem;
  color: var(--md-on-surface-variant);
}

.whats-new-sheet__tag {
  padding: 0.0625rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--md-on-primary);
  background: var(--md-primary);
  border-radius: var(--md-r-chip);
}

.whats-new-sheet__tag--running {
  color: var(--md-on-secondary-container);
  background: var(--md-secondary-container);
}

.whats-new-sheet__empty {
  margin: 0.375rem 1.25rem 0.875rem;
  font-size: 0.8125rem;
  color: var(--md-on-surface-variant);
}
</style>
