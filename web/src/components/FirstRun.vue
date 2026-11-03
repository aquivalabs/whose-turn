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
  <section id="first-run" class="island first-run" aria-labelledby="first-run-title">
    <h2 id="first-run-title" class="first-run__title">
      Whose Turn watches your tickets and pull requests and shows what is waiting on you.
    </h2>
    <p class="first-run__text">
      <b>{{ snapshot.workspace.name }}</b> has no sources yet, so there is nothing to watch. Connect
      a repository or a tracker, or look around a demo workspace with invented data first.
    </p>
    <div class="first-run__actions">
      <span
        class="btn btn--tonal"
        role="button"
        tabindex="0"
        @click="addSource"
        @keydown.enter.prevent="addSource"
        >Add a source</span
      >
      <span
        class="btn"
        role="button"
        tabindex="0"
        :aria-disabled="busy"
        @click="demo"
        @keydown.enter.prevent="demo"
        >Try a demo workspace</span
      >
    </div>
    <p class="first-run__text first-run__ai">
      Or ask Claude: "add my GitHub repository to Whose Turn."
    </p>
  </section>
</template>
<style scoped>
.first-run {
  display: grid;
  place-self: start center;
  gap: 14px;
  width: min(640px, 100%);
  padding: 28px 32px;
}

.first-run__title {
  margin: 0;
  font-size: 22px;
  font-weight: 400;
  line-height: 28px;
}

.first-run__text {
  margin: 0;
  color: var(--md-on-surface-variant);
}

.first-run__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.first-run__ai {
  font-size: 13px;
}
</style>
