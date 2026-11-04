<script setup lang="ts">
import { clampSize } from '@/composables/usePanelSize.ts';
const props = defineProps<{
  label: string;
  axis: 'x' | 'y';
  bounds: () => { current: number; min: number; max: number };
  grow?: 1 | -1;
  top?: boolean;
}>();
const emit = defineEmits<{ resize: [value: number]; reset: [] }>();
const KEY_STEP = 16;
const direction = props.grow ?? 1;
let start = { pointer: 0, size: 0, min: 0, max: 0 };
const pointerOf = (event: PointerEvent) => (props.axis === 'y' ? event.clientY : event.clientX);
const down = (event: PointerEvent) => {
  const { current, min, max } = props.bounds();
  start = { pointer: pointerOf(event), size: current, min, max };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
};
const move = (event: PointerEvent) => {
  if (!(event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) {
    return;
  }
  const delta = (pointerOf(event) - start.pointer) * direction;
  emit('resize', clampSize(start.size + delta, start.min, start.max));
};
const key = (event: KeyboardEvent) => {
  const forward = props.axis === 'y' ? 'ArrowDown' : 'ArrowRight';
  const back = props.axis === 'y' ? 'ArrowUp' : 'ArrowLeft';
  if (event.key !== forward && event.key !== back) {
    return;
  }
  event.preventDefault();
  const { current, min, max } = props.bounds();
  const step = (event.key === forward ? KEY_STEP : -KEY_STEP) * direction;
  emit('resize', clampSize(current + step, min, max));
};
</script>
<template>
  <div
    class="resize-handle"
    :class="['resize-handle--' + axis, { 'resize-handle--top': top }]"
    role="separator"
    tabindex="0"
    :aria-orientation="axis === 'y' ? 'horizontal' : 'vertical'"
    :aria-label="label"
    data-tip="Drag to resize; double click to reset"
    @pointerdown.prevent="down"
    @pointermove="move"
    @keydown="key"
    @dblclick="emit('reset')"
  ></div>
</template>
<style scoped>
.resize-handle {
  position: absolute;
  z-index: 2;
  touch-action: none;
  border-radius: 4px;
}

.resize-handle::before,
.resize-handle::after {
  content: '';
  position: absolute;
  margin: auto;
  border-radius: 2px;
  transition:
    opacity 0.15s ease,
    background-color 0.15s ease;
}

.resize-handle::before {
  background: var(--md-primary);
  opacity: 0;
}

.resize-handle::after {
  background: var(--md-outline);
  opacity: 0.55;
}

.resize-handle:hover::before,
.resize-handle:focus-visible::before {
  opacity: 0.6;
}

.resize-handle:hover::after,
.resize-handle:focus-visible::after {
  background: var(--md-outline);
  opacity: 1;
}

.resize-handle:focus-visible {
  outline: var(--focus-ring);
}

.resize-handle--y {
  right: 0;
  bottom: 0;
  left: 0;
  height: 10px;
  cursor: row-resize;
}

.resize-handle--y.resize-handle--top {
  top: 0;
  bottom: auto;
}

.resize-handle--y::before {
  inset: 4px 0 auto;
  height: 2px;
}

.resize-handle--y.resize-handle--top::before {
  inset: auto 0 4px;
}

.resize-handle--y::after {
  inset: 0;
  width: 40px;
  height: 5px;
}

.resize-handle--x {
  top: 0;
  bottom: 0;
  left: 0;
  width: 10px;
  cursor: col-resize;
}

.resize-handle--x::before {
  inset: 0 auto 0 4px;
  width: 2px;
}

.resize-handle--x::after {
  inset: 0;
  width: 5px;
  height: 40px;
}

@media (width <= 900px) {
  .resize-handle {
    display: none;
  }
}
</style>
