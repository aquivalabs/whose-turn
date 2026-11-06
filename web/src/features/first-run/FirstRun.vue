<script setup lang="ts">
// The first-run card for a workspace without sources: what the window does, and how to give it something to watch.
import { snapshot, openSettings } from '@/store.ts';
const addSource = () => openSettings('connectors');
</script>
<template>
  <section id="first-run" class="island first-run" aria-labelledby="first-run-title">
    <h2 id="first-run-title" class="first-run__title">
      Whose Turn watches your tickets and pull requests and shows what is waiting on you.
    </h2>
    <p class="first-run__text">
      <b>{{ snapshot.workspace.name }}</b> has no sources yet, so there is nothing to watch. Connect
      a repository or a tracker.
    </p>
    <div class="first-run__actions">
      <button type="button" class="btn btn--tonal" @click="addSource">Add a source</button>
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
  gap: 0.875rem;
  width: min(40rem, 100%);
  padding: 1.75rem 2rem;
}

.first-run__title {
  margin: 0;
  font-size: 1.375rem;
  font-weight: 400;
  line-height: 1.75rem;
}

.first-run__text {
  margin: 0;
  color: var(--md-on-surface-variant);
}

.first-run__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.first-run__ai {
  font-size: 0.8125rem;
}
</style>
