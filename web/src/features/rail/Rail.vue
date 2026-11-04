<script setup lang="ts">
// docs/adr/0002-vueuse-in-the-window.md, docs/adr/0006-window-layers.md
import { AnimatePresence, Motion } from 'motion-v';
import { computed, nextTick, ref } from 'vue';
import { snapshot, switchWorkspace, reorderWorkspaces } from '@/store.ts';
import { dark } from '@/scheme.ts';
import { GEAR, NEW_RELEASES, PLUS, workspaceIconParts } from '@/lib/icons.ts';
import { movedIds } from '@/lib/settings.ts';
import type { Workspace } from '@/lib/types.ts';
import { mulberry32 } from '@/lib/random.ts';
import { fade, listed } from '@/motion.ts';
import { useWhatsNew } from '@/composables/useWhatsNew.ts';
const emit = defineEmits<{ settings: []; addWorkspace: []; whatsNew: [] }>();
const { unseen } = useWhatsNew();

const shown = computed(() => snapshot.workspaces.filter((workspace) => !workspace.hidden));
const hiddenCount = computed(() => snapshot.workspaces.length - shown.value.length);
const hiddenLine = computed(() => {
  const count = (mode: string) => snapshot.workspaces.filter((workspace) => workspace.hidden === mode).length;
  return [`${count('parked')} parked`, `${count('paused')} paused`]
    .filter((part) => !part.startsWith('0 '))
    .join(' · ');
});

