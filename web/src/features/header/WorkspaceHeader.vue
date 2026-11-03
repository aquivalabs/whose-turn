<script setup lang="ts">
// The workspace header: the name, the copy-workspace sparkle, the quick links, and four tiles; it folds to one line with the counts, like every island.
import { snapshot, counts } from '@/store.ts';
import { useFold } from '@/composables/useFold.ts';
import AiButton from '@/ui/AiButton.vue';
import ExtLink from '@/ui/ExtLink.vue';
const { collapsed, toggle } = useFold('header');
</script>
<template>
  <header
    id="summary"
    class="island workspace-header"
    :class="{ 'workspace-header--collapsed': collapsed }"
  >
    <div class="workspace-header__title">
      <h1 class="workspace-header__name">{{ snapshot.workspace.name || 'Whose Turn' }}</h1>
      <p v-if="collapsed" class="workspace-header__line workspace-header__strip">
        Your move <b class="workspace-header__count">{{ counts.mine }}</b> · Waiting on others
        <b class="workspace-header__count">{{ counts.others }}</b> · Failing
        <b class="workspace-header__count">{{ counts.failing }}</b> · Done
        <b class="workspace-header__count">{{ counts.done }}</b>
      </p>
      <p class="workspace-header__line workspace-header__give">
        <AiButton :query="{ ws: snapshot.workspace.id, kind: 'workspace' }" big /><span
          class="ai-hint"
          >Copy for AI: this workspace</span
        >
        <span class="workspace-header__links"
          ><ExtLink
            v-for="link in snapshot.workspace.links || []"
            :key="link.url"
            :text="link.label"
            :url="link.url"
            :title="link.url"
        /></span>
      </p>
    </div>
    <button
      type="button"
      class="fold-toggle workspace-header__fold"
      :class="{ 'fold-toggle--folded': collapsed }"
      aria-label="Fold the header"
      data-tip="Fold the header; it stays folded until you open it again"
      @click.stop="toggle"
    >
      ▾
    </button>
    <div class="workspace-header__tiles">
      <div class="workspace-header__tile workspace-header__tile--you">
        <span class="workspace-header__tile-label">Your move</span
        ><strong class="workspace-header__tile-value">{{ counts.mine }}</strong>
      </div>
      <div class="workspace-header__tile">
        <span class="workspace-header__tile-label">Waiting on others</span
        ><strong class="workspace-header__tile-value">{{ counts.others }}</strong>
      </div>
      <div
        class="workspace-header__tile"
        :class="{ 'workspace-header__tile--fail': counts.failing }"
      >
        <span class="workspace-header__tile-label">Open PRs with failing checks</span
        ><strong class="workspace-header__tile-value">{{ counts.failing }}</strong>
      </div>
      <div class="workspace-header__tile">
        <span class="workspace-header__tile-label">Done in the last 30 days</span
        ><strong class="workspace-header__tile-value">{{ counts.done }}</strong>
      </div>
    </div>
  </header>
</template>
<style scoped>
.workspace-header {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 2fr) 32px;
  gap: 8px;
  padding: 8px;
  background: linear-gradient(135deg, var(--blob-1), var(--blob-2));
  color: var(--header-ink, var(--md-on-primary-container));
}

@media (prefers-reduced-transparency: reduce) {
  .workspace-header {
    background: var(--md-s-low);
  }
}

.workspace-header__title {
  display: grid;
  align-content: center;
  gap: 4px;
  padding: 12px 16px;
}

.workspace-header__name {
  margin: 0;
  font-size: 28px;
  font-weight: 400;
  line-height: 36px;
  color: var(--md-on-primary-container);
}

.workspace-header__line {
  margin: 0;
  font-size: 14px;
  opacity: 0.85;
}

.workspace-header__count {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.workspace-header__give {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.workspace-header__links {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-left: 10px;
}

/* Only a followed link is a chip; a source link that is not https stays plain text. */
.workspace-header__links a {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border: 1px solid var(--glass-edge);
  border-radius: 999px;
  background: rgb(var(--glass), 0.55);
  color: inherit;
  font-size: 12px;
  font-weight: 500;
}

.workspace-header__links a:hover {
  background: rgb(var(--glass), 0.85);
}

.workspace-header__fold {
  grid-row: 1;
  grid-column: 3;
  place-self: center center;
  margin: 0;
  color: inherit;
}

.workspace-header__tiles {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.workspace-header__tile {
  display: grid;
  align-content: start;
  gap: 4px;
  padding: 12px 16px;
  border: 1px solid var(--glass-edge);
  border-radius: var(--md-r-card);
  background: rgb(var(--glass), calc(var(--glass-a) + 0.1));
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  color: var(--md-on-surface);
}

@media (prefers-reduced-transparency: reduce) {
  .workspace-header__tile {
    background: var(--md-s-low);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}

.workspace-header__tile-label {
  color: var(--md-on-surface-variant);
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  letter-spacing: 0.03em;
}

.workspace-header__tile-value {
  min-height: 40px;
  font-size: 32px;
  font-weight: 400;
  line-height: 40px;
  font-variant-numeric: tabular-nums;
}

.workspace-header__tile--you {
  border-color: transparent;
  background: var(--md-primary);
  color: var(--md-on-primary);
}

.workspace-header__tile--you .workspace-header__tile-label {
  color: var(--md-on-primary);
  opacity: 0.85;
}

.workspace-header__tile--fail .workspace-header__tile-value {
  color: var(--md-error);
}

.workspace-header--collapsed {
  grid-template-columns: minmax(0, 1fr) 32px;
  padding: 4px 8px;
}

.workspace-header--collapsed .workspace-header__title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 14px;
  padding: 4px 8px;
}

.workspace-header--collapsed .workspace-header__name {
  font-size: 18px;
  line-height: 28px;
}

.workspace-header--collapsed .workspace-header__tiles,
.workspace-header--collapsed .workspace-header__give {
  display: none;
}

.workspace-header--collapsed .workspace-header__fold {
  grid-column: 2;
}

.workspace-header--collapsed .workspace-header__strip {
  font-size: 13px;
}

@media (width <= 900px) {
  .workspace-header,
  .workspace-header--collapsed {
    grid-template-columns: minmax(0, 1fr) 32px;
  }

  .workspace-header__fold {
    grid-column: 2;
  }

  .workspace-header__tiles {
    grid-column: 1 / -1;
  }
}

@media (width <= 640px) {
  .workspace-header__tiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
