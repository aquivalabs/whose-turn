<script setup lang="ts">
// The window: the rail, the status line, and the dashboard that fills the rest; sheets open over it. State and data flow live in store.ts.
import { computed, onMounted, watch } from 'vue';
import { onKeyStroke } from '@vueuse/core';
import {
  ui,
  snapshot,
  alerts,
  themeVariables,
  currentLayer,
  closeTopLayer,
  reportWindowSize,
} from './store.ts';
import { repaint } from './backdrop.ts';
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
const firstRun = computed(
  () => Boolean(snapshot.workspace.id) && !snapshot.workspace.connectors.length,
);
const covered = computed(() => currentLayer.value !== null);
watch(themeVariables, repaint, { flush: 'post' });
onKeyStroke('Escape', closeTopLayer, { target: document });
onMounted(() => {
  reportWindowSize();
});
</script>
<template>
  <div class="app" :style="themeVariables">
    <Rail :inert="covered" @settings="ui.settings = true" />
    <div class="app__shell">
      <StatusBar :inert="covered" @report="ui.feedback = true" />
      <div v-if="alerts.length" class="alert" :inert="covered">{{ alerts.join('  ·  ') }}</div>
      <div id="wt" class="dashboard dashboard--fit">
        <canvas id="backdrop" class="dashboard__backdrop" aria-hidden="true"></canvas>
        <WorkspaceHeader :inert="covered" />
        <FirstRun v-if="firstRun" :inert="covered" />
        <div v-else class="dashboard__layout" :inert="covered">
          <div class="dashboard__main">
            <YourMove class="dashboard__move" /><Todos class="dashboard__todo" /><Waiting
              class="dashboard__waiting"
            />
          </div>
          <Feed class="dashboard__feed" @open="ui.modal = $event" />
        </div>
        <FeedbackSheet />
        <SettingsSheet />
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
