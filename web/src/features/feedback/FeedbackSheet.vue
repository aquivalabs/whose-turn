<script setup lang="ts">
// Report: one field in the user's words; the server's composer shapes the issue and files it with the maintainer's tracker; the list below shows what this machine filed with the state the tracker reports.
import { AnimatePresence, Motion } from 'motion-v';
import { computed, ref, watch, nextTick } from 'vue';
import { scrollers, snapshot, ui } from '@/store.ts';
import { dark } from '@/scheme.ts';
import { getJson, post, problemsOf } from '@/lib/api.ts';
import { SERVER_DOWN, TEXT_KEPT, writeProblem } from '@/lib/problems.ts';
import type { ApiError, FiledReport } from '@/lib/types.ts';
import { describeClient } from '@/lib/client-report.ts';
import { describeWindow, recentApiFailures } from '@/lib/window-report.ts';
import { fold } from '@/motion.ts';
import { ago } from '@/lib/time.ts';
import { outcomeTone } from '@/lib/moves.ts';
import { modifier } from '@/lib/bem.ts';
import { useText } from '@/i18n/index.ts';
import Modal from '@/ui/Modal.vue';

type ReportLine = Pick<
  FiledReport,
  'id' | 'title' | 'state' | 'outcome' | 'filed_at' | 'changed_at' | 'mine'
>;
interface FeedbackList {
  reports?: ReportLine[];
}
interface FeedbackPreview {
  error?: ApiError;
  preview?: { environment: object; diagnostics: object };
  preview_token?: string;
}
interface FeedbackReply {
  error?: ApiError;
  issue?: { identifier: string; title: string };
  reports?: ReportLine[];
}

