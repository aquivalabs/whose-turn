<script setup lang="ts">
// Help: the keyboard shortcuts and a link to the README; opened from the rail or with "?". RMA-447.
import { AnimatePresence } from 'motion-v';
import { ui } from '@/store.ts';
import { useText } from '@/i18n/index.ts';
import Modal from '@/ui/Modal.vue';
import { isMac } from '@/lib/browser.ts';

const t = useText();
const README = 'https://github.com/aquivalabs/whose-turn#readme';
const rows = [
  { keys: ['/'], label: 'help.search' },
  { keys: ['t'], label: 'help.todo' },
  { keys: ['?'], label: 'help.help' },
  { keys: [isMac(navigator) ? '⌥ Option' : 'Alt', '↑', '↓'], label: 'help.moveWorkspace' },
  { keys: ['Esc'], label: 'help.close' },
] as const;
</script>
<template>
  <AnimatePresence>
    <Modal v-if="ui.help" :title="t('help.title')" label-id="help-title" @close="ui.help = false">
      <h4 class="help-sheet__heading">{{ t('help.shortcuts') }}</h4>
      <dl class="help-sheet__list">
        <div v-for="row in rows" :key="row.label" class="help-sheet__row">
          <dt class="help-sheet__keys">
            <kbd v-for="key in row.keys" :key="key" class="help-sheet__key">{{ key }}</kbd>
          </dt>
          <dd class="help-sheet__label">{{ t(row.label) }}</dd>
        </div>
      </dl>
      <a class="help-sheet__link" :href="README" target="_blank" rel="noopener noreferrer">{{ t('help.readme') }}</a>
    </Modal>
  </AnimatePresence>
</template>
<style scoped>
.help-sheet__heading {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
}

.help-sheet__list {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.5rem 1rem;
  align-items: center;
  margin: 0;
}

.help-sheet__row {
  display: contents;
}

.help-sheet__keys {
  display: flex;
  gap: 0.25rem;
}

.help-sheet__key {
  min-width: 1.5rem;
  padding: 0.125rem 0.375rem;
  border: 1px solid var(--glass-edge);
  border-radius: 0.375rem;
  background: var(--state-hover);
  font-family: var(--md-font);
  font-size: 0.8125rem;
  text-align: center;
}

.help-sheet__label {
  margin: 0;
  font-size: 0.875rem;
}

.help-sheet__link {
  color: var(--md-primary);
  font-size: 0.875rem;
}
</style>
