<script setup lang="ts">
// Settings: the workspace list on the left, one workspace's form on the right, drawn from the catalogues the server sends; the server validates, stores secrets, writes config.json and reloads.
import { ref, computed, watch } from 'vue';
import { snapshot, ui, reload } from '../store.ts';
import { getJson, post, problemsOf } from '../lib/api.ts';
import { normaliseForForm, forSaving, pendingSecrets, ruleText } from '../lib/settings.ts';
import type { StoredWorkspace } from '../lib/settings.ts';
import type { ApiError, ConnectorEntry, FieldSpec, RawWorkspace, RuleRow } from '../lib/types.ts';
import FieldRow from './FieldRow.vue';

interface ConnectorSpec {
  type: string;
  label: string;
  fields: FieldSpec[];
}
interface FormFields {
  workspace: FieldSpec[];
  theme: FieldSpec[];
  rules: FieldSpec[];
  statuses: FieldSpec[];
}
interface ConfigReply {
  workspaces?: StoredWorkspace[];
  connectors?: ConnectorSpec[];
  fields: FormFields;
  config_file?: string;
  problems?: string[];
  tables?: Record<string, RuleRow[]>;
}

const list = ref<RawWorkspace[]>([]);
const selected = ref(0);
const catalogue = ref<ConnectorSpec[]>([]);
const fields = ref<FormFields>({ workspace: [], theme: [], rules: [], statuses: [] });
const configFile = ref('');
const problems = ref<string[]>([]);
const tables = ref<Record<string, RuleRow[]>>({});
const typed = new Map<ConnectorEntry, Record<string, string>>();
const current = computed(() => list.value[selected.value] as RawWorkspace | undefined);
const ruleRows = computed(() =>
  ((current.value && tables.value[current.value.id]) || []).map(ruleText),
);
const specOf = (entry: ConnectorEntry): ConnectorSpec =>
  catalogue.value.find((spec) => spec.type === entry.type) || {
    type: entry.type,
    label: entry.type,
    fields: [],
  };
const setSecret = (entry: ConnectorEntry, key: string, value: string) =>
  typed.set(entry, Object.assign(typed.get(entry) || {}, { [key]: value }));
const addWorkspace = () => {
  list.value.push(
    normaliseForForm({ id: 'new-' + (list.value.length + 1), name: 'New workspace' }),
  );
  selected.value = list.value.length - 1;
};
const removeWorkspace = () => {
  list.value.splice(selected.value, 1);
  selected.value = Math.max(0, selected.value - 1);
};
const addConnector = (spec: ConnectorSpec) => current.value?.connectors.push({ type: spec.type });
const removeConnector = (index: number) => {
  if (!current.value) {
    return;
  }
  typed.delete(current.value.connectors[index]);
  current.value.connectors.splice(index, 1);
};
const open = () =>
  getJson<ConfigReply>('/api/config').then((reply) => {
    list.value = (reply.workspaces || []).map(normaliseForForm);
    catalogue.value = reply.connectors || [];
    fields.value = reply.fields;
    typed.clear();
    selected.value = Math.max(
      0,
      list.value.findIndex((workspace) => workspace.id === snapshot.workspace.id),
    );
    configFile.value = reply.config_file || '';
    problems.value = reply.problems || [];
    tables.value = reply.tables || {};
  });
const close = () => {
  ui.settings = false;
};
const save = () =>
  post<{ error?: ApiError }>('/api/config', {
    workspaces: list.value.map(forSaving),
    secrets: pendingSecrets(list.value, typed),
  }).then((reply) => {
    if (reply.error) {
      problems.value = problemsOf(reply.error);
      return;
    }
    close();
    reload();
  });
