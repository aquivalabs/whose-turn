<script setup>
// To do: the user's own notes, kept by the server per workspace; a ticket key in the text becomes a link.
import { computed, ref } from 'vue';
import { S, ui, now, todoAct } from '../store.js';
import { ago } from '../lib/time.js';
import Island from './Island.vue';
import ExtLink from './ExtLink.vue';
const draft = ref('');
const open = computed(() => (S.todos || []).filter((t) => !t.done));
const done = computed(() => (S.todos || []).filter((t) => t.done));
const keyPattern = computed(() => new RegExp(S.workspace.key_pattern || '(?!)', 'g'));
const parts = (todo) => {
  const out = []; let last = 0; const text = todo.text;
  for (const m of text.matchAll(keyPattern.value)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], url: m[0] === todo.key ? todo.ticket_url : '' });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
};
const rows = computed(() => { void now.value; return (ui.showDone ? open.value.concat(done.value) : open.value).map((t) => ({ t, parts: parts(t), meta: (t.by && t.by !== 'you' ? t.by + ' · ' : '') + ago(t.created) })); });
const add = () => { const text = draft.value.trim(); if (!text) return; draft.value = ''; todoAct({ action: 'add', text }); };
const flip = (t) => todoAct({ action: t.done ? 'undo' : 'done', id: t.id });
</script>
<template>
  <Island id="todo" title="To do" note="Your own notes" tip='Your personal to-dos, kept on this machine. Add here, or ask Claude: "add to my to-do: …". A ticket key like PROJ-123 in the text becomes a link.'>
    <template #head><span v-if="open.length" class="wt-count">{{ open.length }}</span></template>
    <div class="wt-todo-add">
      <input v-model="draft" class="wt-input" type="text" placeholder="Add a to-do and press Enter" aria-label="New to-do" autocomplete="off" @keydown.enter="add">
      <span class="wt-seg-b wt-todo-toggle" role="button" tabindex="0" :aria-pressed="String(ui.showDone)" @click="ui.showDone = !ui.showDone" @keydown.enter.prevent="ui.showDone = !ui.showDone">Done <b>{{ done.length }}</b></span>
    </div>
    <ul class="wt-todo-list">
      <li v-for="{ t, parts: p, meta } in rows" :key="t.id" :class="{ 'is-done': t.done }">
        <span class="wt-check" :class="{ on: t.done }" role="checkbox" tabindex="0" :aria-checked="String(!!t.done)" :aria-label="t.done ? 'Mark not done' : 'Mark done'" @click="flip(t)" @keydown.enter.prevent="flip(t)"></span>
        <span class="wt-todo-text"><template v-for="(x, i) in p" :key="i"><ExtLink v-if="x.url !== undefined" :text="x.text" :url="x.url" /><template v-else>{{ x.text }}</template></template></span>
        <span class="wt-todo-meta">{{ meta }}</span>
        <span class="wt-todo-del" role="button" tabindex="0" aria-label="Delete to-do" @click="todoAct({ action: 'delete', id: t.id })" @keydown.enter.prevent="todoAct({ action: 'delete', id: t.id })">×</span>
      </li>
      <span v-if="!rows.length" class="wt-empty">{{ ui.showDone ? 'Nothing here yet.' : 'Nothing to do. Add one above, or ask Claude.' }}</span>
    </ul>
  </Island>
</template>
