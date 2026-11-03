<script setup lang="ts">
// The workspace header: the name, the counts in words, the copy-workspace sparkle, the quick links, and four tiles.
import { snapshot, counts } from '../store.ts';
import AiButton from './AiButton.vue';
import ExtLink from './ExtLink.vue';
</script>
<template>
  <header id="summary" class="wt-island wt-head">
    <div class="wt-title">
      <h1>{{ snapshot.workspace.name || 'Whose Turn' }}</h1>
      <p>
        <b>{{ counts.mine }}</b> waiting on you, <b>{{ counts.others }}</b> waiting on someone
        else<span v-if="counts.failing"
          >, <b>{{ counts.failing }}</b> failing</span
        >.
      </p>
      <p class="wt-give">
        <AiButton :query="{ ws: snapshot.workspace.id, kind: 'workspace' }" big /><span
          class="wt-give-hint"
          >AI: copy this workspace</span
        >
        <span class="wt-links"
          ><ExtLink
            v-for="link in snapshot.workspace.links || []"
            :key="link.url"
            :text="link.label"
            :url="link.url"
            :title="link.url"
        /></span>
      </p>
    </div>
    <div class="wt-tiles">
      <div class="wt-tile is-you">
        <span>Your move</span><strong>{{ counts.mine }}</strong>
      </div>
      <div class="wt-tile">
        <span>Waiting on others</span><strong>{{ counts.others }}</strong>
      </div>
      <div class="wt-tile is-fail">
        <span>Open PRs with failing checks</span><strong>{{ counts.failing }}</strong>
      </div>
      <div class="wt-tile">
        <span>Done in the last 30 days</span><strong>{{ counts.done }}</strong>
      </div>
    </div>
  </header>
</template>
