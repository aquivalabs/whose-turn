<script setup lang="ts">
// One settings field drawn from its spec: a colour, a list, a secret, or plain text; the value is written straight into the target object.
import { setOrDrop } from '../lib/settings.ts';
import type { FieldSpec } from '../lib/types.ts';
const props = withDefaults(
  defineProps<{
    spec: FieldSpec;
    target: Record<string, unknown>;
    placeholder?: string;
    hint?: string;
  }>(),
  { placeholder: '', hint: '' },
);
const emit = defineEmits<{ secret: [key: string, value: string] }>();
const HEX = /^#[0-9a-f]{6}$/i;
const text = () => String(props.target[props.spec.key] ?? '');
const list = () => (props.target[props.spec.key] as string[] | undefined) || [];
const set = (next: string | string[]) => setOrDrop(props.target, props.spec.key, next);
const typed = (event: Event) => (event.target as HTMLInputElement).value;
const setList = (value: string) =>
  set(
    value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );
</script>
<template>
  <div class="field-row">
    <label class="field-row__label">{{ spec.label }}{{ spec.required ? ' *' : '' }}</label>
    <input
      v-if="spec.secret"
      class="input"
      type="password"
      placeholder="paste to replace"
      autocomplete="off"
      @input="emit('secret', spec.key, typed($event))"
    />
    <div v-else-if="spec.colour" class="field-row__inline">
      <input
        class="input field-row__colour"
        type="color"
        :value="HEX.test(text()) ? text() : '#888888'"
        @input="set(typed($event))"
      />
      <input
        class="input"
        type="text"
        placeholder="#rrggbb"
        :value="text()"
        @input="set(typed($event))"
      />
      <span class="btn" role="button" tabindex="0" @click="set('')" @keydown.enter.prevent="set('')"
        >None</span
      >
    </div>
    <input
      v-else-if="spec.list"
      class="input"
      type="text"
      :value="list().join(', ')"
      @input="setList(typed($event))"
    />
    <input
      v-else
      class="input"
      type="text"
      :placeholder="placeholder"
      :value="text()"
      @input="set(typed($event))"
    />
    <small v-if="hint || spec.hint" class="field-row__hint">{{ hint || spec.hint }}</small>
  </div>
</template>
<style scoped>
.field-row {
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr);
  align-items: center;
  gap: 4px 14px;
}

.field-row__label {
  color: var(--md-on-surface);
  font-size: 13px;
}

.field-row__hint {
  grid-column: 2;
  color: var(--md-on-surface-variant);
  font-size: 11px;
}

.field-row__colour {
  width: 44px;
  height: 30px;
  padding: 2px;
}

.field-row__inline {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
