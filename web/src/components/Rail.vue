<script setup lang="ts">
// The rail: one generated icon per workspace, the open-moves badge, drag to reorder, the gear at the bottom.
// Reorder stays on the platform's drag events: SortableJS would own the DOM order Vue renders from the server (docs/adr/0002-vueuse-in-the-window.md).
import { computed, ref } from 'vue';
import { snapshot, switchWorkspace, reorderWorkspaces } from '../store.ts';
import { dark } from '../scheme.ts';
import { GEAR, workspaceIconParts } from '../lib/icons.ts';
import { movedIds } from '../lib/settings.ts';
import type { Workspace } from '../lib/types.ts';
import { seeded } from '../backdrop.ts';
const emit = defineEmits<{ settings: [] }>();

// The dots depend on the id only; the colours on the scheme. Two computeds, so a scheme change does not redraw the dots.
const parts = computed(() =>
  Object.fromEntries(
    snapshot.workspaces.map((workspace) => [workspace.id, workspaceIconParts(workspace, seeded)]),
  ),
);
const colours = computed(() =>
  Object.fromEntries(
    snapshot.workspaces.map((workspace) => {
      const scheme = workspace.theme ? workspace.theme[dark.value ? 'dark' : 'light'] : null;
      return [
        workspace.id,
        {
          fill: scheme ? scheme['--md-primary-container'] : 'var(--md-primary-container)',
          ink: scheme ? scheme['--md-on-primary-container'] : 'var(--md-on-primary-container)',
          dot: scheme ? scheme['--md-primary'] : 'var(--md-primary)',
        },
      ];
    }),
  ),
);

const dragged = ref('');
const drop = ref<{ id?: string; side?: 'before' | 'after' }>({});
const dropBefore = (event: DragEvent) => {
  const target = event.currentTarget as HTMLElement;
  return event.clientY - target.getBoundingClientRect().top < target.offsetHeight / 2;
};
const onDragStart = (event: DragEvent, workspace: Workspace) => {
  dragged.value = workspace.id;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', workspace.id);
  }
};
const onDragEnd = () => {
  dragged.value = '';
  drop.value = {};
};
const onDragOver = (event: DragEvent, workspace: Workspace) => {
  if (!dragged.value || dragged.value === workspace.id) {
    return;
  }
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
  const side = dropBefore(event) ? 'before' : 'after';
  if (drop.value.id !== workspace.id || drop.value.side !== side) {
    drop.value = { id: workspace.id, side };
  }
};
const onDrop = (event: DragEvent, workspace: Workspace) => {
  if (!dragged.value || dragged.value === workspace.id) {
    return;
  }
  event.preventDefault();
  const ids = movedIds(
    snapshot.workspaces.map((entry) => entry.id),
    dragged.value,
    workspace.id,
    dropBefore(event),
  );
  drop.value = {};
  reorderWorkspaces(ids);
};
</script>
<template>
  <nav class="wt-rail" aria-label="Workspaces">
    <a
      v-for="workspace in snapshot.workspaces"
      :key="workspace.id"
      class="wt-rail-item"
      :class="{ 'is-dragging': dragged === workspace.id }"
      :data-drop="drop.id === workspace.id ? drop.side : null"
      :href="'?ws=' + encodeURIComponent(workspace.id)"
      :aria-label="workspace.name"
      :aria-selected="workspace.id === snapshot.workspace.id"
      draggable="true"
      @click.prevent="switchWorkspace(workspace.id)"
      @dragstart="onDragStart($event, workspace)"
      @dragend="onDragEnd"
      @dragover="onDragOver($event, workspace)"
      @dragleave="drop = {}"
      @drop="onDrop($event, workspace)"
    >
      <svg viewBox="0 0 36 36" class="wt-rail-icon" aria-hidden="true">
        <rect x="0" y="0" width="36" height="36" rx="10" :fill="colours[workspace.id].fill" />
        <circle
          v-for="(dot, index) in parts[workspace.id].dots"
          :key="index"
          :cx="dot.cx"
          :cy="dot.cy"
          :r="dot.r"
          :fill="colours[workspace.id].dot"
          :opacity="dot.opacity"
        />
        <text
          x="18"
          :y="parts[workspace.id].fontSize >= 17 ? 24 : 23"
          text-anchor="middle"
          :font-size="parts[workspace.id].fontSize"
          font-weight="700"
          letter-spacing="-0.5"
          font-family="Roboto, Inter, system-ui, sans-serif"
          :fill="colours[workspace.id].ink"
        >
          {{ parts[workspace.id].glyph }}
        </text>
      </svg>
      <span class="wt-rail-label">{{ workspace.name }}</span>
      <span v-if="workspace.open_moves" class="wt-rail-badge">{{ workspace.open_moves }}</span>
    </a>
    <span class="wt-rail-spacer"></span>
    <a
      class="wt-rail-item"
      href="#settings"
      aria-label="Settings"
      @click.prevent="emit('settings')"
    >
      <svg viewBox="0 0 24 24" class="wt-rail-gear" aria-hidden="true">
        <path :d="GEAR" fill="currentColor" />
      </svg>
      <span class="wt-rail-label">Settings</span>
    </a>
  </nav>
</template>
