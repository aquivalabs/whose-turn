<script setup lang="ts">
// The first-run card for a workspace without sources: what the window does, and the ways to give it something to watch.
import { ref } from 'vue';
import { snapshot, openSettings, tryDemo } from '../store.ts';
const busy = ref(false);
const addSource = () => openSettings('connectors');
const demo = () => {
  if (busy.value) {
    return;
  }
  busy.value = true;
  tryDemo().finally(() => {
    busy.value = false;
  });
};
</script>
<template>
  <section id="first-run" class="wt-island wt-first-run" aria-labelledby="first-run-title">
    <h2 id="first-run-title">
      Whose Turn watches your tickets and pull requests and shows what is waiting on you.
    </h2>
    <p>
      <b>{{ snapshot.workspace.name }}</b> has no sources yet, so there is nothing to watch. Connect
      a repository or a tracker, or look around a demo workspace with invented data first.
    </p>
    <div class="wt-first-run-actions">
      <span
        class="wt-btn tonal"
        role="button"
        tabindex="0"
        @click="addSource"
        @keydown.enter.prevent="addSource"
        >Add a source</span
      >
      <span
        class="wt-btn"
        role="button"
        tabindex="0"
        :aria-disabled="busy"
        @click="demo"
        @keydown.enter.prevent="demo"
        >Try a demo workspace</span
      >
    </div>
    <p class="wt-first-run-ai">Or ask Claude: "add my GitHub repository to Whose Turn."</p>
  </section>
</template>
