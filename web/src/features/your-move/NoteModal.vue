<script setup lang="ts">
// What a handled row carries: the outcome of a pass-on and the note, edited after the mark. docs/mechanisms/your-move.md § The note window
import { AnimatePresence } from 'motion-v';
import { computed, nextTick, ref, watch } from 'vue';
import { snapshot, ui, setMarks, showInFeed, closeTopLayer } from '@/store.ts';
import { when } from '@/lib/time.ts';
import Modal from '@/ui/Modal.vue';
import { useText } from '@/i18n/index.ts';
const t = useText();
const row = computed(() => snapshot.turn.find((item) => item.row_id === ui.note));
const info = computed(() => snapshot.marks.info[ui.note]);
const kept = computed(() => info.value?.note || '');
const text = ref('');
const problem = ref('');
const field = ref<HTMLTextAreaElement | null>(null);
const typed = () => text.value.replace(/\s+/g, ' ').trim();
watch(
  () => ui.note,
  async (id) => {
    ui.noteAsk = false;
    if (!id) {
      return;
    }
    text.value = kept.value;
    problem.value = '';
    await nextTick();
    field.value?.focus();
  },
  { immediate: true, flush: 'post' },
);
watch(
  () => Boolean(ui.note) && typed() !== kept.value,
  (dirty) => {
    ui.noteDirty = dirty;
  },
  { immediate: true },
);
const close = () => {
  ui.note = '';
};
const save = async () => {
  const note = typed();
  if (note === kept.value) {
    close();
    return;
  }
  problem.value = await setMarks({ notes: { [ui.note]: note } });
  if (!problem.value) {
    close();
  }
};
const openInFeed = () => {
  const event = info.value?.event || '';
  close();
  showInFeed(event);
};
const detail = computed(() => info.value?.detail);
const comment = computed(() => {
  const ref = detail.value?.comment;
  if (typeof ref !== 'string') {
    return ref;
  }
  const item = snapshot.feed.find((entry) => entry.id === ref);
  return item && { author: item.who || '', text: item.body || item.text || '' };
});
const happened = computed(() => detail.value?.what || info.value?.outcome || '');
</script>
<template>
  <AnimatePresence>
    <Modal
      v-if="ui.note && row"
      :title="
        info?.auto
          ? t('yourMove.note.titlePassedOn', { key: row.key })
          : t('yourMove.note.titleHandled', { key: row.key })
      "
      label-id="note-title"
      @close="closeTopLayer"
    >
      <template v-if="info?.auto" #head>
        <button v-if="info.event" type="button" class="btn" @click="openInFeed">
          {{ t('yourMove.note.openInFeed') }}
        </button>
      </template>
      <p class="note-modal__summary">{{ row.summary }}</p>
      <dl v-if="info?.auto" class="note-modal__facts">
        <dt>{{ t('yourMove.note.whatHappened') }}</dt>
        <dd>{{ happened }}</dd>
        <template v-if="detail?.assignee">
          <dt>{{ t('yourMove.note.assignee') }}</dt>
          <dd>{{ detail.assignee }}</dd>
        </template>
        <template v-if="detail?.status">
          <dt>{{ t('yourMove.note.status') }}</dt>
          <dd>{{ detail.status }}</dd>
        </template>
        <template v-if="detail?.summary">
          <dt>{{ t('yourMove.note.event') }}</dt>
          <dd>{{ detail.summary }}</dd>
        </template>
        <template v-if="comment">
          <dt>{{ t('yourMove.note.comment') }}</dt>
          <dd>
            <span class="note-modal__author">{{ comment.author }}:</span>
            {{ comment.text }}
          </dd>
        </template>
        <dt>{{ t('yourMove.note.when') }}</dt>
        <dd>{{ when(snapshot.marks.handled[ui.note] || '') }}</dd>
      </dl>
      <label class="note-modal__label" for="note-text">{{
        info?.auto ? t('yourMove.note.labelOnTop') : t('yourMove.note.label')
      }}</label>
      <textarea
        id="note-text"
        ref="field"
        v-model="text"
        class="input note-modal__text"
        rows="3"
        maxlength="200"
        :placeholder="t('yourMove.note.placeholder')"
        @keydown.enter.prevent="save"
      />
      <p v-if="problem" class="alert alert--inline" role="alert">{{ problem }}</p>
      <p v-if="ui.noteAsk" class="alert alert--inline" role="alertdialog">
        {{ t('yourMove.note.discardAsk') }}
        <button type="button" class="btn" @click="close">{{ t('yourMove.note.discard') }}</button>
        <button type="button" class="btn" @click="ui.noteAsk = false">
          {{ t('yourMove.note.keepEditing') }}
        </button>
      </p>
      <template #footer>
        <button type="button" class="btn" @click="closeTopLayer">
          {{ t('yourMove.note.cancel') }}
        </button>
        <button type="button" class="btn btn--tonal" @click="save">
          {{ t('yourMove.note.save') }}
        </button>
      </template>
    </Modal>
  </AnimatePresence>
</template>
<style scoped>
.note-modal__summary {
  margin: 0;
  color: var(--md-on-surface-variant);
  font-size: 0.8125rem;
}

.note-modal__facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.375rem 1rem;
  margin: 0;
  font-size: 0.8125rem;
}

.note-modal__facts dt {
  color: var(--md-on-surface-variant);
}

.note-modal__facts dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.note-modal__author {
  font-weight: 500;
}

.note-modal__label {
  color: var(--md-on-surface-variant);
  font-size: 0.75rem;
}

.note-modal__text {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
}
</style>
