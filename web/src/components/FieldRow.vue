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
  <div class="wt-field">
    <label>{{ spec.label }}{{ spec.required ? ' *' : '' }}</label>
    <input
      v-if="spec.secret"
      class="wt-input"
      type="password"
      placeholder="paste to replace"
      autocomplete="off"
      @input="emit('secret', spec.key, typed($event))"
    />
    <div v-else-if="spec.colour" class="wt-inline">
      <input
        class="wt-input"
        type="color"
        :value="HEX.test(text()) ? text() : '#888888'"
        @input="set(typed($event))"
      />
      <input
        class="wt-input"
        type="text"
        placeholder="#rrggbb"
        :value="text()"
        @input="set(typed($event))"
      />
      <span
        class="wt-btn"
        role="button"
        tabindex="0"
        @click="set('')"
        @keydown.enter.prevent="set('')"
        >None</span
      >
    </div>
    <input
      v-else-if="spec.list"
      class="wt-input"
      type="text"
      :value="list().join(', ')"
      @input="setList(typed($event))"
    />
    <input
      v-else
      class="wt-input"
      type="text"
      :placeholder="placeholder"
      :value="text()"
      @input="set(typed($event))"
    />
    <small v-if="hint || spec.hint">{{ hint || spec.hint }}</small>
  </div>
</template>
