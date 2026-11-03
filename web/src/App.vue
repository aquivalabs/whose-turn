<script setup>
// The window: the rail, the status line, and the dashboard that fills the rest; sheets open over it. State and data flow live in store.js.
import { onMounted, watch } from 'vue';
import { ui, alerts, themeVariables, load, connect, closeSheets, reportWindowSize } from './store.js';
import { repaint } from './backdrop.js';
import Rail from './components/Rail.vue';
import StatusBar from './components/StatusBar.vue';
import WorkspaceHeader from './components/WorkspaceHeader.vue';
import YourMove from './components/YourMove.vue';
import Todos from './components/Todos.vue';
import Waiting from './components/Waiting.vue';
import Feed from './components/Feed.vue';
import CommentModal from './components/CommentModal.vue';
import FeedbackSheet from './components/FeedbackSheet.vue';
import SettingsSheet from './components/SettingsSheet.vue';
watch(themeVariables, repaint, { flush: 'post' });
onMounted(() => {
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheets(); });
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
      <div class="wt wt-fit" id="wt">
        <canvas class="wt-backdrop" id="backdrop" aria-hidden="true"></canvas>
        <WorkspaceHeader />
        <div class="wt-layout">
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
