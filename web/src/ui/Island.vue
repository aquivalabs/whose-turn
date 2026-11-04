<script setup lang="ts">
import { onMounted, ref, useTemplateRef } from 'vue';
import { useMutationObserver, useResizeObserver } from '@vueuse/core';
import { useFold } from '@/composables/useFold.ts';
import { ceilingHeight, floorHeight, usePanelSize } from '@/composables/usePanelSize.ts';
import Chevron from './Chevron.vue';
import ResizeHandle from './ResizeHandle.vue';
const props = withDefaults(
  defineProps<{
    id: string;
    sizeKey?: string;
    title: string;
    note?: string;
    tip?: string;
    column?: boolean;
    resize?: 'height' | 'width';
  }>(),
  {
    sizeKey: '',
    note: '',
    tip: '',
    resize: 'height',
  },
);
const MIN_WIDTH = 280;
const MAIN_MIN_WIDTH = 360;
const { collapsed, toggle } = useFold(props.id);
const { size, set } = usePanelSize(() => props.sizeKey);
const root = useTemplateRef<HTMLElement>('root');
const floor = ref(0);
const pixels = (value: string) => parseFloat(value) || 0;
const scrolledAbove = (row: HTMLElement, stop: HTMLElement) => {
  let offset = 0;
  for (let node = row.parentElement; node && node !== stop; node = node.parentElement) {
    offset += node.scrollTop;
  }
  return offset;
};
const siblingsBelow = (body: HTMLElement, row: HTMLElement) => {
  const owner = [...body.children].find((child) => child.contains(row));
  const after = owner ? [...body.children].slice([...body.children].indexOf(owner) + 1) : [];
  return after
    .filter((node) => !node.classList.contains('row-scroll__more'))
    .reduce((sum, node) => {
      const element = node as HTMLElement;
      return sum + (pixels(getComputedStyle(element).minHeight) || element.offsetHeight);
    }, 0);
};
const measure = () => {
  const el = root.value;
  const body = el?.querySelector<HTMLElement>('.island__body');
  if (!el || !body || collapsed.value || props.resize !== 'height') {
    return;
  }
  const rows = body.querySelectorAll<HTMLElement>('tbody > tr, .todos__list > li');
  const top = el.getBoundingClientRect().top;
  const padding = pixels(getComputedStyle(body).paddingBottom);
  if (!rows.length) {
    floor.value = Math.ceil(body.offsetTop + body.scrollHeight);
    return;
  }
  const bottom = rows[0].getBoundingClientRect().bottom - top + scrolledAbove(rows[0], el);
  floor.value = floorHeight(bottom + siblingsBelow(body, rows[0]) + padding + 2, rows.length);
};
let frame = 0;
const schedule = () => {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(measure);
};
onMounted(() => {
  const body = root.value?.querySelector<HTMLElement>('.island__body');
  if (body) {
    useMutationObserver(body, schedule, { childList: true, subtree: true });
    useResizeObserver(body, schedule);
  }
  schedule();
});
const neighbours = (el: HTMLElement) =>
  [...(el.parentElement?.children ?? [])]
    .filter((node): node is HTMLElement => node !== el && node instanceof HTMLElement)
    .map((node) => ({
      collapsed: node.classList.contains('island--collapsed'),
      height: node.offsetHeight,
      floor: pixels(node.style.getPropertyValue('--island-floor')),
    }));
const bounds = () => {
  const el = root.value as HTMLElement;
  measure();
  if (props.resize === 'width') {
    const layout = el.parentElement as HTMLElement;
    const gap = pixels(getComputedStyle(layout).columnGap);
    return {
      current: el.offsetWidth,
      min: MIN_WIDTH,
      max: layout.clientWidth - gap - MAIN_MIN_WIDTH,
    };
  }
  const column = el.parentElement as HTMLElement;
  const gap = pixels(getComputedStyle(column).rowGap);
  return {
    current: el.offsetHeight,
    min: floor.value,
    max: Math.max(ceilingHeight(column.clientHeight, gap, neighbours(el)), column.clientHeight),
  };
};
</script>
<template>
  <section
    :id="id"
    ref="root"
    class="island"
    :class="{
      'island--collapsed': collapsed,
      'island--column': column,
      'island--sized': size !== null && resize === 'height',
    }"
    :style="
      resize === 'height'
        ? { '--island-floor': floor + 'px', '--island-height': (size ?? 0) + 'px' }
        : undefined
    "
  >
    <div class="island__head">
      <Chevron
        :open="!collapsed"
        :aria-label="'Fold ' + title"
        data-tip="Fold this panel; it stays folded until you open it again"
        @click.stop="toggle"
      />
      <h2 class="island__title">{{ title }} <slot name="head" /></h2>
      <p class="island__note">
        <span class="island__note-text">{{ note }}</span>
        <button v-if="tip" type="button" class="hint-icon" :aria-label="'About ' + title" :data-tip="tip" data-tip-click>
          ?
        </button>
      </p>
    </div>
    <div class="island__body"><slot /></div>
    <ResizeHandle
      v-if="!collapsed"
      :label="'Resize ' + title"
      :axis="resize === 'width' ? 'x' : 'y'"
      :grow="resize === 'width' ? -1 : 1"
      :bounds="bounds"
      @resize="set"
      @reset="set(null)"
    />
  </section>
</template>
<style scoped>
.island__head {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 20px 12px 12px;
}

.island__title {
  flex: none;
  margin: 0;
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.island__note {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
  margin: 0;
  overflow: visible;
  color: var(--md-on-surface-variant);
  font-size: 12px;
  line-height: 16px;
  letter-spacing: 0.03em;
  text-align: right;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.island__note-text {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.island__body {
  padding: 0 20px 12px;
}

.island--column .island__head {
  gap: 4px;
}

.island--column .island__body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding-top: 4px;
}

.island.island--collapsed .island__body {
  display: none;
}

@media (width >= 901px) {
  .dashboard--fit .dashboard__main .island__body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
    padding-bottom: 0;
  }

  .dashboard--fit .dashboard__main .island.island--collapsed .island__body {
    display: none;
  }
}
</style>
