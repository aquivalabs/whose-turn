<script setup lang="ts">
// Settings: the workspace list on the left, one workspace's form on the right, drawn from the catalogues the server sends; the server validates, stores secrets, writes config.json and reloads.
import { ref, computed, watch, nextTick, useTemplateRef } from 'vue';
import { snapshot, ui, reload } from '@/store.ts';
import { getJson, post, problemsOf, violationsOf } from '@/lib/api.ts';
import { SERVER_DOWN, writeProblem } from '@/lib/problems.ts';
import {
  normaliseForForm,
  forSaving,
  pendingSecrets,
  ruleText,
  setOrDrop,
  settingsKey,
  uidOf,
} from '@/lib/settings.ts';
import type { StoredWorkspace } from '@/lib/settings.ts';
import type { ApiError, ConnectorEntry, FieldSpec, RawWorkspace, RuleRow } from '@/lib/types.ts';
import FieldRow from '@/ui/FieldRow.vue';

interface ConnectorSpec {
  type: string;
  label: string;
  fields: FieldSpec[];
}
interface Ask {
  text: string;
  yes: string;
  no: string;
  run: () => void;
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
  table_warnings?: Record<string, string[]>;
}

const list = ref<RawWorkspace[]>([]);
const selected = ref(0);
const catalogue = ref<ConnectorSpec[]>([]);
const fields = ref<FormFields>({ workspace: [], theme: [], rules: [], statuses: [] });
const configFile = ref('');
const problems = ref<string[]>([]);
const fieldErrors = ref<Record<string, string>>({});
const loadedIds = new Map<number, string>();
const tables = ref<Record<string, RuleRow[]>>({});
const tableWarnings = ref<Record<string, string[]>>({});
const connectorsHead = useTemplateRef<HTMLElement>('connectors-head');
const typed = new Map<ConnectorEntry, Record<string, string>>();
const typedCount = ref(0);
const loadedKey = ref('');
const ask = ref<Ask | null>(null);
const unloaded = ref('');
const dirty = computed(
  () =>
    ui.settings &&
    !unloaded.value &&
    (typedCount.value > 0 || settingsKey(list.value) !== loadedKey.value),
);
/** The server's message for one field of the open workspace, addressed like workspaces[0].rules.backlog_rows. */
const errorAt = (path: string) => fieldErrors.value[`workspaces[${selected.value}].${path}`] || '';
const idHint = computed(() => {
  const was = current.value && loadedIds.get(uidOf(current.value));
  return was && current.value && was !== current.value.id
    ? `Its to-dos and marks stay under the old id "${was}"; they do not follow the rename.`
    : '';
});
const ID_SPEC: FieldSpec = { key: 'id', label: 'Entry id' };
const LABEL_SPEC: FieldSpec = { key: 'label', label: 'Label' };
const current = computed(() => list.value[selected.value] as RawWorkspace | undefined);
const ruleRows = computed(() =>
  ((current.value && tables.value[current.value.id]) || []).map(ruleText),
);
const ruleWarnings = computed(() => (current.value && tableWarnings.value[current.value.id]) || []);
const specOf = (entry: ConnectorEntry): ConnectorSpec =>
  catalogue.value.find((spec) => spec.type === entry.type) || {
    type: entry.type,
    label: entry.type,
    fields: [],
  };
const workspaceTabs = computed(() =>
  list.value.map((workspace, index) => ({
    uid: uidOf(workspace),
    label: workspace.name || workspace.id || 'Workspace ' + (index + 1),
  })),
);
const connectorCards = computed(() =>
  (current.value?.connectors || []).map((entry) => ({
    entry,
    uid: uidOf(entry),
    spec: specOf(entry),
  })),
);
/** A field's stored value as FieldRow shows it; an edit goes back through setOrDrop, so an emptied field leaves the config. */
/** The hint under an empty seed field: the colour the server derived from the workspace id, once it is saved. */
const derivedSeedHint = (id: string) => {
  const seed = snapshot.workspaces.find((workspace) => workspace.id === id)?.theme_seed;
  return seed ? `empty: ${seed}, derived from the workspace id` : 'empty derives one from the workspace id';
};
const fieldValue = (target: Record<string, unknown>, key: string) =>
  target[key] as string | string[] | undefined;
