<script setup lang="ts">
// To do: the user's own notes, kept by the server per workspace; a ticket key in the text becomes a link.
import { computed, ref } from 'vue';
import { snapshot, now, todoAct } from '@/store.ts';
import type { Todo } from '@/lib/types.ts';
import { ago } from '@/lib/time.ts';
import Island from '@/ui/Island.vue';
import Segmented from '@/ui/Segmented.vue';
import ExtLink from '@/ui/ExtLink.vue';
import { useTodosView } from './useTodosView.ts';

interface TextPart {
  text: string;
  url?: string;
}

const showDone = useTodosView();
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
  return (showDone.value ? open.value.concat(done.value) : open.value).map((todo) => ({
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
const view = computed({
  get: () => (showDone.value ? 'done' : 'open'),
  set: (id) => {
    showDone.value = id === 'done';
  },
});
const options = computed(() => [
  { id: 'open', label: 'Open', count: open.value.length },
  { id: 'done', label: 'Done', count: done.value.length },
]);
</script>
<template>
  <Island
    id="todo"
    title="To do"
    note="Your own notes"
    tip='Your personal to-dos, kept on this machine. Add here, or ask Claude: "add to my to-do: …". A ticket key like PROJ-123 in the text becomes a link.'
  >
    <template #head
      ><Segmented v-model="view" :options="options" label="Show" class="todos__view"
    /></template>
    <div class="todos__add">
      <input
        v-model="draft"
        class="input todos__input"
        type="text"
        placeholder="Add a to-do and press Enter"
        aria-label="New to-do"
        autocomplete="off"
        @keydown.enter="add"
      />
      <button type="button" class="btn btn--tonal" @click="add">Add</button>
    </div>
    <p v-if="problem" class="alert alert--inline" role="alert">{{ problem }}</p>
    <ul class="todos__list">
      <li
        v-for="{ todo, parts: pieces, meta } in rows"
        :key="todo.id"
        class="todos__item"
        :class="{ 'todos__item--done': todo.done }"
      >
        <button
          type="button"
          class="todos__check"
          :class="{ 'todos__check--on': todo.done }"
          role="checkbox"
          :aria-checked="!!todo.done"
          :aria-label="todo.done ? 'Mark not done' : 'Mark done'"
          @click="flip(todo)"
        ></button>
        <span class="todos__text"
          ><template v-for="(piece, index) in pieces" :key="index"
            ><ExtLink v-if="piece.url !== undefined" :text="piece.text" :url="piece.url" /><template
              v-else
              >{{ piece.text }}</template
            ></template
          ></span
        >
        <span class="todos__meta">{{ meta }}</span>
        <button type="button" class="todos__delete" aria-label="Delete to-do" @click="remove(todo)">
          ×
        </button>
      </li>
      <span v-if="!rows.length" class="empty todos__empty">{{
        showDone ? 'Nothing here yet.' : 'Nothing to do. Add one above, or ask Claude.'
      }}</span>
    </ul>
  </Island>
</template>
<style scoped>
.todos__view {
  margin-left: 10px;
}

.todos__add {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}

.todos__input {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 12px;
  background: rgb(var(--md-state), 0.04);
  font-size: 14px;
}

.todos__list {
  margin: 0 -20px;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.todos__item {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto 20px;
  align-items: center;
  gap: 10px;
  padding: 7px 20px;
  border-top: 1px solid var(--md-outline-variant);
}

.todos__item:first-child {
  border-top: 0;
}

.todos__item:hover {
  background: rgb(var(--md-state), 0.06);
}

.todos__text {
  overflow-wrap: anywhere;
}

.todos__item--done .todos__text {
  color: var(--md-on-surface-variant);
  text-decoration: line-through;
}

.todos__empty {
  display: block;
  padding: 6px 20px 10px;
}

.todos__check {
  box-sizing: border-box;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 2px solid var(--md-outline);
  border-radius: 5px;
  cursor: pointer;
}

.todos__check--on {
  border-color: var(--md-primary);
  background: var(--md-primary);
}

.todos__check--on::after {
  content: '';
  width: 8px;
  height: 4px;
  border-bottom: 2px solid var(--md-on-primary);
  border-left: 2px solid var(--md-on-primary);
  transform: translateY(-1px) rotate(-45deg);
}

.todos__meta {
  color: var(--md-on-surface-variant);
  font-size: 11px;
  white-space: nowrap;
}

.todos__delete {
  color: var(--md-on-surface-variant);
  font-size: 16px;
  line-height: 1;
  text-align: center;
  cursor: pointer;
  opacity: 0;
}

.todos__delete:focus-visible {
  opacity: 1;
}

.todos__item:hover .todos__delete {
  opacity: 1;
}

@media (width >= 901px) {
  .dashboard--fit .dashboard__todo .todos__list {
    flex: 1 1 auto;
    min-height: 0;
  }

  .dashboard--fit .dashboard__todo .todos__list:not(:has(.todos__item)) {
    display: none;
  }
}
</style>
