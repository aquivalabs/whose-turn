<script setup>
// The window: the rail, the status line, and the dashboard that fills the rest; sheets open over it. State and data flow live in store.js.
import { computed, onMounted, watch } from 'vue';
import { S, ui, load, connect, themeVariables } from './store.js';
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
const theme = computed(() => { void ui.tick; return themeVariables(); });
const alerts = computed(() => { const out = (S.problems || []).slice(); for (const source of Object.keys(S.errors || {})) out.push(source + ': ' + S.errors[source]); return out; });
watch(theme, () => { if (window.whoseTurnBackdrop) window.whoseTurnBackdrop.repaint(); }, { flush: 'post' });
onMounted(() => {
  if (window.tippy) {
    window.tippy.delegate(document.body, { target: '[data-tip]', content: (el) => el.dataset.tip, trigger: 'mouseenter focus click', delay: [0, 80], duration: [120, 80], interactive: true, maxWidth: 440, placement: 'top', theme: 'wt', appendTo: () => document.body });
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { ui.modal = null; ui.settings = false; ui.feedback = false; } });
  load().then(connect);
});
</script>
<template>
  <div class="wt-app" :style="theme">
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
