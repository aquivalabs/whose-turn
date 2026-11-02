<script setup>
// One settings field drawn from its spec: a colour, a list, a secret, or plain text; the value is written straight into the target object.
import { setOrDrop } from '../lib/settings.js';
const props = defineProps({ spec: { type: Object, required: true }, target: { type: Object, required: true }, placeholder: { type: String, default: '' }, hint: { type: String, default: '' } });
const emit = defineEmits(['secret']);
const HEX = /^#[0-9a-f]{6}$/i;
const value = () => props.target[props.spec.key];
const set = (next) => setOrDrop(props.target, props.spec.key, next);
const setList = (text) => set(text.split(',').map((p) => p.trim()).filter(Boolean));
</script>
<template>
  <div class="wt-field">
    <label>{{ spec.label }}{{ spec.required ? ' *' : '' }}</label>
    <input v-if="spec.secret" class="wt-input" type="password" placeholder="paste to replace" autocomplete="off" @input="emit('secret', spec.key, $event.target.value)">
    <div v-else-if="spec.colour" class="wt-inline">
      <input class="wt-input" type="color" :value="HEX.test(value() || '') ? value() : '#888888'" @input="set($event.target.value)">
      <input class="wt-input" type="text" placeholder="#rrggbb" :value="value() || ''" @input="set($event.target.value)">
      <span class="wt-btn" role="button" tabindex="0" @click="set('')" @keydown.enter.prevent="set('')">None</span>
    </div>
    <input v-else-if="spec.list" class="wt-input" type="text" :value="(value() || []).join(', ')" @input="setList($event.target.value)">
    <input v-else class="wt-input" type="text" :placeholder="placeholder" :value="value() || ''" @input="set($event.target.value)">
    <small v-if="hint || spec.hint">{{ hint || spec.hint }}</small>
  </div>
</template>
