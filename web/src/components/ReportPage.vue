<script setup lang="ts">
// The reporter's page: one issue filed from this machine, its state, and the maintainer's answers. Everything from the server is rendered as text.
import { ref, onMounted } from 'vue';
import { getJson } from '../lib/api.ts';
import { SERVER_DOWN } from '../lib/problems.ts';
import { when } from '../lib/time.ts';
import { outcomeTone } from '../lib/moves.ts';
import type { FiledReport } from '../lib/types.ts';
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
  <main class="wt-app wt-report-page">
    <p v-if="!report" class="wt-empty">{{ note }}</p>
    <template v-else>
      <header class="wt-report-head">
        <span class="wt-report-id">{{ report.id }}</span>
        <h1>{{ report.title }}</h1>
        <span class="wt-pill" :class="outcomeTone(report.outcome)">{{
          report.state || 'filed, not yet seen'
        }}</span>
      </header>
      <p class="wt-report-meta">
        {{ report.kind || 'report' }} · filed {{ when(report.filed_at)
        }}<template v-if="report.changed_at"> · last change {{ when(report.changed_at) }}</template>
      </p>
      <section class="wt-report-section">
        <h2>What you reported</h2>
        <p class="wt-report-text">{{ report.body || '(no text kept)' }}</p>
      </section>
      <section class="wt-report-section">
        <h2>Answers</h2>
        <p v-if="report.unanswered" class="wt-report-unanswered">
          Closed without an answer. The maintainer owes you a reason; this page will show it once it
          is written.
        </p>
        <p v-else-if="!report.answers.length" class="wt-empty">No answer yet.</p>
        <article v-for="(answer, index) in report.answers" :key="index" class="wt-report-answer">
          <p class="wt-report-answer-meta">
            {{ answer.by || 'maintainer' }} · {{ when(answer.at) }}
          </p>
          <p class="wt-report-text">{{ answer.text }}</p>
        </article>
      </section>
    </template>
  </main>
</template>
