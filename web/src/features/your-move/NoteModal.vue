<script setup lang="ts">
// What a handled row carries: the full outcome of a pass-on and the note, opened by Handled or by the row's outcome line.
import { computed, nextTick, ref, watch } from 'vue';
import { snapshot, ui, setMarks, showInFeed } from '@/store.ts';
import { when } from '@/lib/time.ts';
import Modal from '@/ui/Modal.vue';
const row = computed(() => snapshot.turn.find((item) => item.row_id === ui.note));
const info = computed(() => snapshot.marks.info[ui.note]);
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
const save = async () => {
  const note = text.value.replace(/\s+/g, ' ').trim();
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
const happened = computed(() => detail.value?.what || info.value?.outcome || '');
</script>
<template>
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
      <template v-if="detail?.comment">
        <dt>Comment</dt>
        <dd>
          <span class="note-modal__author">{{ detail.comment.author }}:</span>
          {{ detail.comment.text }}
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
      <button type="button" class="btn" @click="close">{{ kept ? 'Cancel' : 'Skip' }}</button>
      <button type="button" class="btn btn--tonal" @click="save">Save</button>
    </template>
  </Modal>
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
