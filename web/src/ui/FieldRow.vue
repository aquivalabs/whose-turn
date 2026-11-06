<script setup lang="ts">
// One settings field drawn from its spec: a checkbox, a colour, a list, a secret, or plain text; the value goes out through v-model and the parent decides how to store it.
import type { FieldSpec } from '@/lib/types.ts';
const props = withDefaults(
  defineProps<{
    spec: FieldSpec;
    placeholder?: string;
    hint?: string;
    error?: string;
  }>(),
  { placeholder: '', hint: '', error: '' },
);
const emit = defineEmits<{ secret: [key: string, value: string] }>();
const value = defineModel<string | string[] | boolean>();
const HEX = /^#[0-9a-f]{6}$/i;
const text = () => String(value.value ?? '');
const list = () => (value.value as string[] | undefined) || [];
const set = (next: string | string[]) => {
  value.value = next;
};
const checked = () => (value.value as boolean | undefined) ?? props.spec.default ?? false;
/** A box that matches the field's default sends nothing, so the parent drops the key. */
const setChecked = (next: boolean) => {
  value.value = next === (props.spec.default ?? false) ? undefined : next;
};
const typed = (event: Event) => (event.target as HTMLInputElement).value;
const setList = (typedText: string) =>
  set(
    typedText
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );
</script>
<template>
  <div class="field-row">
    <label class="field-row__label">{{ spec.label }}{{ spec.required ? ' *' : '' }}</label>
    <label v-if="spec.boolean" class="field-row__check">
      <input
        type="checkbox"
        :checked="checked()"
        @change="setChecked(($event.target as HTMLInputElement).checked)"
      />
      {{ hint || spec.hint }}
    </label>
    <select
      v-else-if="spec.choices"
      class="input"
      :aria-invalid="Boolean(error)"
      :value="text()"
      @change="set(typed($event))"
    >
      <option v-if="!spec.required && !spec.choices.includes(text())" value="">(default)</option>
      <option v-if="text() && !spec.choices.includes(text())" :value="text()">{{ text() }}</option>
      <option v-for="choice in spec.choices" :key="choice" :value="choice">{{ choice }}</option>
    </select>
    <input
      v-else-if="spec.secret"
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
      <button type="button" class="btn" @click="set('')">None</button>
    </div>
    <input
      v-else-if="spec.list"
      class="input"
      type="text"
      :aria-invalid="Boolean(error)"
      :value="list().join(', ')"
      @input="setList(typed($event))"
    />
    <input
      v-else
      class="input"
      :type="spec.min === undefined ? 'text' : 'number'"
      :min="spec.min"
      :max="spec.max"
      :aria-invalid="Boolean(error)"
      :placeholder="placeholder"
      :value="text()"
      @input="set(typed($event))"
    />
    <small v-if="error" class="field-row__error" role="alert">{{ error }}</small>
    <small v-if="!spec.boolean && (hint || spec.hint)" class="field-row__hint">{{ hint || spec.hint }}</small>
  </div>
</template>
<style scoped>
.field-row {
  display: grid;
  grid-template-columns: 10.625rem minmax(0, 1fr);
  align-items: center;
  gap: 0.25rem 0.875rem;
}

.field-row__label {
  color: var(--md-on-surface);
  font-size: 0.8125rem;
}

.field-row__hint {
  grid-column: 2;
  color: var(--md-on-surface-variant);
  font-size: 0.6875rem;
}

.field-row__error {
  grid-column: 2;
  color: var(--md-error);
  font-size: 0.75rem;
}

.field-row__check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--md-on-surface-variant);
  font-size: 0.6875rem;
}

.field-row__colour {
  width: 2.75rem;
  height: 1.875rem;
  padding: 0.125rem;
}

.field-row__inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
</style>
