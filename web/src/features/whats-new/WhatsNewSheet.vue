<script setup lang="ts">
// What's new: CHANGELOG.md by version, newest first, the running version marked and the versions since the last visit flagged; opening it marks them seen.
import { AnimatePresence } from 'motion-v';
import { ref, watch } from 'vue';
import { ui } from '@/store.ts';
import { useWhatsNew } from '@/composables/useWhatsNew.ts';
import { versionMarkdown } from '@/lib/whats-new.ts';
import MarkdownView from '@/ui/MarkdownView.vue';
import Modal from '@/ui/Modal.vue';

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
    <Modal v-if="ui.whatsNew" title="What's new" label-id="whats-new-title" flush @close="close">
      <template v-if="changelog" #head>
        <span class="modal__meta">Running {{ changelog.current }}</span>
      </template>
      <div v-if="problem" class="alert" role="alert">{{ problem }}</div>
      <article v-for="entry in changelog?.versions" :key="entry.version" class="whats-new__version">
        <header class="whats-new__head">
          <h4 class="whats-new__name">
            {{ entry.version }}
          </h4>
          <span v-if="entry.date" class="whats-new__date">{{ entry.date }}</span>
          <span
            v-if="entry.version === changelog?.current"
            class="whats-new__tag whats-new__tag--running"
            >Running</span
          >
          <span v-if="fresh.includes(entry.version)" class="whats-new__tag">New</span>
        </header>
        <MarkdownView v-if="entry.sections.length" :source="versionMarkdown(entry)" />
        <p v-else class="whats-new__empty">No notes for this version.</p>
      </article>
    </Modal>
  </AnimatePresence>
</template>
<style scoped>
.whats-new__version {
  padding: 16px 0 4px;
  border-bottom: 1px solid var(--md-outline-variant);
}

.whats-new__version:last-child {
  border-bottom: 0;
}

.whats-new__head {
  display: flex;
  gap: 10px;
  align-items: baseline;
  padding: 0 20px;
}

.whats-new__name {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.whats-new__date {
  font-size: 12px;
  color: var(--md-on-surface-variant);
}

.whats-new__tag {
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--md-on-primary);
  background: var(--md-primary);
  border-radius: var(--md-r-chip);
}

.whats-new__tag--running {
  color: var(--md-on-secondary-container);
  background: var(--md-secondary-container);
}

.whats-new__empty {
  margin: 6px 20px 14px;
  font-size: 13px;
  color: var(--md-on-surface-variant);
}
</style>