const setSecret = (entry: ConnectorEntry, key: string, value: string) => {
  typed.set(entry, Object.assign(typed.get(entry) || {}, { [key]: value }));
  typedCount.value += 1;
};
/** The id stays in the form as an empty string so the server can name it as missing; every other field leaves the config when emptied. */
const setWorkspaceField = (
  workspace: RawWorkspace,
  key: string,
  value: string | string[] | boolean | undefined,
) => (key === 'id' ? (workspace.id = String(value ?? '')) : setOrDrop(workspace, key, value));
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
const askRemoveWorkspace = () => {
  if (!current.value) {
    return;
  }
  ask.value = {
    text: `Delete ${current.value.name || current.value.id}? Its to-dos and marks stay on disk.`,
    yes: 'Delete',
    no: 'Keep',
    run: removeWorkspace,
  };
};
const addConnector = (spec: ConnectorSpec) => current.value?.connectors.push({ type: spec.type });
const removeConnector = (index: number) => {
  if (!current.value) {
    return;
  }
  typed.delete(current.value.connectors[index]);
  current.value.connectors.splice(index, 1);
};
const askRemoveConnector = (index: number) => {
  if (!current.value) {
    return;
  }
  const label = specOf(current.value.connectors[index]).label;
  ask.value = {
    text: `Remove the ${label} connector from ${current.value.name || current.value.id}?`,
    yes: 'Remove',
    no: 'Keep',
    run: () => removeConnector(index),
  };
};
const open = () =>
  getJson<ConfigReply>('/api/config')
    .then((reply) => {
      unloaded.value = '';
      list.value = (reply.workspaces || []).map(normaliseForForm);
      catalogue.value = reply.connectors || [];
      fields.value = reply.fields;
      typed.clear();
      typedCount.value = 0;
      ask.value = null;
      selected.value = Math.max(
        0,
        list.value.findIndex((workspace) => workspace.id === snapshot.workspace.id),
      );
      configFile.value = reply.config_file || '';
      problems.value = reply.problems || [];
      fieldErrors.value = {};
      loadedIds.clear();
      list.value.forEach((workspace) => loadedIds.set(uidOf(workspace), workspace.id));
      tables.value = reply.tables || {};
      tableWarnings.value = reply.table_warnings || {};
      loadedKey.value = settingsKey(list.value);
    })
    .catch(() => {
      unloaded.value = SERVER_DOWN + '; settings cannot be loaded.';
    })
    .then(nextTick)
    .then(() => {
      if (ui.settingsAt === 'connectors') {
        connectorsHead.value?.scrollIntoView({ block: 'start' });
      }
      ui.settingsAt = '';
    });
