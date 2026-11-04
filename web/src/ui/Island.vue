<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue';
import { useMutationObserver, useResizeObserver } from '@vueuse/core';
import { useFold } from '@/composables/useFold.ts';
import { glideThrough, LEAVING } from '@/motion.ts';
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
const { collapsed, toggle: flip } = useFold(props.id);
const strip = computed(() => collapsed.value && props.resize === 'width');
const { size, set } = usePanelSize(() => props.sizeKey);
const root = useTemplateRef<HTMLElement>('root');
// docs/mechanisms/motion.md § A fold glides
let gliding = false;
const toggle = async () => {
  gliding = true;
  try {
    await (props.resize === 'width'
      ? glideThrough(root.value?.parentElement, 'gridTemplateColumns', flip)
      : glideThrough(root.value, 'height', flip));
  } finally {
    gliding = false;
    schedule();
  }
};
const floor = ref(0);
const hasRows = ref(true);
const pixels = (value: string) => parseFloat(value) || 0;
const scrolledAbove = (row: HTMLElement, stop: HTMLElement) => {
  let offset = 0;
  for (let node = row.parentElement; node && node !== stop; node = node.parentElement) {
    offset += node.scrollTop;
  }
  return offset;
};
// docs/mechanisms/motion.md § The island's floor
const STAYING = `:not([${LEAVING}])`;
const OWN_ROWS = [
  `:scope > .row-scroll tbody${STAYING} > tr`,
  `:scope > .island__fade > .row-scroll tbody${STAYING} > tr`,
  `:scope > .todos__list > li${STAYING}`,
].join(', ');
// docs/mechanisms/motion.md § The island's natural height
const naturalHeight = (element: HTMLElement) => {
  const content = element.classList.contains('row-scroll') ? element.firstElementChild : null;
  const own = content instanceof HTMLElement ? content.offsetHeight : element.offsetHeight;
  return Math.max(own, pixels(getComputedStyle(element).minHeight));
};
const siblingsBelow = (body: HTMLElement, row: HTMLElement) => {
  const owner = [...body.children].find((child) => child.contains(row));
  const after = owner ? [...body.children].slice([...body.children].indexOf(owner) + 1) : [];
  return after
    .filter((node) => !node.classList.contains('row-scroll__more'))
    .reduce((sum, node) => {
      return sum + naturalHeight(node as HTMLElement);
    }, 0);
};
const measure = () => {
  const el = root.value;
  const body = el?.querySelector<HTMLElement>('.island__body');
  if (!el || !body || collapsed.value || props.resize !== 'height') {
    return;
  }
  const rows = body.querySelectorAll<HTMLElement>(OWN_ROWS);
  const hadRows = hasRows.value;
  hasRows.value = rows.length > 0;
  const top = el.getBoundingClientRect().top;
  const padding = pixels(getComputedStyle(body).paddingBottom);
  if (!rows.length) {
    const natural = [...body.children].reduce((sum, node) => sum + naturalHeight(node as HTMLElement), 0);
    floor.value = hadRows ? 0 : Math.ceil(body.offsetTop + natural + padding);
    return;
  }
  const bottom = rows[0].getBoundingClientRect().bottom - top + scrolledAbove(rows[0], el);
  floor.value = floorHeight(bottom + siblingsBelow(body, rows[0]) + padding + 2, rows.length);
};
let frame = 0;
const schedule = () => {
  if (gliding) {
    return;
  }
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(measure);
};
const body = useTemplateRef<HTMLElement>('body');
useMutationObserver(body, schedule, { childList: true, subtree: true, attributes: true, attributeFilter: [LEAVING] });
useResizeObserver(body, schedule);
onMounted(schedule);
watch(collapsed, () => nextTick(schedule));
const sized = computed(() => size.value !== null && props.resize === 'height' && hasRows.value);
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
      'island--strip': strip,
      'island--sized': sized,
    }"
    :style="
      resize === 'height'
        ? { '--island-floor': floor + 'px', '--island-height': (sized ? size : 0) + 'px' }
        : undefined
    "
  >
    <div class="island__head" @click="strip && toggle()">
      <Chevron
        :open="!collapsed"
        :aria-label="(collapsed ? 'Open ' : 'Fold ') + title"
        :data-tip="collapsed ? 'Open this panel' : 'Fold this panel; it stays folded until you open it again'"
        :data-tippy-placement="strip ? 'left' : undefined"
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
    <!-- docs/mechanisms/motion.md § A folded body is not mounted -->
    <div v-if="!collapsed" ref="body" class="island__body"><slot /></div>
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

@media (width >= 901px) {
  .island--strip {
    cursor: pointer;
  }

  .island--strip .chevron::before {
    transform: translateX(1px) rotate(135deg);
  }

  .island--strip .island__head {
    flex-direction: column;
    justify-content: flex-start;
    height: 100%;
    padding: 12px 0;
  }

  .island--strip .island__title {
    display: flex;
    align-items: center;
    gap: 8px;
    writing-mode: vertical-rl;
  }

  .island--strip .island__note {
    display: none;
  }

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
