<script setup lang="ts">
import { useTemplateRef } from 'vue';
import { snapshot, counts, openSettings } from '@/store.ts';
import { glideThrough } from '@/motion.ts';
import { GEAR } from '@/lib/icons.ts';
import { useFold } from '@/composables/useFold.ts';
import AiButton from '@/ui/AiButton.vue';
import ExtLink from '@/ui/ExtLink.vue';
const { collapsed, toggle: flip } = useFold('header');
const header = useTemplateRef<HTMLElement>('header');
const toggle = () => glideThrough(header.value, 'height', flip);
</script>
<template>
  <header
    id="summary"
    ref="header"
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
    <div class="workspace-header__tools">
      <button
        type="button"
        class="fold-toggle workspace-header__settings"
        aria-label="Workspace settings"
        data-tip="Workspace settings: this workspace's name and links, its look, sources and rules"
        @click.stop="openSettings()"
      >
        <svg viewBox="0 0 24 24" class="workspace-header__gear" aria-hidden="true">
          <path :d="GEAR" fill="currentColor" />
        </svg>
      </button>
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
    </div>
    <div class="workspace-header__tiles">
      <div
        class="workspace-header__tile"
        :class="{ 'workspace-header__tile--you': counts.mine > 0 }"
      >
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
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 2fr) 2rem;
  gap: 0.5rem;
  padding: 0.5rem;
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
  gap: 0.25rem;
  padding: 0.75rem 1rem;
}

.workspace-header__name {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 400;
  line-height: 2.25rem;
  color: var(--md-on-primary-container);
}

.workspace-header__line {
  margin: 0;
  font-size: 0.875rem;
  opacity: 0.85;
}

.workspace-header__count {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.workspace-header__give {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  margin-top: 0.5rem;
  white-space: nowrap;
}

.workspace-header__links {
  display: inline-flex;
  gap: 0.375rem;
}

/* Only a followed link is a chip; a source link that is not https stays plain text. */
.workspace-header__links a {
  display: inline-flex;
  align-items: center;
  height: 1.5rem;
  padding: 0 0.625rem;
  border: 1px solid var(--glass-edge);
  border-radius: 62.4375rem;
  background: rgb(var(--glass), 0.55);
  color: inherit;
  font-size: 0.75rem;
  font-weight: 500;
}

.workspace-header__links a:hover {
  background: rgb(var(--glass), 0.85);
}

.workspace-header__tools {
  grid-row: 1;
  grid-column: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.workspace-header__fold,
.workspace-header__settings {
  margin: 0;
  color: inherit;
}

.workspace-header__gear {
  width: 1.125rem;
  height: 1.125rem;
}

.workspace-header__tiles {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
}

.workspace-header__tile {
  display: grid;
  align-content: start;
  gap: 0.25rem;
  padding: 0.75rem 1rem;
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
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1rem;
  letter-spacing: 0.03em;
}

.workspace-header__tile-value {
  min-height: 2.5rem;
  font-size: 2rem;
  font-weight: 400;
  line-height: 2.5rem;
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
  grid-template-columns: minmax(0, 1fr) auto;
  padding: 0.25rem 0.5rem;
}

.workspace-header--collapsed .workspace-header__title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.875rem;
  padding: 0.25rem 0.5rem;
}

.workspace-header--collapsed .workspace-header__name {
  font-size: 1.125rem;
  line-height: 1.75rem;
}

.workspace-header--collapsed .workspace-header__tiles,
.workspace-header--collapsed .workspace-header__give {
  display: none;
}

.workspace-header--collapsed .workspace-header__tools {
  grid-column: 2;
  flex-direction: row;
  align-items: center;
}

.workspace-header--collapsed .workspace-header__strip {
  font-size: 0.8125rem;
}

@media (width <= 56.25em) {
  .workspace-header,
  .workspace-header--collapsed {
    grid-template-columns: minmax(0, 1fr) 2rem;
  }

  .workspace-header__tools {
    grid-column: 2;
  }

  .workspace-header__tiles {
    grid-column: 1 / -1;
  }
}

@media (width <= 40em) {
  .workspace-header__tiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
