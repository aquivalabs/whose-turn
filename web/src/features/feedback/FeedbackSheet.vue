<script setup lang="ts">
// Report: one field in the user's words; the server's composer shapes the issue; the list below shows what this machine filed with the state Linear reports.
import { ref, watch, nextTick } from 'vue';
import { refAutoReset } from '@vueuse/core';
import { snapshot, ui } from '@/store.ts';
import { getJson, post, problemsOf } from '@/lib/api.ts';
import { SERVER_DOWN, TEXT_KEPT, writeProblem } from '@/lib/problems.ts';
import type { ApiError, FiledReport } from '@/lib/types.ts';
import { ago } from '@/lib/time.ts';
import { outcomeTone } from '@/lib/moves.ts';
import { modifier } from '@/lib/bem.ts';

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
  getJson<FeedbackList>('/api/feedback').then(
    (list) => {
      configured.value = list.configured;
      project.value = list.configured ? 'Linear · ' + list.project : 'not connected';
      reports.value = list.reports || [];
    },
    () => {
      problems.value = [SERVER_DOWN + '; past reports cannot be loaded.'];
    },
  );
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
    .catch((failure: Error) => {
      sending.value = false;
      problems.value = [writeProblem(failure, { refused: 'Not sent', unreachable: TEXT_KEPT })];
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
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="feedback-title"
    @click.self="close"
  >
    <div class="modal__card feedback-sheet__card">
      <div class="modal__head">
        <h3 id="feedback-title" class="modal__title">To the Whose Turn backlog</h3>
        <span class="modal__meta">{{ project }}</span>
        <span
          class="btn btn--tonal"
          role="button"
          tabindex="0"
          :aria-disabled="!configured || sending"
          @click="send"
          @keydown.enter.prevent="send"
          >{{ sending ? 'Composing…' : 'Send' }}</span
        >
        <span class="btn" role="button" tabindex="0" @click="close" @keydown.enter.prevent="close"
          >Close</span
        >
      </div>
      <div v-if="problems.length" class="alert">{{ problems.join('  ·  ') }}</div>
      <div class="sheet-form">
        <textarea
          ref="field"
          v-model="text"
          class="input feedback-sheet__text"
          rows="5"
          :placeholder="
            'Describe the problem or the wish in your own words.' +
            (configured ? ' Cmd+Enter sends.' : '')
          "
          autocomplete="off"
          @keydown.meta.enter.prevent="send"
          @keydown.ctrl.enter.prevent="send"
        ></textarea>
        <p v-if="!configured" class="feedback-sheet__note">
          The maintainer's tracker is not connected on this machine, so nothing can be sent from
          here. Copy your remark and pass it on yourself.
          <span
            class="btn"
            role="button"
            tabindex="0"
            @click="copy"
            @keydown.enter.prevent="copy"
            >{{
              copied === 'sent' ? 'Copied' : copied === 'failed' ? 'Could not copy' : 'Copy remark'
            }}</span
          >
        </p>
        <p v-else class="feedback-sheet__note">
          An assistant turns it into a proper issue (title, kind, description) and files it in the
          Whose Turn backlog with this workspace's summary attached.
        </p>
        <p v-if="done" class="empty">
          Filed as
          <a :href="reportPage(done.identifier)" target="_blank" rel="noopener">{{
            done.identifier
          }}</a>
          · {{ done.title }}
        </p>
        <div v-if="reports.length" class="feedback-sheet__reports">
          <h4 class="sheet-form__heading">Your reports</h4>
          <div v-for="report in reports" :key="report.id" class="feedback-sheet__report">
            <a :href="reportPage(report.id)" target="_blank" rel="noopener">{{ report.id }}</a>
            <span class="feedback-sheet__report-title">{{ report.title }}</span>
            <span class="pill" :class="modifier('pill', outcomeTone(report.outcome))">{{
              report.state || 'filed'
            }}</span>
            <span class="timestamp">{{ ago(report.changed_at || report.filed_at) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped>
.feedback-sheet__card {
  width: min(640px, 100%);
}

.feedback-sheet__text {
  min-height: 7rem;
  resize: vertical;
}

.feedback-sheet__note {
  margin: 0;
  color: var(--md-on-surface-variant);
  font-size: 12px;
}

.feedback-sheet__report {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 0;
  border-top: 1px solid var(--md-outline-variant);
  font-size: 13px;
}

.feedback-sheet__report-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
