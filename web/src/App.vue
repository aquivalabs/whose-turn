<script setup lang="ts">
// The window: the rail, the status line, and the dashboard that fills the rest; sheets open over it. State and data flow live in store.ts.
import { computed, onMounted, watch } from 'vue';
import { onKeyStroke, useFavicon } from '@vueuse/core';
import {
  ui,
  snapshot,
  alerts,
  themeVariables,
  currentLayer,
  closeTopLayer,
  openSettings,
  reportWindowSize,
} from './store.ts';
import { repaint } from './backdrop.ts';
import { dark } from './scheme.ts';
import { workspaceIconParts, workspaceIconSvg } from './lib/icons.ts';
import { mulberry32 } from './lib/random.ts';
import { useDialogFocus, useShortcuts } from './composables/useKeyboard.ts';
import { usePanelSize } from './composables/usePanelSize.ts';
import Rail from './features/rail/Rail.vue';
import StatusBar from './features/status/StatusBar.vue';
import WorkspaceHeader from './features/header/WorkspaceHeader.vue';
import YourMove from './features/your-move/YourMove.vue';
import Todos from './features/todos/Todos.vue';
import Waiting from './features/waiting/Waiting.vue';
import Feed from './features/feed/Feed.vue';
import FirstRun from './features/first-run/FirstRun.vue';
import CommentModal from './features/feed/CommentModal.vue';
import FeedbackSheet from './features/feedback/FeedbackSheet.vue';
import SettingsSheet from './features/settings/SettingsSheet.vue';
import WhatsNewSheet from './features/whats-new/WhatsNewSheet.vue';
import { useWhatsNew } from './composables/useWhatsNew.ts';
const firstRun = computed(
  () => Boolean(snapshot.workspace.id) && !snapshot.workspace.connectors.length,
);
const { size: feedWidth } = usePanelSize(() => `${snapshot.workspace.id}:feed`);
const layoutStyle = computed(() =>
  feedWidth.value === null ? undefined : { '--feed-width': feedWidth.value + 'px' },
);
const whatsNew = useWhatsNew();
const covered = computed(() => currentLayer.value !== null);
useDialogFocus(covered);
useShortcuts(covered);
watch(themeVariables, repaint, { flush: 'post' });
const FALLBACK = {
  light: { fill: '#d8e2ff', ink: '#001a41', dot: '#2c5697' },
  dark: { fill: '#2b4678', ink: '#d8e2ff', dot: '#adc6ff' },
};
/** The open workspace's rail icon as the tab icon. */
const icon = computed(() => {
  const { id, name } = snapshot.workspace;
  if (!id) {
    return null;
  }
  const scheme = themeVariables.value as Record<string, string>;
  const base = FALLBACK[dark.value ? 'dark' : 'light'];
  const colours = {
    fill: scheme['--md-primary-container'] || base.fill,
    ink: scheme['--md-on-primary-container'] || base.ink,
    dot: scheme['--md-primary'] || base.dot,
  };
  return 'data:image/svg+xml,' + encodeURIComponent(workspaceIconSvg(workspaceIconParts({ id, name }, mulberry32), colours));
});
useFavicon(icon);
onKeyStroke('Escape', closeTopLayer, { target: document });
onMounted(() => {
  reportWindowSize();
  void whatsNew.load();
});
</script>
<template>
  <div class="app" :style="themeVariables">
    <Rail :inert="covered" @settings="ui.settings = true" @whats-new="ui.whatsNew = true" />
    <div class="app__shell">
      <StatusBar :inert="covered" @report="ui.feedback = true" />
      <div v-if="alerts.length" class="alert" :inert="covered">
        {{ alerts.join('  ·  ') }}
        <button type="button" class="alert__action" @click="openSettings()">Open Settings</button>
      </div>
      <div id="wt" class="dashboard dashboard--fit">
        <canvas id="backdrop" class="dashboard__backdrop" aria-hidden="true"></canvas>
        <WorkspaceHeader :inert="covered" />
        <FirstRun v-if="firstRun" :inert="covered" />
        <div v-else class="dashboard__layout" :style="layoutStyle" :inert="covered">
          <div class="dashboard__main">
            <YourMove class="dashboard__move" /><Todos class="dashboard__todo" /><Waiting
              class="dashboard__waiting"
            />
          </div>
          <Feed class="dashboard__feed" @open="ui.modal = $event" />
        </div>
        <FeedbackSheet />
        <SettingsSheet />
        <WhatsNewSheet />
        <CommentModal />
      </div>
    </div>
  </div>
</template>
<style scoped>
.app__shell {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px 12px 12px 72px;
}

.app__shell > .dashboard {
  flex: 1 1 auto;
  min-height: 0;
}

@media (width >= 901px) {
  .app__shell > .dashboard.dashboard--fit {
    height: auto;
  }
}

@media (width <= 900px) {
  .app__shell {
    height: auto;
  }
}
</style>
