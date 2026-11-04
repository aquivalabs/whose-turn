<script setup lang="ts">
// What a handled row carries: the outcome of a pass-on and the note. docs/mechanisms/your-move.md § How it behaves
import { AnimatePresence } from 'motion-v';
import { computed, nextTick, ref, watch } from 'vue';
import { snapshot, ui, setMarks, showInFeed, justHandled } from '@/store.ts';
import { when } from '@/lib/time.ts';
import Modal from '@/ui/Modal.vue';
const row = computed(() => snapshot.turn.find((item) => item.row_id === ui.note));
const info = computed(() => snapshot.marks.info[ui.note]);
const pending = computed(() => row.value?.group === 'you' && !row.value.handled);
const kept = computed(() => info.value?.note || '');
const text = ref('');
const problem = ref('');
const field = ref<HTMLTextAreaElement | null>(null);
watch(
  () => ui.note,
  async (id) => {
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
const close = () => {
  ui.note = '';
};
const commit = async (note: string) => {
  const id = ui.note;
  const marking = pending.value;
  problem.value = await setMarks(
    marking
      ? { handled: { [id]: new Date().toISOString() }, ...(note && { notes: { [id]: note } }) }
      : { notes: { [id]: note } },
  );
  if (problem.value) {
    return;
  }
  if (marking) {
    justHandled.value = id;
  }
  close();
};
const save = () => {
  const note = text.value.replace(/\s+/g, ' ').trim();
  if (!pending.value && note === kept.value) {
    close();
    return;
  }
  return commit(note);
};
const skip = () => (pending.value ? commit('') : close());
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
      :title="row.key + ' · ' + (info?.auto ? 'Passed on' : 'Handled')"
      label-id="note-title"
      @close="close"
    >
      <template v-if="info?.auto" #head>
        <button v-if="info.event" type="button" class="btn" @click="openInFeed">Open in feed</button>
      </template>
      <p class="note-modal__summary">{{ row.summary }}</p>
      <dl v-if="info?.auto" class="note-modal__facts">
        <dt>What happened</dt>
        <dd>{{ happened }}</dd>
        <template v-if="detail?.assignee">
          <dt>Assignee</dt>
          <dd>{{ detail.assignee }}</dd>
        </template>
        <template v-if="detail?.status">
          <dt>Status</dt>
          <dd>{{ detail.status }}</dd>
        </template>
        <template v-if="detail?.summary">
          <dt>Event</dt>
          <dd>{{ detail.summary }}</dd>
        </template>
        <template v-if="comment">
          <dt>Comment</dt>
          <dd>
            <span class="note-modal__author">{{ comment.author }}:</span>
            {{ comment.text }}
          </dd>
        </template>
        <dt>When</dt>
        <dd>{{ when(snapshot.marks.handled[ui.note] || '') }}</dd>
      </dl>
      <label class="note-modal__label" for="note-text"
        >{{ info?.auto ? 'Your note on top' : 'Note' }} (optional)</label
      >
      <textarea
        id="note-text"
        ref="field"
        v-model="text"
        class="input note-modal__text"
        rows="3"
        maxlength="200"
        placeholder="Add a note…"
        @keydown.enter.prevent="save"
      />
      <p v-if="problem" class="alert alert--inline" role="alert">{{ problem }}</p>
      <template #footer>
        <button type="button" class="btn" @click="skip">{{ kept && !pending ? 'Cancel' : 'Skip' }}</button>
        <button type="button" class="btn btn--tonal" @click="save">Save</button>
      </template>
    </Modal>
  </AnimatePresence>
</template>
<style scoped>
.note-modal__summary {
  margin: 0;
  color: var(--md-on-surface-variant);
  font-size: 13px;
}

.note-modal__facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 16px;
  margin: 0;
  font-size: 13px;
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
  font-size: 12px;
}

.note-modal__text {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
}
</style>