const close = () => {
  ui.settings = false;
};
const askDiscard = () => {
  ask.value = { text: 'Discard changes?', yes: 'Discard', no: 'Keep editing', run: close };
};
const requestClose = () => (dirty.value ? askDiscard() : close());
const answer = (yes: boolean) => {
  const pending = ask.value;
  ask.value = null;
  if (yes) {
    pending?.run();
  }
};
const save = async () => {
  try {
    const reply = await post<{ error?: ApiError }>('/api/config', {
      workspaces: list.value.map((workspace) => forSaving(workspace)),
      secrets: pendingSecrets(list.value, typed),
    });
    if (reply.error) {
      const found = violationsOf(reply.error);
      fieldErrors.value = Object.fromEntries(
        found.filter((entry) => entry.field !== 'workspaces').map((entry) => [entry.field, entry.description]),
      );
      problems.value = found.length
        ? found.filter((entry) => entry.field === 'workspaces').map((entry) => entry.description)
        : problemsOf(reply.error);
      if (found.length && !problems.value.length) {
        problems.value = ['Fix the marked fields; nothing was saved.'];
      }
      return;
    }
    close();
    reload();
  } catch (error) {
    problems.value = [
      writeProblem(error, { unreachable: SERVER_DOWN + '; your changes are kept, save again.' }),
    ];
  }
};
watch(
  dirty,
  (isDirty) => {
    ui.settingsDirty = isDirty;
  },
  { immediate: true },
);
watch(
  () => ui.settingsAsk,
  (asked) => {
    if (asked) {
      ui.settingsAsk = false;
      askDiscard();
    }
  },
);
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
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-title"
    @click.self="requestClose"
  >
    <div class="modal__card settings-sheet__card">
      <div class="modal__head">
        <h3 id="settings-title" class="modal__title">Workspaces</h3>
        <span class="modal__meta">{{ configFile }}</span>
        <span v-if="dirty" class="settings-sheet__dirty">Unsaved changes</span>
        <button v-if="!unloaded" type="button" class="btn btn--tonal" @click="save">Save</button>
        <button type="button" class="btn" @click="requestClose">Close</button>
      </div>
      <div v-if="ask" class="settings-sheet__confirm" role="alertdialog">
        <span class="settings-sheet__confirm-text">{{ ask.text }}</span>
        <button type="button" class="btn btn--danger" @click="answer(true)">{{ ask.yes }}</button>
        <button type="button" class="btn" @click="answer(false)">{{ ask.no }}</button>
      </div>
      <div v-if="unloaded" class="alert settings-sheet__alert" role="alert">{{ unloaded }}</div>
      <div v-else-if="problems.length" class="alert settings-sheet__alert">
        {{ problems.join('  ·  ') }}
      </div>
      <div v-if="!unloaded" class="settings-sheet__body">
        <ul class="settings-sheet__list">
          <li v-for="(tab, index) in workspaceTabs" :key="tab.uid">
            <button
              type="button"
              class="settings-sheet__workspace"
              :aria-current="index === selected"
              @click="selected = index"
            >
              {{ tab.label }}
            </button>
          </li>
          <li>
            <button
              type="button"
              class="settings-sheet__workspace settings-sheet__workspace--add"
              @click="addWorkspace"
            >
              + Add workspace
            </button>
          </li>
        </ul>
        <div class="sheet-form">
          <p v-if="!current" class="empty">No workspaces yet. Add one on the left.</p>
          <template v-else>
            <h4 class="sheet-form__heading">Workspace</h4>
            <FieldRow
              v-for="spec in fields.workspace"
              :key="spec.key"
              :spec="spec"
              :hint="spec.key === 'id' ? idHint : ''"
              :error="errorAt(spec.key)"
              :model-value="fieldValue(current, spec.key)"
              @update:model-value="setWorkspaceField(current, spec.key, $event)"
            />
            <h4 class="sheet-form__heading">Theme</h4>
            <FieldRow
              v-for="spec in fields.theme"
              :key="spec.key"
              :spec="spec"
              :hint="spec.key === 'seed' && !current.theme?.seed ? derivedSeedHint(current.id) : ''"
              :model-value="fieldValue(current.theme, spec.key)"
              @update:model-value="setOrDrop(current.theme, spec.key, $event)"
            />
            <h4 ref="connectors-head" class="sheet-form__heading">Connectors</h4>
            <div
              v-for="({ entry, spec: entrySpec, uid }, index) in connectorCards"
              :key="uid"
              class="settings-sheet__connector"
            >
              <div class="settings-sheet__connector-head">
                <strong class="settings-sheet__connector-name">{{ entrySpec.label }}</strong
                ><button type="button" class="btn btn--danger" @click="askRemoveConnector(index)">
                  Remove
                </button>
              </div>
              <FieldRow
                :spec="ID_SPEC"
                :placeholder="entrySpec.type"
                hint="only needed when one type appears twice"
                :model-value="fieldValue(entry, 'id')"
                @update:model-value="setOrDrop(entry, 'id', $event)"
              />
              <FieldRow
                :spec="LABEL_SPEC"
                :placeholder="entrySpec.label"
                hint="shown in the feed filter"
                :model-value="fieldValue(entry, 'label')"
                @update:model-value="setOrDrop(entry, 'label', $event)"
              />
              <FieldRow
                v-for="spec in entrySpec.fields"
                :key="spec.key"
                :spec="spec"
                :error="errorAt('connectors[' + index + '].' + spec.key)"
                :model-value="fieldValue(entry, spec.key)"
                @update:model-value="setOrDrop(entry, spec.key, $event)"
                @secret="(key, value) => setSecret(entry, key, value)"
              />
            </div>
            <div class="settings-sheet__actions">
              <button
                v-for="spec in catalogue"
                :key="spec.type"
                type="button"
                class="btn"
                @click="addConnector(spec)"
              >
                + {{ spec.label }}
              </button>
            </div>
            <h4 class="sheet-form__heading">Rules</h4>
            <FieldRow
              v-for="spec in fields.rules"
              :key="spec.key"
              :spec="spec"
              :error="errorAt('rules.' + spec.key)"
              :model-value="fieldValue(current.rules, spec.key)"
              @update:model-value="setOrDrop(current.rules, spec.key, $event)"
            />
            <FieldRow
              v-for="spec in fields.statuses"
              :key="spec.key"
              :spec="spec"
              :model-value="fieldValue(current.rules.statuses, spec.key)"
              @update:model-value="setOrDrop(current.rules.statuses, spec.key, $event)"
            />
            <h4 class="sheet-form__heading">Whose turn table</h4>
            <p class="settings-sheet__rules-note">
              The rows in force, first match wins. Read-only here: ask Claude to change rules.table
              through /api/config.
            </p>
            <p v-for="warning in ruleWarnings" :key="warning" class="settings-sheet__rules-warning">
              {{ warning }}
            </p>
            <ol v-if="ruleRows.length" class="settings-sheet__rules">
              <li v-for="(rule, index) in ruleRows" :key="index" class="settings-sheet__rule">
                <span class="settings-sheet__rule-when">{{ rule.when }}</span>
                <span class="settings-sheet__rule-then">{{ rule.then }}</span>
              </li>
            </ol>
            <p v-else class="empty">Save the workspace to see its rows.</p>
            <div class="settings-sheet__actions">
              <button type="button" class="btn btn--danger" @click="askRemoveWorkspace">
                Delete workspace
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped>
.settings-sheet__card {
  width: min(1040px, 100%);
  height: min(760px, 100%);
}

