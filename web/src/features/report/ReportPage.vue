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
    <p v-if="!report" class="report-page__note">{{ note }}</p>
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
        <p v-else-if="report.answers_hidden" class="empty">
          Answers to reports sent before this version cannot be shown here; the state above stays current.
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
    <a class="report-page__back" href="/">Back to the window</a>
  </main>
</template>
<style scoped>
.report-page {
  box-sizing: border-box;
  height: auto;
  max-width: 45rem;
  margin: 2.5rem auto;
  padding: 1.75rem 2rem;
  border: 1px solid var(--md-outline-variant);
  border-radius: 1rem;
  background: var(--md-surface);
  color: var(--md-on-surface);
  font-family: var(--md-font);
  font-size: 0.875rem;
  line-height: 1.5;
}

.report-page__note {
  margin: 0;
  font-size: 0.9375rem;
}

.report-page__back {
  display: inline-block;
  margin-top: 1.5rem;
  color: var(--md-primary);
}

.report-page__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.report-page__title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.report-page__id {
  color: var(--md-primary);
  font-weight: 700;
}

.report-page__meta {
  margin: 0.375rem 0 1.25rem;
  color: var(--md-on-surface-variant);
  font-size: 0.8125rem;
}

.report-page__heading {
  margin: 1.125rem 0 0.5rem;
  color: var(--md-on-surface-variant);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.report-page__text {
  margin: 0;
  white-space: pre-wrap;
}

.report-page__answer {
  padding: 0.625rem 0;
  border-top: 1px solid var(--md-outline-variant);
}

.report-page__answer-meta {
  margin: 0 0 0.25rem;
  color: var(--md-on-surface-variant);
  font-size: 0.75rem;
}

.report-page__unanswered {
  margin: 0;
  padding: 0.625rem 0.75rem;
  border-radius: 0.5rem;
  background: var(--md-error-container);
  color: var(--md-on-error-container);
  font-weight: 600;
}
</style>
