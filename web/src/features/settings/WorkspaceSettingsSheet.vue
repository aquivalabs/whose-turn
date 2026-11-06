<script setup lang="ts">
// Workspace settings: one workspace's form (or an empty one for a new workspace), drawn from the catalogues the server sends; the server validates, stores secrets, writes config.json and reloads.
import { AnimatePresence } from 'motion-v';
import { ref, computed, nextTick, useTemplateRef } from 'vue';
import { snapshot, ui, reload, switchWorkspace } from '@/store.ts';
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
import type {
  ConnectorEntry,
  FactWords,
  FieldSpec,
  RawWorkspace,
  RuleRow,
} from '@/lib/types.ts';
import FieldRow from '@/ui/FieldRow.vue';
import SettingsFrame from './SettingsFrame.vue';
import { useConfigSheet } from './useConfigSheet.ts';

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
  problems?: string[];
  facts?: FactWords;
  tables?: Record<string, RuleRow[]>;
  table_warnings?: Record<string, string[]>;
}

const MODES = [
  { value: '', label: 'Visible', line: 'Checked every minute and shown in the list.' },
  { value: 'parked', label: 'Park', line: 'Hidden from the list, checked every 15 minutes. Comes back by itself when something needs you.' },
  { value: 'paused', label: 'Pause', line: 'Hidden and not checked at all. Stays hidden until you bring it back.' },
];

const list = ref<RawWorkspace[]>([]);
const selected = ref(0);
const catalogue = ref<ConnectorSpec[]>([]);
const fields = ref<FormFields>({ workspace: [], theme: [], rules: [], statuses: [] });
const loadedIds = new Map<number, string>();
const facts = ref<FactWords>({});
const tables = ref<Record<string, RuleRow[]>>({});
const tableWarnings = ref<Record<string, string[]>>({});
const connectorsHead = useTemplateRef<HTMLElement>('connectors-head');
const typed = new Map<ConnectorEntry, Record<string, string>>();
const typedCount = ref(0);
const loadedKey = ref('');
const adding = ref(false);
const close = () => {
  ui.settings = false;
  ui.settingsNew = false;
  ui.settingsAt = '';
};
const {
  ask,
  requestClose,
  answer,
  confirm,
  problems,
  fieldErrors,
  unloaded,
  dirty,
  save: saveTo,
} = useConfigSheet<ConfigReply>({
  isOpen: () => ui.settings,
  close,
  changed: () => typedCount.value > 0 || settingsKey(list.value) !== loadedKey.value,
  apply: (reply) => {
    list.value = (reply.workspaces || []).map(normaliseForForm);
    catalogue.value = reply.connectors || [];
    fields.value = reply.fields;
    typed.clear();
    typedCount.value = 0;
    selected.value = Math.max(
      0,
      list.value.findIndex((workspace) => workspace.id === snapshot.workspace.id),
    );
    loadedIds.clear();
    list.value.forEach((workspace) => loadedIds.set(uidOf(workspace), workspace.id));
    facts.value = reply.facts || {};
    tables.value = reply.tables || {};
    tableWarnings.value = reply.table_warnings || {};
    loadedKey.value = settingsKey(list.value);
    adding.value = ui.settingsNew || !list.value.length;
    if (adding.value) {
      addWorkspace();
      loadedKey.value = settingsKey(list.value);
    }
    return nextTick().then(() => {
      if (ui.settingsAt === 'connectors') {
        connectorsHead.value?.scrollIntoView({ block: 'start' });
      }
      ui.settingsAt = '';
    });
  },
});
/** The server's message for one field of the open workspace, addressed like workspaces[0].rules.backlog_rows. */
const errorAt = (path: string) => fieldErrors.value[`workspaces[${selected.value}].${path}`] || '';
const idHint = computed(() => {
  const was = current.value && loadedIds.get(uidOf(current.value));
  return was && current.value && was !== current.value.id
    ? `Its to-dos and marks stay under the old id "${was}"; they do not follow the rename.`
    : '';
});
const ID_SPEC: FieldSpec = { key: 'id', label: 'Source id' };
const LABEL_SPEC: FieldSpec = { key: 'label', label: 'Label' };
const current = computed(() => list.value[selected.value] as RawWorkspace | undefined);
const ruleRows = computed(() =>
  ((current.value && tables.value[current.value.id]) || []).map((row) =>
    ruleText(row, facts.value),
  ),
);
const ruleWarnings = computed(() => (current.value && tableWarnings.value[current.value.id]) || []);
const specOf = (entry: ConnectorEntry): ConnectorSpec =>
  catalogue.value.find((spec) => spec.type === entry.type) || {
    type: entry.type,
    label: entry.type,
    fields: [],
  };
