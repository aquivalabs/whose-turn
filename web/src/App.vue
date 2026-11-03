<script setup lang="ts">
// The window: the rail, the status line, and the dashboard that fills the rest; sheets open over it. State and data flow live in store.ts.
import { computed, onMounted, watch } from 'vue';
import { onKeyStroke } from '@vueuse/core';
import {
  ui,
  snapshot,
  alerts,
  themeVariables,
  load,
  connect,
  closeSheets,
  reportWindowSize,
} from './store.ts';
import { repaint } from './backdrop.ts';
import Rail from './components/Rail.vue';
import StatusBar from './components/StatusBar.vue';
import WorkspaceHeader from './components/WorkspaceHeader.vue';
import YourMove from './components/YourMove.vue';
import Todos from './components/Todos.vue';
import Waiting from './components/Waiting.vue';
import Feed from './components/Feed.vue';
import FirstRun from './components/FirstRun.vue';
import CommentModal from './components/CommentModal.vue';
import FeedbackSheet from './components/FeedbackSheet.vue';
import SettingsSheet from './components/SettingsSheet.vue';
const firstRun = computed(
  () => Boolean(snapshot.workspace.id) && !snapshot.workspace.connectors.length,
);
watch(themeVariables, repaint, { flush: 'post' });
onKeyStroke('Escape', closeSheets, { target: document });
onMounted(() => {
  reportWindowSize();
  load().then(connect);
});
</script>
<template>
  <div class="wt-app" :style="themeVariables">
    <Rail @settings="ui.settings = true" />
    <div class="wt-shell">
      <StatusBar @report="ui.feedback = true" />
      <div v-if="alerts.length" class="wt-alert">{{ alerts.join('  ·  ') }}</div>
      <div id="wt" class="wt wt-fit">
        <canvas id="backdrop" class="wt-backdrop" aria-hidden="true"></canvas>
        <WorkspaceHeader />
        <FirstRun v-if="firstRun" />
        <div v-else class="wt-layout">
          <div class="wt-main"><YourMove /><Todos /><Waiting /></div>
          <Feed @open="ui.modal = $event" />
        </div>
        <FeedbackSheet />
        <SettingsSheet />
        <CommentModal />
      </div>
    </div>
  </div>
</template>