const t = useText();
const text = ref('');
const field = ref<HTMLTextAreaElement | null>(null);
const sending = ref(false);
const problems = ref<string[]>([]);
const done = ref<{ identifier: string; title: string } | null>(null);
const reports = ref<ReportLine[]>([]);
const preview = ref<FeedbackPreview['preview'] | null>(null);
const previewToken = ref('');
const showPayload = ref(false);
const reportPage = (id: string) => '/report?id=' + encodeURIComponent(id);
const describeHere = () => ({
  client: describeClient({
    navigator,
    screen,
    devicePixelRatio,
    innerWidth,
    innerHeight,
    dark: dark.value,
    mode: ui.mode,
  }),
  window: describeWindow({
    layers: ui,
    fontPx: parseFloat(getComputedStyle(document.documentElement).fontSize) || 0,
    consoleErrors: ui.consoleErrors,
    reconnects: ui.reconnects,
    lastEventAt: ui.lastEventAt,
    now: Date.now(),
    apiFailures: recentApiFailures(),
    boxes: { your_move: scrollers.your_move ?? null, waiting: scrollers.waiting ?? null, feed: scrollers.feed ?? null },
  }),
});
const described = ref<ReturnType<typeof describeHere> | null>(null);
const loadPreview = () => {
  const here = describeHere();
  described.value = here;
  return post<FeedbackPreview>('/api/feedback', { preview: true, from: 'the window', ws: snapshot.workspace.id, ...here }).then(
    (reply) => {
      preview.value = reply.preview || null;
      previewToken.value = reply.preview_token || '';
    },
    () => {
      preview.value = null;
    },
  );
};
const load = () =>
  getJson<FeedbackList>('/api/feedback').then(
    (list) => {
      reports.value = list.reports || [];
    },
    () => {
      problems.value = [t('feedback.problem.pastReports', { down: SERVER_DOWN })];
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
    problems.value = [t('feedback.problem.empty')];
    return;
  }
  sending.value = true;
  post<FeedbackReply>('/api/feedback', {
    text: remark,
    from: 'the window',
    ws: snapshot.workspace.id,
    preview_token: previewToken.value || undefined,
    ...(described.value ?? describeHere()),
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
      problems.value = [writeProblem(failure, { refused: t('feedback.problem.notSent'), unreachable: TEXT_KEPT })];
    });
};
watch(
  () => ui.feedback,
  (open) => {
    if (open) {
      ui.reportNews = false;
      problems.value = [];
      done.value = null;
      showPayload.value = false;
      described.value = null;
      loadPreview();
      load().then(() => nextTick(() => field.value?.focus()));
    }
  },
);
</script>
<template>
  <AnimatePresence>
    <Modal
      v-if="ui.feedback"
      :title="t('feedback.title')"
      label-id="feedback-title"
      flush
      card-class="feedback-sheet__card"
      @close="close"
    >
      <template #head>
        <button type="button" class="btn btn--tonal" :aria-disabled="sending" @click="send">
          {{ sending ? t('feedback.composing') : t('feedback.send') }}
        </button>
      </template>
      <div v-if="problems.length" class="alert">{{ problems.join('  ·  ') }}</div>
      <div class="sheet-form">
        <textarea
          ref="field"
          v-model="text"
          class="input feedback-sheet__text"
          rows="5"
          :placeholder="t('feedback.placeholder')"
          autocomplete="off"
          @keydown.meta.enter.prevent="send"
          @keydown.ctrl.enter.prevent="send"
        ></textarea>
        <p class="feedback-sheet__note">
          {{ t('feedback.note') }}
          <button
            v-if="preview"
            type="button"
            class="feedback-sheet__payload-toggle"
            :aria-expanded="showPayload"
            @click="showPayload = !showPayload"
          >
            {{ showPayload ? t('feedback.hidePayload') : t('feedback.showPayload') }}
          </button>
        </p>
        <AnimatePresence>
          <Motion v-if="showPayload && preview" v-bind="fold" as="pre" class="feedback-sheet__payload">{{
            JSON.stringify(preview, null, 2)
          }}</Motion>
        </AnimatePresence>
        <p v-if="done" class="empty">
          {{ t('feedback.filedAs') }}
          <a :href="reportPage(done.identifier)" target="_blank" rel="noopener">{{
            done.identifier
          }}</a>
          · {{ done.title }}
        </p>
        <div v-if="reports.length" class="feedback-sheet__reports">
          <h4 class="sheet-form__heading">{{ everyone ? t('feedback.allReports') : t('feedback.yourReports') }}</h4>
          <div v-for="report in reports" :key="report.id" class="feedback-sheet__report">
            <a :href="reportPage(report.id)" target="_blank" rel="noopener">{{ report.id }}</a>
            <span class="feedback-sheet__report-title">{{ report.title }}</span>
            <span v-if="report.mine" class="pill">{{ t('feedback.yours') }}</span>
            <span class="pill" :class="modifier('pill', outcomeTone(report.outcome))">{{
              report.state || t('feedback.filed')
            }}</span>
            <span class="timestamp">{{ ago(report.changed_at || report.filed_at) }}</span>
          </div>
        </div>
      </div>
    </Modal>
  </AnimatePresence>
</template>
<style scoped>
:deep(.feedback-sheet__card) {
  width: min(40rem, 100%);
}

.feedback-sheet__text {
  min-height: 7rem;
  resize: vertical;
}

.feedback-sheet__note {
  margin: 0;
  color: var(--md-on-surface-variant);
  font-size: 0.75rem;
}

.feedback-sheet__payload-toggle {
  padding: 0;
  border: 0;
  background: none;
  color: var(--md-primary);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.feedback-sheet__payload {
  max-height: 16rem;
  margin: 0;
  overflow: auto;
  padding: 0.5rem;
  border-radius: var(--md-r-chip);
  background: var(--md-s-high);
  font-size: 0.75rem;
}

.feedback-sheet__report {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.25rem 0;
  border-top: 1px solid var(--md-outline-variant);
  font-size: 0.8125rem;
}

.feedback-sheet__report-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
