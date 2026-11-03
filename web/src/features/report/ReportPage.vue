<script setup lang="ts">
// The reporter's page: one issue filed from this machine, its state, and the maintainer's answers. Everything from the server is rendered as text.
import { ref, onMounted } from 'vue';
import { getJson } from '@/lib/api.ts';
import { SERVER_DOWN } from '@/lib/problems.ts';
import { when } from '@/lib/time.ts';
import { outcomeTone } from '@/lib/moves.ts';
import { modifier } from '@/lib/bem.ts';
import type { FiledReport } from '@/lib/types.ts';
const id = new URLSearchParams(location.search).get('id') || '';
const report = ref<FiledReport | null>(null);
const note = ref(id ? 'Loading…' : 'No report id in the link.');
onMounted(() => {
  if (!id) {
    return;
  }
  document.title = id + ' · Your report · Whose Turn';
  getJson<{ report?: FiledReport }>('/api/feedback?id=' + encodeURIComponent(id))
    .then((reply) => {
      report.value = reply.report || null;
      note.value = reply.report ? '' : 'No report ' + id + ' was filed from this machine.';
    })
    .catch(() => {
      note.value = SERVER_DOWN + '; reload this page once it is back.';
    });
});
</script>
<template>
  <main class="app report-page">
    <p v-if="!report" class="empty">{{ note }}</p>
    <template v-else>
      <header class="report-page__head">
        <span class="report-page__id">{{ report.id }}</span>
        <h1 class="report-page__title">{{ report.title }}</h1>
        <span class="pill" :class="modifier('pill', outcomeTone(report.outcome))">{{
          report.state || 'filed, not yet seen'
        }}</span>
      </header>
      <p class="report-page__meta">
        {{ report.kind || 'report' }} · filed {{ when(report.filed_at)
        }}<template v-if="report.changed_at"> · last change {{ when(report.changed_at) }}</template>
      </p>
      <section class="report-page__section">
        <h2 class="report-page__heading">What you reported</h2>
        <p class="report-page__text">{{ report.body || '(no text kept)' }}</p>
      </section>
      <section class="report-page__section">
        <h2 class="report-page__heading">Answers</h2>
        <p v-if="report.unanswered" class="report-page__unanswered">
          Closed without an answer. The maintainer owes you a reason; this page will show it once it
          is written.
        </p>
        <p v-else-if="!report.answers.length" class="empty">No answer yet.</p>
        <article v-for="(answer, index) in report.answers" :key="index" class="report-page__answer">
          <p class="report-page__answer-meta">
            {{ answer.by || 'maintainer' }} · {{ when(answer.at) }}
          </p>
          <p class="report-page__text">{{ answer.text }}</p>
        </article>
      </section>
    </template>
  </main>
</template>
<style scoped>
.report-page {
  box-sizing: border-box;
  max-width: 720px;
  margin: 40px auto;
  padding: 28px 32px;
  border: 1px solid var(--md-outline-variant);
  border-radius: 16px;
  background: var(--md-surface);
  color: var(--md-on-surface);
  font-family: var(--md-font);
  font-size: 14px;
  line-height: 1.5;
}

.report-page__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.report-page__title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.report-page__id {
  color: var(--md-primary);
  font-weight: 700;
}

.report-page__meta {
  margin: 6px 0 20px;
  color: var(--md-on-surface-variant);
  font-size: 13px;
}

.report-page__heading {
  margin: 18px 0 8px;
  color: var(--md-on-surface-variant);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.report-page__text {
  margin: 0;
  white-space: pre-wrap;
}

.report-page__answer {
  padding: 10px 0;
  border-top: 1px solid var(--md-outline-variant);
}

.report-page__answer-meta {
  margin: 0 0 4px;
  color: var(--md-on-surface-variant);
  font-size: 12px;
}

.report-page__unanswered {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--md-error-container);
  color: var(--md-on-error-container);
  font-weight: 600;
}
</style>
