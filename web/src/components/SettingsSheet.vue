<script setup>
// Settings: the workspace list on the left, one workspace's form on the right, drawn from the catalogues the server sends; the server validates, stores secrets, writes config.json and reloads.
import { ref, computed, watch } from 'vue';
import { S, ui, reload } from '../store.js';
import { getJson, post, problemsOf } from '../lib/api.js';
import { normaliseForForm, forSaving, pendingSecrets } from '../lib/settings.js';
import FieldRow from './FieldRow.vue';
const list = ref([]);
const selected = ref(0);
const catalogue = ref([]);
const fields = ref({ workspace: [], theme: [], rules: [], statuses: [] });
const configFile = ref('');
const problems = ref([]);
const typed = new Map();
const current = computed(() => list.value[selected.value]);
const specOf = (entry) => catalogue.value.find((c) => c.type === entry.type) || { type: entry.type, label: entry.type, fields: [] };
const setSecret = (entry, key, value) => typed.set(entry, Object.assign(typed.get(entry) || {}, { [key]: value }));
const addWorkspace = () => { list.value.push(normaliseForForm({ id: 'new-' + (list.value.length + 1), name: 'New workspace' })); selected.value = list.value.length - 1; };
const removeWorkspace = () => { list.value.splice(selected.value, 1); selected.value = Math.max(0, selected.value - 1); };
const addConnector = (c) => current.value.connectors.push({ type: c.type });
const removeConnector = (index) => { typed.delete(current.value.connectors[index]); current.value.connectors.splice(index, 1); };
const open = () => getJson('/api/config').then((j) => {
  list.value = (j.workspaces || []).map(normaliseForForm);
  catalogue.value = j.connectors || []; fields.value = j.fields; typed.clear();
  selected.value = Math.max(0, list.value.findIndex((w) => w.id === S.workspace.id));
  configFile.value = j.config_file || ''; problems.value = j.problems || [];
});
const close = () => { ui.settings = false; };
const save = () => post('/api/config', { workspaces: list.value.map(forSaving), secrets: pendingSecrets(list.value, typed) }).then((j) => {
  if (j.error) { problems.value = problemsOf(j.error); return; }
  close(); reload();
});
watch(() => ui.settings, (isOpen) => { if (isOpen) open(); });
</script>
<template>
  <div v-if="ui.settings" class="wt-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" @click.self="close">
    <div class="wt-modal-card wt-settings-card">
      <div class="wt-modal-head">
        <h3 id="settings-title">Workspaces</h3>
        <span class="wt-modal-meta">{{ configFile }}</span>
        <span class="wt-btn tonal" role="button" tabindex="0" @click="save" @keydown.enter.prevent="save">Save</span>
        <span class="wt-btn" role="button" tabindex="0" @click="close" @keydown.enter.prevent="close">Close</span>
      </div>
      <div v-if="problems.length" class="wt-alert">{{ problems.join('  ·  ') }}</div>
      <div class="wt-settings-body">
        <ul class="wt-settings-list">
          <li v-for="(w, index) in list" :key="index" :aria-selected="String(index === selected)" @click="selected = index">{{ w.name || w.id || 'Workspace ' + (index + 1) }}</li>
          <li class="add" @click="addWorkspace">+ Add workspace</li>
        </ul>
        <div class="wt-settings-form">
          <p v-if="!current" class="wt-empty">No workspaces yet. Add one on the left.</p>
          <template v-else>
            <h4>Workspace</h4>
            <FieldRow v-for="spec in fields.workspace" :key="spec.key" :spec="spec" :target="current" />
            <h4>Theme</h4>
            <FieldRow v-for="spec in fields.theme" :key="spec.key" :spec="spec" :target="current.theme" />
            <h4>Connectors</h4>
            <div v-for="(entry, index) in current.connectors" :key="index" class="wt-connector">
              <div class="wt-connector-head"><strong>{{ specOf(entry).label }}</strong><span class="wt-btn danger" role="button" tabindex="0" @click="removeConnector(index)">Remove</span></div>
              <FieldRow :spec="{ key: 'id', label: 'Entry id' }" :target="entry" :placeholder="specOf(entry).type" hint="only needed when one type appears twice" />
              <FieldRow :spec="{ key: 'label', label: 'Label' }" :target="entry" :placeholder="specOf(entry).label" hint="shown in the feed filter" />
              <FieldRow v-for="spec in specOf(entry).fields" :key="spec.key" :spec="spec" :target="entry" @secret="(key, value) => setSecret(entry, key, value)" />
            </div>
            <div class="wt-settings-actions"><span v-for="c in catalogue" :key="c.type" class="wt-btn" role="button" tabindex="0" @click="addConnector(c)">+ {{ c.label }}</span></div>
            <h4>Rules</h4>
            <FieldRow v-for="spec in fields.rules" :key="spec.key" :spec="spec" :target="current.rules" />
            <FieldRow v-for="spec in fields.statuses" :key="spec.key" :spec="spec" :target="current.rules.statuses" />
            <div class="wt-settings-actions"><span class="wt-btn danger" role="button" tabindex="0" @click="removeWorkspace">Delete workspace</span></div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