const connectorCards = computed(() =>
  (current.value?.connectors || []).map((entry) => ({
    entry,
    uid: uidOf(entry),
    spec: specOf(entry),
  })),
);
/** The hint under an empty seed field: the colour the server derived from the workspace id, once it is saved. */
const derivedSeedHint = (id: string) => {
  const seed = snapshot.workspaces.find((workspace) => workspace.id === id)?.theme_seed;
  return seed ? `empty: ${seed}, derived from the workspace id` : 'empty derives one from the workspace id';
};
/** A field's stored value as FieldRow shows it; an edit goes back through setOrDrop, so an emptied field leaves the config. */
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
  list.value.push(normaliseForForm({ id: '' }));
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
  confirm(`Delete ${current.value.name || current.value.id}? Its to-dos and marks stay on disk.`, 'Delete', 'Keep', removeWorkspace);
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
  confirm(`Remove the ${label} source from ${current.value.name || current.value.id}?`, 'Remove', 'Keep', () => removeConnector(index));
};
const save = () =>
  saveTo(
    {
      workspaces: list.value.map((workspace) => forSaving(workspace)),
      secrets: pendingSecrets(list.value, typed),
    },
    async () => {
      const created = adding.value ? current.value?.id : '';
      close();
      await reload();
      if (created) {
        await switchWorkspace(created);
      }
    },
  );
</script>
<template>
  <AnimatePresence>
    <SettingsFrame
      v-if="ui.settings"
      :title="adding ? 'New workspace' : 'Workspace settings'"
      label-id="settings-title"
      :dirty="dirty"
      :ask="ask"
      :unloaded="unloaded"
      :problems="problems"
      wide
      @close="requestClose"
      @save="save"
      @answer="answer"
    >
      <div class="sheet-form">
        <template v-if="current">
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
          <fieldset class="workspace-settings-sheet__modes">
            <legend class="field-row__label">In the list</legend>
            <label v-for="mode in MODES" :key="mode.value" class="workspace-settings-sheet__mode">
              <input
                type="radio"
                name="hidden-mode"
                :checked="(current.hidden || '') === mode.value"
                @change="setOrDrop(current, 'hidden', mode.value || undefined)"
              />
              <span class="workspace-settings-sheet__mode-name">{{ mode.label }}</span>
              <span class="workspace-settings-sheet__mode-line">{{ mode.line }}</span>
            </label>
          </fieldset>
          <h4 class="sheet-form__heading">Look</h4>
          <FieldRow
            v-for="spec in fields.theme"
            :key="spec.key"
            :spec="spec"
            :hint="spec.key === 'seed' && !current.theme?.seed ? derivedSeedHint(current.id) : ''"
            :model-value="fieldValue(current.theme, spec.key)"
            @update:model-value="setOrDrop(current.theme, spec.key, $event)"
          />
          <h4 ref="connectors-head" class="sheet-form__heading">Sources</h4>
          <div
            v-for="({ entry, spec: entrySpec, uid }, index) in connectorCards"
            :key="uid"
            class="workspace-settings-sheet__connector"
          >
            <div class="workspace-settings-sheet__connector-head">
              <strong class="workspace-settings-sheet__connector-name">{{ entrySpec.label }}</strong
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
              hint="its name in the feed"
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
          <div class="workspace-settings-sheet__actions">
            <button
              v-for="spec in catalogue"
              :key="spec.type"
              type="button"
              class="btn"
              @click="addConnector(spec)"
            >
              + Add {{ spec.label }} source
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
          <p class="workspace-settings-sheet__rules-note">
            The rows in force, top to bottom: the first one that fits decides. Read-only here: ask
            Claude to change them.
          </p>
          <p v-for="warning in ruleWarnings" :key="warning" class="workspace-settings-sheet__rules-warning">
            {{ warning }}
          </p>
          <ol v-if="ruleRows.length" class="workspace-settings-sheet__rules">
            <li v-for="(rule, index) in ruleRows" :key="index" class="workspace-settings-sheet__rule">
              <span class="workspace-settings-sheet__rule-when">{{ rule.when }}</span>
              <span class="workspace-settings-sheet__rule-then">{{ rule.then }}</span>
            </li>
          </ol>
          <p v-else class="empty">Save the workspace to see its rows.</p>
          <div v-if="!adding" class="workspace-settings-sheet__actions">
            <button type="button" class="btn btn--danger" @click="askRemoveWorkspace">
              Delete workspace
            </button>
          </div>
        </template>
      </div>
    </SettingsFrame>
  </AnimatePresence>
</template>
<style scoped>
.workspace-settings-sheet__connector {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--md-outline-variant);
  border-radius: 12px;
  background: rgb(var(--glass), 0.35);
}

.workspace-settings-sheet__connector-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.workspace-settings-sheet__connector-name {
  flex: 1;
  font-weight: 600;
}

.workspace-settings-sheet__modes {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 8px;
  margin: 0;
  padding: 0;
  border: 0;
}

.workspace-settings-sheet__mode {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
  align-items: center;
  font-size: 14px;
}

.workspace-settings-sheet__mode-name {
  font-weight: 500;
}

.workspace-settings-sheet__mode-line {
  grid-column: 2;
  color: var(--md-on-surface-variant);
  font-size: 13px;
}

.workspace-settings-sheet__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.workspace-settings-sheet__rules {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0 0 0 28px;
  font-size: 13px;
}

.workspace-settings-sheet__rule {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 12px;
  padding: 4px 0;
  border-bottom: 1px solid var(--md-outline-variant);
}

.workspace-settings-sheet__rule-when {
  color: var(--md-on-surface-variant);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.workspace-settings-sheet__rule-then {
  overflow-wrap: anywhere;
}

.workspace-settings-sheet__rules-note {
  margin: 0;
  color: var(--md-on-surface-variant);
}

.workspace-settings-sheet__rules-warning {
  margin: 0;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--md-warn-container);
  color: var(--md-on-warn-container);
}
</style>
