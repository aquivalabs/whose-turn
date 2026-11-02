<script setup>
// Report: one field in the user's words; the server's composer shapes the issue; the list below shows what this machine filed with the state Linear reports.
import { ref, watch, nextTick } from 'vue';
import { S, ui } from '../store.js';
import { getJson, post, problemsOf } from '../lib/api.js';
import { ago } from '../lib/time.js';
import { outcomeTone } from '../lib/moves.js';
const text = ref('');
const field = ref(null);
const sending = ref(false);
const problems = ref([]);
const done = ref(null);
const project = ref('');
const reports = ref([]);
const reportPage = (id) => '/report?id=' + encodeURIComponent(id);
const load = () => getJson('/api/feedback').then((j) => { project.value = j.configured ? 'Linear · ' + j.project : 'not configured: set feedback in the config'; reports.value = j.reports || []; });
const close = () => { ui.feedback = false; };
const send = () => {
  const remark = text.value.trim();
  if (!remark) { problems.value = ['Write at least one line.']; return; }
  sending.value = true;
  post('/api/feedback', { text: remark, from: 'the window', ws: S.workspace.id, kind_ref: { kind: 'workspace', ref: S.workspace.id } }).then((j) => {
    sending.value = false;
    if (j.error) { problems.value = problemsOf(j.error); return; }
    done.value = j.issue; text.value = ''; reports.value = j.reports || reports.value;
  }).catch(() => { sending.value = false; problems.value = ['The monitor did not answer.']; });
};
watch(() => ui.feedback, (open) => { if (open) { problems.value = []; done.value = null; load().then(() => nextTick(() => field.value && field.value.focus())); } });
</script>
<template>
  <div v-if="ui.feedback" class="wt-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-title" @click.self="close">
    <div class="wt-modal-card wt-feedback-card">
      <div class="wt-modal-head">
        <h3 id="feedback-title">To the Whose Turn backlog</h3>
        <span class="wt-modal-meta">{{ project }}</span>
        <span class="wt-btn tonal" role="button" tabindex="0" @click="send" @keydown.enter.prevent="send">{{ sending ? 'Composing…' : 'Send' }}</span>
        <span class="wt-btn" role="button" tabindex="0" @click="close" @keydown.enter.prevent="close">Close</span>
      </div>
      <div v-if="problems.length" class="wt-alert">{{ problems.join('  ·  ') }}</div>
      <div class="wt-settings-form wt-feedback-form">
        <textarea ref="field" v-model="text" class="wt-input wt-feedback-text" rows="5" placeholder="Describe the problem or the wish in your own words. Cmd+Enter sends." autocomplete="off" @keydown.meta.enter.prevent="send" @keydown.ctrl.enter.prevent="send"></textarea>
        <p class="wt-feedback-note">An assistant turns it into a proper issue (title, kind, description) and files it in the Whose Turn backlog with this workspace's summary attached.</p>
        <p v-if="done" class="wt-empty">Filed as <a :href="reportPage(done.identifier)" target="_blank" rel="noopener">{{ done.identifier }}</a> · {{ done.title }}</p>
        <div v-if="reports.length" class="wt-feedback-reports">
          <h4>Your reports</h4>
          <div v-for="r in reports" :key="r.id" class="wt-feedback-report">
            <a :href="reportPage(r.id)" target="_blank" rel="noopener">{{ r.id }}</a>
            <span class="wt-feedback-report-title">{{ r.title }}</span>
            <span class="wt-pill" :class="outcomeTone(r.outcome)">{{ r.state || 'filed' }}</span>
            <span class="wt-feed-when">{{ ago(r.changed_at || r.filed_at) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