.settings-sheet__dirty {
  color: var(--md-error);
  font-size: 12px;
  font-weight: 600;
}

.settings-sheet__confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 12px 20px 0;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--md-warn-container);
  color: var(--md-on-warn-container);
  font-size: 13px;
}

.settings-sheet__confirm-text {
  flex: 1;
}

.settings-sheet__alert {
  margin: 12px 20px 0;
}

.settings-sheet__body {
  display: grid;
  flex: 1;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 0;
  min-height: 0;
}

.settings-sheet__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 12px;
  overflow: auto;
  border-right: 1px solid var(--md-outline-variant);
  list-style: none;
}

.settings-sheet__workspace {
  box-sizing: border-box;
  display: block;
  width: 100%;
  padding: 8px 12px;
  overflow: hidden;
  border-radius: 10px;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.settings-sheet__workspace:hover {
  background: var(--state-hover);
}

.settings-sheet__workspace[aria-current='true'] {
  background: var(--md-secondary-container);
  color: var(--md-on-secondary-container);
}

.settings-sheet__workspace:focus-visible {
  outline: var(--focus-ring);
  outline-offset: -2px;
}

.settings-sheet__workspace--add {
  color: var(--md-primary);
  font-weight: 500;
}

.settings-sheet__connector {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--md-outline-variant);
  border-radius: 12px;
  background: rgb(var(--glass), 0.35);
}

.settings-sheet__connector-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.settings-sheet__connector-name {
  flex: 1;
  font-weight: 600;
}

.settings-sheet__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.settings-sheet__rules {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0 0 0 28px;
  font-size: 13px;
}

.settings-sheet__rule {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 12px;
  padding: 4px 0;
  border-bottom: 1px solid var(--md-outline-variant);
}

.settings-sheet__rule-when {
  color: var(--md-on-surface-variant);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.settings-sheet__rule-then {
  overflow-wrap: anywhere;
}

.settings-sheet__rules-note {
  margin: 0;
  color: var(--md-on-surface-variant);
}

.settings-sheet__rules-warning {
  margin: 0;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--md-warn-container);
  color: var(--md-on-warn-container);
}
</style>
