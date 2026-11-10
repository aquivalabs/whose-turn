<script setup lang="ts">
// The one disclosure control: a chevron at the start of whatever it folds, pointing down while open and right while folded.
withDefaults(defineProps<{ open: boolean; tag?: 'button' | 'span' }>(), { tag: 'button' });
</script>
<template>
  <component
    :is="tag"
    class="chevron"
    :class="{ 'chevron--open': open }"
    :type="tag === 'button' ? 'button' : undefined"
    :aria-expanded="tag === 'button' ? open : undefined"
  />
</template>
<style scoped>
.chevron {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background: rgb(var(--md-state), 0.06);
  color: var(--md-on-surface-variant);
  cursor: pointer;
  user-select: none;
}

.chevron::before {
  content: '';
  width: 0.4375rem;
  height: 0.4375rem;
  border-right: 2px solid currentcolor;
  border-bottom: 2px solid currentcolor;
  transform: translateX(-0.0625rem) rotate(-45deg);
  transition: transform var(--motion-fast) var(--motion-ease);
}

.chevron--open::before {
  transform: translateY(-0.125rem) rotate(45deg);
}

.chevron:hover {
  background: rgb(var(--md-state), 0.12);
}

.chevron:focus-visible {
  outline: var(--focus-ring);
}
</style>
