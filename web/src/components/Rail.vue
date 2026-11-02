<script setup>
// The rail: one generated icon per workspace, the open-moves badge, drag to reorder, the gear at the bottom.
import { computed, ref } from 'vue';
import { S, dark, switchWorkspace, reorderWorkspaces } from '../store.js';
import { GEAR, workspaceIconParts } from '../lib/icons.js';
import { movedIds } from '../lib/settings.js';
import { seeded } from '../backdrop.js';
const emit = defineEmits(['settings']);

// The dots depend on the id only; the colours on the scheme. Two computeds, so a scheme change does not redraw the dots.
const parts = computed(() => Object.fromEntries(S.workspaces.map((w) => [w.id, workspaceIconParts(w, seeded)])));
const colours = computed(() => Object.fromEntries(S.workspaces.map((w) => {
  const scheme = w.theme ? w.theme[dark.value ? 'dark' : 'light'] : null;
  return [w.id, { fill: scheme ? scheme['--md-primary-container'] : 'var(--md-primary-container)', ink: scheme ? scheme['--md-on-primary-container'] : 'var(--md-on-primary-container)', dot: scheme ? scheme['--md-primary'] : 'var(--md-primary)' }];
})));

const dragged = ref('');
const drop = ref({});
const dropBefore = (e) => e.clientY - e.currentTarget.getBoundingClientRect().top < e.currentTarget.offsetHeight / 2;
const onDragStart = (e, w) => { dragged.value = w.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', w.id); };
const onDragEnd = () => { dragged.value = ''; drop.value = {}; };
const onDragOver = (e, w) => {
  if (!dragged.value || dragged.value === w.id) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  const side = dropBefore(e) ? 'before' : 'after';
  if (drop.value.id !== w.id || drop.value.side !== side) drop.value = { id: w.id, side };
};
const onDrop = (e, w) => {
  if (!dragged.value || dragged.value === w.id) return;
  e.preventDefault();
  const ids = movedIds(S.workspaces.map((x) => x.id), dragged.value, w.id, dropBefore(e));
  drop.value = {};
  reorderWorkspaces(ids);
};
</script>
<template>
  <nav class="wt-rail" aria-label="Workspaces">
    <a v-for="w in S.workspaces" :key="w.id" class="wt-rail-item" :class="{ 'is-dragging': dragged === w.id }" :data-drop="drop.id === w.id ? drop.side : null"
      :href="'?ws=' + encodeURIComponent(w.id)" :aria-label="w.name" :aria-selected="String(w.id === S.workspace.id)" draggable="true"
      @click.prevent="switchWorkspace(w.id)" @dragstart="onDragStart($event, w)" @dragend="onDragEnd" @dragover="onDragOver($event, w)" @dragleave="drop = {}" @drop="onDrop($event, w)">
      <svg viewBox="0 0 36 36" class="wt-rail-icon" aria-hidden="true">
        <rect x="0" y="0" width="36" height="36" rx="10" :fill="colours[w.id].fill" />
        <circle v-for="(d, i) in parts[w.id].dots" :key="i" :cx="d.cx" :cy="d.cy" :r="d.r" :fill="colours[w.id].dot" :opacity="d.opacity" />
        <text x="18" :y="parts[w.id].fontSize >= 17 ? 24 : 23" text-anchor="middle" :font-size="parts[w.id].fontSize" font-weight="700" letter-spacing="-0.5" font-family="Roboto, Inter, system-ui, sans-serif" :fill="colours[w.id].ink">{{ parts[w.id].glyph }}</text>
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