const parts = computed(() =>
  Object.fromEntries(
    shown.value.map((workspace) => [workspace.id, workspaceIconParts(workspace, mulberry32)]),
  ),
);
const colours = computed(() =>
  Object.fromEntries(
    shown.value.map((workspace) => {
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

const failing = (workspace: Workspace) =>
  workspace.id === snapshot.workspace.id
    ? Object.keys(snapshot.errors || {}).length > 0
    : Boolean(workspace.failing_sources);

const blurAfterMouse = (event: MouseEvent) => {
  if (event.detail > 0) {
    (event.currentTarget as HTMLElement).blur();
  }
};
const onSwitch = (event: MouseEvent, id: string) => {
  blurAfterMouse(event);
  switchWorkspace(id);
};
const onSettings = (event: MouseEvent) => {
  emit('settings');
  blurAfterMouse(event);
};
const onAddWorkspace = (event: MouseEvent) => {
  emit('addWorkspace');
  blurAfterMouse(event);
};
const onWhatsNew = (event: MouseEvent) => {
  emit('whatsNew');
  blurAfterMouse(event);
};

const onKeyMove = async (event: KeyboardEvent, workspace: Workspace) => {
  const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
  const ids = shown.value.map((entry) => entry.id);
  const at = ids.indexOf(workspace.id);
  if (!event.altKey || !step || at + step < 0 || at + step >= ids.length) {
    return;
  }
  event.preventDefault();
  const anchor = event.currentTarget as HTMLElement;
  ids.splice(at + step, 0, ...ids.splice(at, 1));
  await reorderWorkspaces(ids);
  await nextTick();
  anchor.focus();
};

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
    shown.value.map((entry) => entry.id),
    dragged.value,
    workspace.id,
    dropBefore(event),
  );
  drop.value = {};
  reorderWorkspaces(ids);
};
</script>
<template>
  <nav class="rail" aria-label="Workspaces">
    <AnimatePresence>
    <Motion
      v-for="workspace in shown"
      :key="workspace.id"
      v-bind="listed"
      as="a"
      class="rail__item"
      :class="{ 'rail__item--dragging': dragged === workspace.id }"
      :data-drop="drop.id === workspace.id ? drop.side : null"
      :href="'?ws=' + encodeURIComponent(workspace.id)"
      :aria-label="workspace.name"
      :aria-selected="workspace.id === snapshot.workspace.id"
      draggable="true"
      @click.prevent="onSwitch($event, workspace.id)"
      @keydown="onKeyMove($event, workspace)"
      @dragstart="onDragStart($event, workspace)"
      @dragend="onDragEnd"
      @dragover="onDragOver($event, workspace)"
      @dragleave="drop = {}"
      @drop="onDrop($event, workspace)"
    >
      <svg viewBox="0 0 36 36" class="rail__icon" aria-hidden="true">
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
      <span class="rail__label">{{ workspace.name }}</span>
      <span v-if="failing(workspace)" class="rail__warn" title="A source of this workspace fails">!</span>
      <span v-if="workspace.returned" class="rail__dot" title="Back in the rail: something needs you"></span>
      <span v-if="workspace.open_moves" class="rail__badge">{{ workspace.open_moves }}</span>
    </Motion>
    </AnimatePresence>
    <a
      class="rail__item"
      href="#add-workspace"
      aria-label="Add workspace"
      @click.prevent="onAddWorkspace"
    >
      <svg viewBox="0 0 24 24" class="rail__gear" aria-hidden="true">
        <path :d="PLUS" fill="currentColor" />
      </svg>
      <span class="rail__label">Add workspace</span>
    </a>
    <span class="rail__spacer"></span>
    <AnimatePresence>
      <Motion
        v-if="hiddenLine"
        v-bind="fade"
        as="a"
        class="rail__item rail__hidden"
        href="#hidden-workspaces"
        :aria-label="hiddenCount + ' hidden'"
        :title="hiddenLine"
        @click.prevent="onSettings"
      >
        <span class="rail__hidden-count" aria-hidden="true">{{ hiddenCount }}</span>
        <span class="rail__label">{{ hiddenCount }} hidden</span>
      </Motion>
    </AnimatePresence>
    <a class="rail__item" href="#whats-new" aria-label="What's new" @click.prevent="onWhatsNew">
      <svg viewBox="0 0 24 24" class="rail__gear" aria-hidden="true">
        <path :d="NEW_RELEASES" fill="currentColor" />
      </svg>
      <span class="rail__label">What's new</span>
      <span v-if="unseen.length" class="rail__dot" title="Unseen changes"></span>
    </a>
    <a
      class="rail__item"
      href="#settings"
      aria-label="Monitor settings"
      @click.prevent="onSettings"
    >
      <svg viewBox="0 0 24 24" class="rail__gear" aria-hidden="true">
        <path :d="GEAR" fill="currentColor" />
      </svg>
      <span class="rail__label">Monitor settings</span>
    </a>
  </nav>
</template>
<style scoped>
.rail {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 30;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 60px;
  padding: 12px 8px;
  overflow: hidden;
  border-right: 1px solid var(--glass-edge);
  background: rgb(var(--glass), 0.72);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  font-family: var(--md-font);
  color: var(--md-on-surface);
  transition:
    width var(--motion-base) var(--motion-ease),
    box-shadow var(--motion-base) var(--motion-ease);
}

.rail:hover,
.rail:has(:focus-visible) {
  width: 232px;
  box-shadow: 12px 0 32px rgb(0 0 0 / 12%);
}

.app:has(.modal) .rail {
  z-index: 0;
}

.rail__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 44px;
  padding: 0 4px;
  border-radius: 12px;
  color: inherit;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}

.rail__item:focus-visible {
  outline: var(--focus-ring);
  outline-offset: -2px;
}

.rail__item--dragging {
  opacity: 0.4;
}

.rail__item[data-drop='before'] {
  box-shadow: 0 -2px 0 0 var(--md-primary);
}

.rail__item[data-drop='after'] {
  box-shadow: 0 2px 0 0 var(--md-primary);
}

.rail__item:hover {
  background: var(--state-hover);
}

.rail__item[aria-selected='true'] {
  background: var(--md-secondary-container);
  color: var(--md-on-secondary-container);
}

.rail__icon {
  flex: none;
  display: block;
  width: 36px;
  height: 36px;
  border-radius: 10px;
}

.rail__gear {
  flex: none;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  color: var(--md-on-surface-variant);
}

.rail__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 500;
  opacity: 0;
  transition: opacity var(--motion-fast) var(--motion-ease);
}

.rail__hidden .rail__label {
  color: var(--md-on-surface-variant);
  font-size: 12px;
}

.rail:hover .rail__label,
.rail:has(:focus-visible) .rail__label {
  opacity: 1;
}

.rail__badge {
  position: absolute;
  top: 2px;
  left: 30px;
  box-sizing: border-box;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--md-primary);
  color: var(--md-on-primary);
  font-size: 10px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}

.rail:hover .rail__badge,
.rail:has(:focus-visible) .rail__badge {
  position: static;
  flex: none;
}

.rail__warn {
  position: absolute;
  left: 26px;
  top: 26px;
  display: grid;
  place-items: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--md-error);
  color: var(--md-on-error);
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
}

.rail__dot {
  position: absolute;
  top: 6px;
  left: 28px;
  box-sizing: border-box;
  width: 10px;
  height: 10px;
  border: 2px solid var(--md-surface);
  border-radius: 50%;
  background: var(--md-primary);
}

.rail__hidden-count {
  flex: none;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  color: var(--md-on-surface-variant);
  font-size: 13px;
  font-weight: 700;
}

.rail__spacer {
  flex: 1;
}
</style>
