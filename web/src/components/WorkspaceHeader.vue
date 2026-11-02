<script setup>
// The workspace header: the name, the counts in words, the copy-workspace sparkle, the quick links, and four tiles.
import { computed } from 'vue';
import { S } from '../store.js';
import { yourRows, waitingRows } from '../lib/moves.js';
import AiButton from './AiButton.vue';
import ExtLink from './ExtLink.vue';
const mine = computed(() => yourRows(S.turn, S.marks, 'open').open);
const others = computed(() => waitingRows(S.turn).length);
const failing = computed(() => S.turn.filter((r) => r.pr_state === 'OPEN' && r.checks === 'failing').length);
const done = computed(() => S.turn.filter((r) => r.group === 'done').length);
</script>
<template>
  <header class="wt-island wt-head" id="summary">
    <div class="wt-title">
      <h1>{{ S.workspace.name || 'Whose Turn' }}</h1>
      <p><b>{{ mine }}</b> waiting on you, <b>{{ others }}</b> waiting on someone else<span v-if="failing">, <b>{{ failing }}</b> failing</span>.</p>
      <p class="wt-give">
        <AiButton :query="{ ws: S.workspace.id, kind: 'workspace' }" big /><span class="wt-give-hint">AI: copy this workspace</span>
        <span class="wt-links"><ExtLink v-for="l in S.workspace.links || []" :key="l.url" :text="l.label" :url="l.url" :title="l.url" /></span>
      </p>
    </div>
    <div class="wt-tiles">
      <div class="wt-tile is-you"><span>Your move</span><strong>{{ mine }}</strong></div>
      <div class="wt-tile"><span>Waiting on others</span><strong>{{ others }}</strong></div>
      <div class="wt-tile is-fail"><span>Open PRs with failing checks</span><strong>{{ failing }}</strong></div>
      <div class="wt-tile"><span>Done in the last 30 days</span><strong>{{ done }}</strong></div>
    </div>
  </header>
</template>
