<script setup lang="ts">
// The window: the rail, the status line, and the dashboard that fills the rest; sheets open over it. State and data flow live in store.ts.
import { computed, onMounted, watch } from 'vue';
import { onKeyStroke, useFavicon } from '@vueuse/core';
import { AnimatePresence, LazyMotion, M as Motion, MotionConfig } from 'motion-v';
import { fade, loadFeatures, reduced } from './motion.ts';
import {
  ui,
  snapshot,
  alerts,
  themeVariables,
  currentLayer,
  closeTopLayer,
  openSettings,
  openNewWorkspace,
  reportWindowSize,
  UNREACHABLE,
} from './store.ts';
import { repaint } from './backdrop.ts';
import { dark } from './scheme.ts';
import { workspaceIconParts, workspaceIconSvg } from './lib/icons.ts';
import { mulberry32 } from './lib/random.ts';
import { useDialogFocus, useShortcuts } from './composables/useKeyboard.ts';
import { usePanelSize } from './composables/usePanelSize.ts';
import { useFold } from './composables/useFold.ts';
import Rail from './features/rail/Rail.vue';
import StatusBar from './features/status/StatusBar.vue';
import WorkspaceHeader from './features/header/WorkspaceHeader.vue';
import YourMove from './features/your-move/YourMove.vue';
import Todos from './features/todos/Todos.vue';
import Waiting from './features/waiting/Waiting.vue';
import Feed from './features/feed/Feed.vue';
import FirstRun from './features/first-run/FirstRun.vue';
import CommentModal from './features/feed/CommentModal.vue';
import NoteModal from './features/your-move/NoteModal.vue';
import FeedbackSheet from './features/feedback/FeedbackSheet.vue';
import WorkspaceSettingsSheet from './features/settings/WorkspaceSettingsSheet.vue';
import MonitorSettingsSheet from './features/settings/MonitorSettingsSheet.vue';
import HelpSheet from './features/help/HelpSheet.vue';
import WhatsNewSheet from './features/whats-new/WhatsNewSheet.vue';
import StoppedNotice from './features/lifecycle/StoppedNotice.vue';
import { useWhatsNew } from './composables/useWhatsNew.ts';
import { useText } from '@/i18n/index.ts';
const t = useText();
const firstRun = computed(
  () => Boolean(snapshot.workspace.id) && !snapshot.workspace.connectors.length,
);
const { size: feedWidth } = usePanelSize(() => `${snapshot.workspace.id}:feed`);
const layoutStyle = computed(() =>
  feedWidth.value === null ? undefined : { '--feed-width': feedWidth.value + 'px' },
);
const { collapsed: feedFolded } = useFold('feed');
const whatsNew = useWhatsNew();
const unreachable = computed(() => (UNREACHABLE as readonly string[]).includes(ui.lifecycle));
const covered = computed(() => currentLayer.value !== null || unreachable.value);
useDialogFocus(covered);
useShortcuts(covered);
watch(themeVariables, repaint, { flush: 'post' });
watch(() => snapshot.workspace.backdrop !== false, repaint, { flush: 'post' });
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
  <LazyMotion :features="loadFeatures">
  <MotionConfig reduced-motion="user" :skip-animations="reduced">
  <div class="app" :class="{ 'app--dimmed': unreachable }" :style="themeVariables">
    <Rail
      :inert="covered"
      @settings="ui.monitor = true"
      @add-workspace="openNewWorkspace()"
      @whats-new="ui.whatsNew = true"
    />
    <div class="app__shell">
      <StatusBar :inert="covered" @report="ui.feedback = true" />
      <AnimatePresence>
        <Motion v-if="alerts.length" v-bind="fade" class="alert" :inert="covered">
          {{ alerts.join('  ·  ') }}
          <button type="button" class="alert__action" @click="openSettings()">
            {{ t('common.app.openWorkspaceSettings') }}
          </button>
        </Motion>
      </AnimatePresence>
      <div id="wt" class="dashboard dashboard--fit">
        <canvas v-if="snapshot.workspace.backdrop !== false" id="backdrop" class="dashboard__backdrop" aria-hidden="true"></canvas>
        <WorkspaceHeader :inert="covered" />
        <FirstRun v-if="firstRun" :inert="covered" />
        <div
          v-else
          class="dashboard__layout"
          :class="{ 'dashboard__layout--feed-folded': feedFolded }"
          :style="layoutStyle"
          :inert="covered"
        >
          <div class="dashboard__main">
            <YourMove class="dashboard__move" /><Todos class="dashboard__todo" /><Waiting
              class="dashboard__waiting"
            />
          </div>
          <Feed class="dashboard__feed" @open="ui.modal = $event" />
        </div>
        <FeedbackSheet />
        <WorkspaceSettingsSheet />
        <MonitorSettingsSheet />
        <WhatsNewSheet />
        <HelpSheet />
        <CommentModal />
        <NoteModal />
      </div>
    </div>
    <StoppedNotice />
  </div>
  </MotionConfig>
  </LazyMotion>
</template>
<style scoped>
.app > :not(.stopped-notice) {
  transition: opacity var(--motion-base) var(--motion-ease);
}

.app--dimmed > :not(.stopped-notice) {
  opacity: 0.35;
}

.app__shell {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0.75rem 0.75rem 0.5rem 4.5rem;
}

.app__shell > .dashboard {
  flex: 1 1 auto;
  min-height: 0;
}

@media (width >= 56.3125em) {
  .app__shell > .dashboard.dashboard--fit {
    height: auto;
  }
}

@media (width <= 56.25em) {
  .app__shell {
    height: auto;
  }
}
</style>
