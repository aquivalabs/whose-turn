<script setup lang="ts">
// Report: one field in the user's words; the server's composer shapes the issue; the list below shows what this machine filed with the state Linear reports.
import { ref, watch, nextTick } from 'vue';
import { refAutoReset } from '@vueuse/core';
import { snapshot, ui } from '../store.ts';
import { getJson, post, problemsOf } from '../lib/api.ts';
import type { ApiError, FiledReport } from '../lib/types.ts';
import { ago } from '../lib/time.ts';
import { outcomeTone } from '../lib/moves.ts';

type ReportLine = Pick<
  FiledReport,
  'id' | 'title' | 'state' | 'outcome' | 'filed_at' | 'changed_at'
>;
interface FeedbackList {
  configured: boolean;
  project?: string;
  reports?: ReportLine[];
}
interface FeedbackReply {
  error?: ApiError;
  issue?: { identifier: string; title: string };
  reports?: ReportLine[];
}

const text = ref('');
const field = ref<HTMLTextAreaElement | null>(null);
const sending = ref(false);
const problems = ref<string[]>([]);
const done = ref<{ identifier: string; title: string } | null>(null);
const project = ref('');
const configured = ref(true);
const copied = refAutoReset<'' | 'sent' | 'failed'>('', 1600);
const reports = ref<ReportLine[]>([]);
const reportPage = (id: string) => '/report?id=' + encodeURIComponent(id);
const load = () =>
  getJson<FeedbackList>('/api/feedback').then((list) => {
    configured.value = list.configured;
    project.value = list.configured ? 'Linear · ' + list.project : 'not connected';
    reports.value = list.reports || [];
  });
const close = () => {
  ui.feedback = false;
};
const copy = () => {
  const remark = text.value.trim();
  if (!remark) {
    problems.value = ['Write at least one line.'];
    return;
  }
  problems.value = [];
  navigator.clipboard.writeText(remark).then(
    () => {
      copied.value = 'sent';
    },
    () => {
      copied.value = 'failed';
    },
  );
};
const send = () => {
  if (!configured.value || sending.value) {
    return;
  }
  const remark = text.value.trim();
  if (!remark) {
    problems.value = ['Write at least one line.'];
    return;
  }
  sending.value = true;
  post<FeedbackReply>('/api/feedback', {
    text: remark,
    from: 'the window',
    ws: snapshot.workspace.id,
    kind_ref: { kind: 'workspace', ref: snapshot.workspace.id },
  })
    .then((reply) => {
      sending.value = false;
      if (reply.error) {
        problems.value = problemsOf(reply.error);
        return;
      }
      done.value = reply.issue || null;
      text.value = '';
      reports.value = reply.reports || reports.value;
    })
    .catch(() => {
      sending.value = false;
      problems.value = ['The monitor did not answer.'];
    });
};
watch(
  () => ui.feedback,
  (open) => {
    if (open) {
      problems.value = [];
      done.value = null;
      load().then(() => nextTick(() => field.value?.focus()));
    }
  },
);
</script>
<template>
  <div
    v-if="ui.feedback"
    class="wt-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="feedback-title"
    @click.self="close"
  >
    <div class="wt-modal-card wt-feedback-card">
      <div class="wt-modal-head">
        <h3 id="feedback-title">To the Whose Turn backlog</h3>
        <span class="wt-modal-meta">{{ project }}</span>
        <span
          class="wt-btn tonal"
          role="button"
          tabindex="0"
          :aria-disabled="!configured || sending"
          @click="send"
          @keydown.enter.prevent="send"
          >{{ sending ? 'Composing…' : 'Send' }}</span
        >
        <span
          class="wt-btn"
          role="button"
          tabindex="0"
          @click="close"
          @keydown.enter.prevent="close"
          >Close</span
        >
      </div>
      <div v-if="problems.length" class="wt-alert">{{ problems.join('  ·  ') }}</div>
      <div class="wt-settings-form wt-feedback-form">
        <textarea
          ref="field"
          v-model="text"
          class="wt-input wt-feedback-text"
          rows="5"
          :placeholder="
            'Describe the problem or the wish in your own words.' +
            (configured ? ' Cmd+Enter sends.' : '')
          "
          autocomplete="off"
          @keydown.meta.enter.prevent="send"
          @keydown.ctrl.enter.prevent="send"
        ></textarea>
        <p v-if="!configured" class="wt-feedback-note">
          The maintainer's tracker is not connected on this machine, so nothing can be sent from
          here. Copy your remark and pass it on yourself.
          <span
            class="wt-btn"
            role="button"
            tabindex="0"
            @click="copy"
            @keydown.enter.prevent="copy"
            >{{
              copied === 'sent' ? 'Copied' : copied === 'failed' ? 'Could not copy' : 'Copy remark'
            }}</span
          >
        </p>
        <p v-else class="wt-feedback-note">
          An assistant turns it into a proper issue (title, kind, description) and files it in the
          Whose Turn backlog with this workspace's summary attached.
        </p>
        <p v-if="done" class="wt-empty">
          Filed as
          <a :href="reportPage(done.identifier)" target="_blank" rel="noopener">{{
            done.identifier
          }}</a>
          · {{ done.title }}
        </p>
        <div v-if="reports.length" class="wt-feedback-reports">
          <h4>Your reports</h4>
          <div v-for="report in reports" :key="report.id" class="wt-feedback-report">
            <a :href="reportPage(report.id)" target="_blank" rel="noopener">{{ report.id }}</a>
            <span class="wt-feedback-report-title">{{ report.title }}</span>
            <span class="wt-pill" :class="outcomeTone(report.outcome)">{{
              report.state || 'filed'
            }}</span>
            <span class="wt-feed-when">{{ ago(report.changed_at || report.filed_at) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
