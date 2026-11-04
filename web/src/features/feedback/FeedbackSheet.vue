<script setup lang="ts">
// Report: one field in the user's words; the server's composer shapes the issue and files it with the maintainer's tracker; the list below shows what this machine filed with the state the tracker reports.
import { computed, ref, watch, nextTick } from 'vue';
import { snapshot, ui } from '@/store.ts';
import { dark } from '@/scheme.ts';
import { getJson, post, problemsOf } from '@/lib/api.ts';
import { SERVER_DOWN, TEXT_KEPT, writeProblem } from '@/lib/problems.ts';
import type { ApiError, FiledReport } from '@/lib/types.ts';
import { describeClient } from '@/lib/client-report.ts';
import { ago } from '@/lib/time.ts';
import { outcomeTone } from '@/lib/moves.ts';
import { modifier } from '@/lib/bem.ts';
import Modal from '@/ui/Modal.vue';

type ReportLine = Pick<
  FiledReport,
  'id' | 'title' | 'state' | 'outcome' | 'filed_at' | 'changed_at' | 'mine'
>;
interface FeedbackList {
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
const reports = ref<ReportLine[]>([]);
const reportPage = (id: string) => '/report?id=' + encodeURIComponent(id);
const load = () =>
  getJson<FeedbackList>('/api/feedback').then(
    (list) => {
      reports.value = list.reports || [];
    },
    () => {
      problems.value = [SERVER_DOWN + '; past reports cannot be loaded.'];
    },
  );
const everyone = computed(() => reports.value.some((report) => report.mine !== undefined));
const close = () => {
  ui.feedback = false;
};
const send = () => {
  if (sending.value) {
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
    client: describeClient({
      navigator,
      screen,
      devicePixelRatio,
      innerWidth,
      innerHeight,
      dark: dark.value,
      mode: ui.mode,
    }),
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
  <Modal
    v-if="ui.feedback"
    title="Report a problem or a wish"
    label-id="feedback-title"
    flush
    card-class="feedback-sheet__card"
    @close="close"
  >
    <template #head>
      <button type="button" class="btn btn--tonal" :aria-disabled="sending" @click="send">
        {{ sending ? 'Composing…' : 'Send' }}
      </button>
    </template>
    <div v-if="problems.length" class="alert">{{ problems.join('  ·  ') }}</div>
    <div class="sheet-form">
      <textarea
        ref="field"
        v-model="text"
        class="input feedback-sheet__text"
        rows="5"
        placeholder="Describe the problem or the wish in your own words. Cmd+Enter sends."
        autocomplete="off"
        @keydown.meta.enter.prevent="send"
        @keydown.ctrl.enter.prevent="send"
      ></textarea>
      <p class="feedback-sheet__note">
        Only what you write, the monitor version and a description of your system are sent: OS and processor type, Node version, how the monitor was installed, browser, screen and window size, language, time zone, light or dark, app or tab, and which kinds of source you use.
      </p>
      <p v-if="done" class="empty">
        Filed as
        <a :href="reportPage(done.identifier)" target="_blank" rel="noopener">{{
          done.identifier
        }}</a>
        · {{ done.title }}
      </p>
      <div v-if="reports.length" class="feedback-sheet__reports">
        <h4 class="sheet-form__heading">{{ everyone ? 'All reports' : 'Your reports' }}</h4>
        <div v-for="report in reports" :key="report.id" class="feedback-sheet__report">
          <a :href="reportPage(report.id)" target="_blank" rel="noopener">{{ report.id }}</a>
          <span class="feedback-sheet__report-title">{{ report.title }}</span>
          <span v-if="report.mine" class="pill">yours</span>
          <span class="pill" :class="modifier('pill', outcomeTone(report.outcome))">{{
            report.state || 'filed'
          }}</span>
          <span class="timestamp">{{ ago(report.changed_at || report.filed_at) }}</span>
        </div>
      </div>
    </div>
  </Modal>
</template>
<style scoped>
:deep(.feedback-sheet__card) {
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
