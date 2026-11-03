<script setup lang="ts">
// The workspace header: the name, the counts in words, the copy-workspace sparkle, the quick links, and four tiles; it folds to one line with the counts, like every island.
import { snapshot, counts } from '../store.ts';
import { useFold } from '../composables/useFold.ts';
import AiButton from './AiButton.vue';
import ExtLink from './ExtLink.vue';
const { collapsed, toggle } = useFold('header');
</script>
<template>
  <header id="summary" class="wt-island wt-head" :class="{ 'is-collapsed': collapsed }">
    <div class="wt-title">
      <h1>{{ snapshot.workspace.name || 'Whose Turn' }}</h1>
      <p class="wt-sentence">
        <b>{{ counts.mine }}</b> waiting on you, <b>{{ counts.others }}</b> waiting on someone
        else<span v-if="counts.failing"
          >, <b>{{ counts.failing }}</b> failing</span
        >.
      </p>
      <p v-if="collapsed" class="wt-strip">
        Your move <b>{{ counts.mine }}</b> · Waiting on others <b>{{ counts.others }}</b> · Failing
        <b>{{ counts.failing }}</b> · Done <b>{{ counts.done }}</b>
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
    <span
      class="wt-collapse"
      role="button"
      tabindex="0"
      aria-label="Collapse or expand header"
      data-tip="Fold the header; it stays folded until you open it again"
      @click.stop="toggle"
      @keydown.enter.prevent="toggle"
      @keydown.space.prevent="toggle"
      >▾</span
    >
    <div class="wt-tiles">
      <div class="wt-tile is-you">
        <span>Your move</span><strong>{{ counts.mine }}</strong>
      </div>
      <div class="wt-tile">
        <span>Waiting on others</span><strong>{{ counts.others }}</strong>
      </div>
      <div class="wt-tile" :class="{ 'is-fail': counts.failing }">
        <span>Open PRs with failing checks</span><strong>{{ counts.failing }}</strong>
      </div>
      <div class="wt-tile">
        <span>Done in the last 30 days</span><strong>{{ counts.done }}</strong>
      </div>
    </div>
  </header>
</template>
