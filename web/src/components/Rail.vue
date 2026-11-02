<script setup>
// The rail: one generated icon per workspace, the open-moves badge, drag to reorder (the config is rewritten in the new order), the gear at the bottom.
import { computed, ref } from 'vue';
import { S, ui, isDark, switchWorkspace, reload } from '../store.js';
import { getJson, post } from '../lib/api.js';
import { GEAR, workspaceIconParts } from '../lib/icons.js';
const emit = defineEmits(['settings']);

const colours = (w) => {
  const scheme = w.theme ? w.theme[isDark() ? 'dark' : 'light'] : null;
  return { fill: scheme ? scheme['--md-primary-container'] : 'var(--md-primary-container)', ink: scheme ? scheme['--md-on-primary-container'] : 'var(--md-on-primary-container)', dot: scheme ? scheme['--md-primary'] : 'var(--md-primary)' };
};
const icons = computed(() => { void ui.tick; return S.workspaces.map((w) => ({ w, parts: workspaceIconParts(w, window.whoseTurnBackdrop.seeded), colours: colours(w) })); });

const dragged = ref('');
const drop = ref({});
const dropBefore = (e, el) => e.clientY - el.getBoundingClientRect().top < el.offsetHeight / 2;
const onDragStart = (e, w) => { dragged.value = w.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', w.id); };
const onDragEnd = () => { dragged.value = ''; drop.value = {}; };
const onDragOver = (e, w) => { if (!dragged.value || dragged.value === w.id) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; drop.value = { id: w.id, side: dropBefore(e, e.currentTarget) ? 'before' : 'after' }; };
const onDragLeave = () => { drop.value = {}; };
const reorder = (ids) => getJson('/api/config').then((config) => {
  const position = (w) => { const at = ids.indexOf(w.id); return at < 0 ? ids.length : at; };
  return post('/api/config', { workspaces: [...config.workspaces].sort((a, b) => position(a) - position(b)), secrets: [] });
}).then((j) => { if (j && j.error) { ui.status = j.error.message || 'The order was not saved'; return; } reload(); });
const onDrop = (e, w) => {
  if (!dragged.value || dragged.value === w.id) return;
  e.preventDefault();
  const ids = S.workspaces.map((x) => x.id).filter((id) => id !== dragged.value);
  ids.splice(ids.indexOf(w.id) + (dropBefore(e, e.currentTarget) ? 0 : 1), 0, dragged.value);
  drop.value = {};
  reorder(ids);
};
</script>
<template>
  <nav class="wt-rail" aria-label="Workspaces">
    <a v-for="{ w, parts, colours: c } in icons" :key="w.id" class="wt-rail-item" :class="{ 'is-dragging': dragged === w.id }" :data-drop="drop.id === w.id ? drop.side : null"
      :href="'?ws=' + encodeURIComponent(w.id)" :aria-label="w.name" :aria-selected="String(w.id === S.workspace.id)" draggable="true"
      @click.prevent="switchWorkspace(w.id)" @dragstart="onDragStart($event, w)" @dragend="onDragEnd" @dragover="onDragOver($event, w)" @dragleave="onDragLeave" @drop="onDrop($event, w)">
      <svg viewBox="0 0 36 36" class="wt-rail-icon" aria-hidden="true">
        <rect x="0" y="0" width="36" height="36" rx="10" :fill="c.fill" />
        <circle v-for="(d, i) in parts.dots" :key="i" :cx="d.cx" :cy="d.cy" :r="d.r" :fill="c.dot" :opacity="d.opacity" />
        <text x="18" y="24" text-anchor="middle" font-size="17" font-weight="600" font-family="Roboto, Inter, system-ui, sans-serif" :fill="c.ink">{{ parts.letter }}</text>
      </svg>
      <span class="wt-rail-label">{{ w.name }}</span>
      <span v-if="w.open_moves" class="wt-rail-badge">{{ w.open_moves }}</span>
    </a>
    <span class="wt-rail-spacer"></span>
    <a class="wt-rail-item" href="#settings" aria-label="Settings" @click.prevent="emit('settings')">
      <svg viewBox="0 0 24 24" class="wt-rail-gear" aria-hidden="true"><path :d="GEAR" fill="currentColor" /></svg>
      <span class="wt-rail-label">Settings</span>
    </a>
  </nav>
</template>
