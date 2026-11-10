<script setup lang="ts">
import { useTemplateRef } from 'vue';
import { computed } from 'vue';
import { snapshot, counts, openSettings, noDataText, allSourcesDown } from '@/store.ts';
import { glideThrough } from '@/motion.ts';
import { GEAR, ARROW_FORWARD, CLOCK, CROSS, CHECK } from '@/lib/icons.ts';
import { useFold } from '@/composables/useFold.ts';
import AiButton from '@/ui/AiButton.vue';
import ExtLink from '@/ui/ExtLink.vue';
import { useText } from '@/i18n/index.ts';
const t = useText();
const DASH = '—';
const shown = (value: number) => (allSourcesDown.value ? DASH : value);
const dashTip = computed(() => noDataText('header.noData') || undefined);
const tiles = computed(() => [
  { key: 'mine', icon: ARROW_FORWARD, hue: 'var(--md-primary)', label: t('header.tiles.yourMove'), value: shown(counts.value.mine), tip: dashTip.value, lit: counts.value.mine > 0 && !allSourcesDown.value },
  { key: 'others', icon: CLOCK, hue: 'var(--sys-indigo)', label: t('header.tiles.waitingOnOthers'), value: shown(counts.value.others), tip: dashTip.value, lit: false },
  { key: 'failing', icon: CROSS, hue: 'var(--sys-red)', label: t('header.tiles.failing'), value: counts.value.failing, tip: undefined, lit: counts.value.failing > 0 },
  { key: 'done', icon: CHECK, hue: 'var(--sys-green)', label: t('header.tiles.done'), value: shown(counts.value.done), tip: dashTip.value, lit: false },
]);
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
      <h1 class="workspace-header__name">{{ snapshot.workspace.name || t('header.fallbackName') }}</h1>
      <p v-if="collapsed" class="workspace-header__line workspace-header__strip">
        {{ t('header.tiles.yourMove') }} <b class="workspace-header__count">{{ shown(counts.mine) }}</b> ·
        {{ t('header.tiles.waitingOnOthers') }}
        <b class="workspace-header__count">{{ shown(counts.others) }}</b> · {{ t('header.strip.failing') }}
        <b class="workspace-header__count">{{ counts.failing }}</b> · {{ t('header.strip.done') }}
        <b class="workspace-header__count">{{ shown(counts.done) }}</b>
      </p>
      <p class="workspace-header__line workspace-header__give">
        <AiButton :query="{ ws: snapshot.workspace.id, kind: 'workspace' }" big /><span
          class="ai-hint"
          >{{ t('header.copyForAi') }}</span
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
        :aria-label="t('header.settings')"
        :data-tip="t('header.settingsTip')"
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
        :aria-label="t('header.fold')"
        :data-tip="t('header.foldTip')"
        @click.stop="toggle"
      >
        ▾
      </button>
    </div>
    <div class="workspace-header__tiles">
      <div
        v-for="tile in tiles"
        :key="tile.key"
        class="workspace-header__tile"
        :class="{ 'workspace-header__tile--lit': tile.lit, 'workspace-header__tile--hero': tile.key === 'mine' }"
        :style="{ '--tile-hue': tile.hue }"
      >
        <span class="workspace-header__tile-icon" aria-hidden="true"
          ><svg viewBox="0 0 24 24"><path :d="tile.icon" fill="currentColor" /></svg
        ></span>
        <strong class="workspace-header__tile-value" :data-tip="tile.tip">{{ tile.value }}</strong>
        <span class="workspace-header__tile-label">{{ tile.label }}</span>
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
  background: linear-gradient(135deg, var(--header-1, var(--blob-1)), var(--header-2, var(--blob-2)));
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

/* AGENTS.md § Hard rules: only https links are followed. */
.workspace-header__links a {
  display: inline-flex;
  align-items: center;
  height: 1.5rem;
  padding: 0 0.625rem;
  color: inherit;
  font-size: 0.75rem;
  font-weight: 500;
  opacity: 0.8;
}

.workspace-header__links a:hover {
  opacity: 1;
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
  width: 2rem;
  height: 2rem;
  margin: 0;
  background: color-mix(in oklab, var(--md-on-primary-container) 8%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--md-on-primary-container) 20%, transparent);
  color: var(--md-on-primary-container);
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
  grid-template-columns: auto 1fr;
  grid-template-areas: 'icon value' 'label label';
  align-items: center;
  gap: 0.375rem 0.5rem;
  padding: 0.625rem 0.875rem 0.75rem;
  border: 1px solid var(--glass-edge);
  border-radius: var(--r-tile);
  background: rgb(var(--glass), calc(var(--glass-a) + 0.1));
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
  box-shadow: inset 0 1px 0 var(--glass-hi);
  color: var(--md-on-surface);
}

@media (prefers-reduced-transparency: reduce) {
  .workspace-header__tile {
    background: var(--md-s-low);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}

.workspace-header__tile-icon {
  display: grid;
  grid-area: icon;
  place-items: center;
  width: 1.875rem;
  height: 1.875rem;
  border-radius: 50%;
  background: color-mix(in oklab, var(--tile-hue) 6%, transparent);
  color: color-mix(in oklab, var(--tile-hue) 45%, var(--md-on-surface));
}

.workspace-header__tile-icon svg {
  width: 1.125rem;
  height: 1.125rem;
}

.workspace-header__tile-label {
  grid-area: label;
  color: var(--md-on-surface-variant);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1rem;
}

.workspace-header__tile-value {
  grid-area: value;
  justify-self: end;
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 2rem;
  color: var(--md-on-surface-variant);
  font-variant-numeric: tabular-nums;
}

.workspace-header__tile--lit .workspace-header__tile-value {
  color: var(--tile-hue);
}

/* Your move is the hero: the one big number on the card. */
.workspace-header__tile--hero {
  background: rgb(var(--glass), calc(var(--glass-a) + 0.3));
}

.workspace-header__tile--hero .workspace-header__tile-value {
  font-size: 2.75rem;
  font-weight: 700;
  line-height: 2.75rem;
  color: var(--md-on-surface);
}

.workspace-header__tile--hero.workspace-header__tile--lit .workspace-header__tile-value {
  color: var(--tile-hue);
}

.workspace-header__tile--hero .workspace-header__tile-label {
  color: var(--md-on-surface);
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