watch(
  () => ui.settings,
  (isOpen) => {
    if (isOpen) {
      open();
    }
  },
);
</script>
<template>
  <div
    v-if="ui.settings"
    class="wt-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-title"
    @click.self="close"
  >
    <div class="wt-modal-card wt-settings-card">
      <div class="wt-modal-head">
        <h3 id="settings-title">Workspaces</h3>
        <span class="wt-modal-meta">{{ configFile }}</span>
        <span
          class="wt-btn tonal"
          role="button"
          tabindex="0"
          @click="save"
          @keydown.enter.prevent="save"
          >Save</span
        >
        <span
          class="wt-btn"
          role="button"
          tabindex="0"
          @click="close"
          @keydown.enter.prevent="close"
          >Close</span
        >
      </div>
      <div v-if="problems.length" class="wt-alert">{{ problems.join('  ·  ') }}</div>
      <div class="wt-settings-body">
        <ul class="wt-settings-list">
          <li
            v-for="(workspace, index) in list"
            :key="index"
            :aria-selected="index === selected"
            @click="selected = index"
          >
            {{ workspace.name || workspace.id || 'Workspace ' + (index + 1) }}
          </li>
          <li class="add" @click="addWorkspace">+ Add workspace</li>
        </ul>
        <div class="wt-settings-form">
          <p v-if="!current" class="wt-empty">No workspaces yet. Add one on the left.</p>
          <template v-else>
            <h4>Workspace</h4>
            <FieldRow
              v-for="spec in fields.workspace"
              :key="spec.key"
              :spec="spec"
              :target="current"
            />
            <h4>Theme</h4>
            <FieldRow
              v-for="spec in fields.theme"
              :key="spec.key"
              :spec="spec"
              :target="current.theme"
            />
            <h4>Connectors</h4>
            <div v-for="(entry, index) in current.connectors" :key="index" class="wt-connector">
              <div class="wt-connector-head">
                <strong>{{ specOf(entry).label }}</strong
                ><span
                  class="wt-btn danger"
                  role="button"
                  tabindex="0"
                  @click="removeConnector(index)"
                  >Remove</span
                >
              </div>
              <FieldRow
                :spec="{ key: 'id', label: 'Entry id' }"
                :target="entry"
                :placeholder="specOf(entry).type"
                hint="only needed when one type appears twice"
              />
              <FieldRow
                :spec="{ key: 'label', label: 'Label' }"
                :target="entry"
                :placeholder="specOf(entry).label"
                hint="shown in the feed filter"
              />
              <FieldRow
                v-for="spec in specOf(entry).fields"
                :key="spec.key"
                :spec="spec"
                :target="entry"
                @secret="(key, value) => setSecret(entry, key, value)"
              />
            </div>
            <div class="wt-settings-actions">
              <span
                v-for="spec in catalogue"
                :key="spec.type"
                class="wt-btn"
                role="button"
                tabindex="0"
                @click="addConnector(spec)"
                >+ {{ spec.label }}</span
              >
            </div>
            <h4>Rules</h4>
            <FieldRow
              v-for="spec in fields.rules"
              :key="spec.key"
              :spec="spec"
              :target="current.rules"
            />
            <FieldRow
              v-for="spec in fields.statuses"
              :key="spec.key"
              :spec="spec"
              :target="current.rules.statuses"
            />
            <h4>Whose turn table</h4>
            <p class="wt-rules-table__note">
              The rows in force, first match wins. Read-only here: ask Claude to change rules.table
              through /api/config.
            </p>
            <ol v-if="ruleRows.length" class="wt-rules-table">
              <li v-for="(rule, index) in ruleRows" :key="index" class="wt-rules-table__row">
                <span class="wt-rules-table__when">{{ rule.when }}</span>
                <span class="wt-rules-table__then">{{ rule.then }}</span>
              </li>
            </ol>
            <p v-else class="wt-empty">Save the workspace to see its rows.</p>
            <div class="wt-settings-actions">
              <span class="wt-btn danger" role="button" tabindex="0" @click="removeWorkspace"
                >Delete workspace</span
              >
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped>
.wt-rules-table {
  margin: 0;
  padding: 0 0 0 28px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}

.wt-rules-table__row {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 12px;
  padding: 4px 0;
  border-bottom: 1px solid var(--md-outline-variant);
}

.wt-rules-table__when {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--md-on-surface-variant);
  overflow-wrap: anywhere;
}

.wt-rules-table__then {
  overflow-wrap: anywhere;
}

.wt-rules-table__note {
  margin: 0;
  color: var(--md-on-surface-variant);
}
</style>
