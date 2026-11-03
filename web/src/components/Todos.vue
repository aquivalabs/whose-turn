<script setup lang="ts">
// To do: the user's own notes, kept by the server per workspace; a ticket key in the text becomes a link.
import { computed, ref } from 'vue';
import { snapshot, ui, now, todoAct } from '../store.ts';
import type { Todo } from '../lib/types.ts';
import { ago } from '../lib/time.ts';
import Island from './Island.vue';
import ExtLink from './ExtLink.vue';

interface TextPart {
  text: string;
  url?: string;
}

const draft = ref('');
const open = computed(() => (snapshot.todos || []).filter((todo) => !todo.done));
const done = computed(() => (snapshot.todos || []).filter((todo) => todo.done));
const keyPattern = computed(() => new RegExp(snapshot.workspace.key_pattern || '(?!)', 'g'));
const parts = (todo: Todo) => {
  const out: TextPart[] = [];
  let last = 0;
  const text = todo.text;
  for (const match of text.matchAll(keyPattern.value)) {
    if (match.index > last) {
      out.push({ text: text.slice(last, match.index) });
    }
    out.push({ text: match[0], url: match[0] === todo.key ? todo.ticket_url : '' });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    out.push({ text: text.slice(last) });
  }
  return out;
};
const rows = computed(() => {
  void now.value;
  return (ui.showDone ? open.value.concat(done.value) : open.value).map((todo) => ({
    todo,
    parts: parts(todo),
    meta: (todo.by && todo.by !== 'you' ? todo.by + ' · ' : '') + ago(todo.created),
  }));
});
const problem = ref('');
const send = async (body: Parameters<typeof todoAct>[0]) => {
  problem.value = await todoAct(body);
  return !problem.value;
};
const add = async () => {
  const text = draft.value.trim();
  if (!text) {
    return;
  }
  if ((await send({ action: 'add', text })) && draft.value.trim() === text) {
    draft.value = '';
  }
};
const flip = (todo: Todo) => send({ action: todo.done ? 'undo' : 'done', id: todo.id });
const remove = (todo: Todo) => send({ action: 'delete', id: todo.id });
const toggleDone = () => {
  ui.showDone = !ui.showDone;
};
</script>
<template>
  <Island
    id="todo"
    title="To do"
    note="Your own notes"
    tip='Your personal to-dos, kept on this machine. Add here, or ask Claude: "add to my to-do: …". A ticket key like PROJ-123 in the text becomes a link.'
  >
    <template #head
      ><span v-if="open.length" class="wt-count">{{ open.length }}</span></template
    >
    <div class="wt-todo-add">
      <input
        v-model="draft"
        class="wt-input"
        type="text"
        placeholder="Add a to-do and press Enter"
        aria-label="New to-do"
        autocomplete="off"
        @keydown.enter="add"
      />
      <span
        class="wt-seg-b wt-todo-toggle"
        role="button"
        tabindex="0"
        :aria-pressed="ui.showDone"
        @click="toggleDone"
        @keydown.enter.prevent="toggleDone"
        >Done <b>{{ done.length }}</b></span
      >
    </div>
    <p v-if="problem" class="wt-alert wt-todo-problem" role="alert">{{ problem }}</p>
    <ul class="wt-todo-list">
      <li
        v-for="{ todo, parts: pieces, meta } in rows"
        :key="todo.id"
        :class="{ 'is-done': todo.done }"
      >
        <span
          class="wt-check"
          :class="{ on: todo.done }"
          role="checkbox"
          tabindex="0"
          :aria-checked="!!todo.done"
          :aria-label="todo.done ? 'Mark not done' : 'Mark done'"
          @click="flip(todo)"
          @keydown.enter.prevent="flip(todo)"
        ></span>
        <span class="wt-todo-text"
          ><template v-for="(piece, index) in pieces" :key="index"
            ><ExtLink v-if="piece.url !== undefined" :text="piece.text" :url="piece.url" /><template
              v-else
              >{{ piece.text }}</template
            ></template
          ></span
        >
        <span class="wt-todo-meta">{{ meta }}</span>
        <span
          class="wt-todo-del"
          role="button"
          tabindex="0"
          aria-label="Delete to-do"
          @click="remove(todo)"
          @keydown.enter.prevent="remove(todo)"
          >×</span
        >
      </li>
      <span v-if="!rows.length" class="wt-empty">{{
        ui.showDone ? 'Nothing here yet.' : 'Nothing to do. Add one above, or ask Claude.'
      }}</span>
    </ul>
  </Island>
</template>
