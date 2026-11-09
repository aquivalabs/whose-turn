<script setup lang="ts">
// Workspace settings: one workspace's form (or an empty one for a new workspace), drawn from the catalogues the server sends; the server validates, stores secrets, writes config.json and reloads.
import { AnimatePresence, M as Motion } from 'motion-v';
import { fade } from '@/motion.ts';
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
import { useText } from '@/i18n/index.ts';
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
interface AdapterSpec {
  label?: string;
  fields?: FieldSpec[];
  problem?: string;
}
interface ConfigReply {
  workspaces?: StoredWorkspace[];
  connectors?: ConnectorSpec[];
  adapters?: Record<string, AdapterSpec>;
  fields: FormFields;
  problems?: string[];
  facts?: FactWords;
  tables?: Record<string, RuleRow[]>;
  table_warnings?: Record<string, string[]>;
}

const t = useText();
const MODES = computed(() => [
  { value: '', label: t('settings.workspace.modeVisible'), line: t('settings.workspace.modeVisibleLine') },
  { value: 'parked', label: t('settings.workspace.modePark'), line: t('settings.workspace.modeParkLine') },
  { value: 'paused', label: t('settings.workspace.modePause'), line: t('settings.workspace.modePauseLine') },
]);

const list = ref<RawWorkspace[]>([]);
const selected = ref(0);
const CUSTOM_TYPE = 'module';
const catalogue = ref<ConnectorSpec[]>([]);
const adapters = ref<Record<string, AdapterSpec>>({});
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
    adapters.value = reply.adapters || {};
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
const errorAt = (path: string) => fieldErrors.value[`workspaces[${selected.value}].${path}`] || '';
const idHint = computed(() => {
  const was = current.value && loadedIds.get(uidOf(current.value));
  return was && current.value && was !== current.value.id
    ? t('settings.workspace.renameHint', { was })
    : '';
});
const ID_SPEC = computed<FieldSpec>(() => ({ key: 'id', label: t('settings.workspace.sourceId') }));
const LABEL_SPEC = computed<FieldSpec>(() => ({ key: 'label', label: t('settings.workspace.sourceLabel') }));
const CUSTOM_NAME_SPEC = computed<FieldSpec>(() => ({ key: 'label', label: t('settings.workspace.customName'), required: true }));
const isCustom = (entry: ConnectorEntry) => entry.type === CUSTOM_TYPE;
const adapterName = (entry: ConnectorEntry) => (typeof entry.adapter === 'string' ? entry.adapter : '');
const customHint = (entry: ConnectorEntry) =>
  adapterName(entry)
    ? t('settings.workspace.customFile', { file: `adapters/${adapterName(entry)}.mjs` })
    : t('settings.workspace.customFileNew');
const customProblem = (entry: ConnectorEntry, index: number) =>
  errorAt('connectors[' + index + '].adapter') ||
  adapters.value[adapterName(entry)]?.problem ||
  '';
const current = computed(() => list.value[selected.value] as RawWorkspace | undefined);
const ruleRows = computed(() =>
  ((current.value && tables.value[current.value.id]) || []).map((row) =>
    ruleText(row, facts.value),
  ),
);
const ruleWarnings = computed(() => (current.value && tableWarnings.value[current.value.id]) || []);
const specOf = (entry: ConnectorEntry): ConnectorSpec => {
  const spec = catalogue.value.find((candidate) => candidate.type === entry.type) || {
    type: entry.type,
    label: entry.type,
    fields: [],
  };
  const own = isCustom(entry) ? adapters.value[adapterName(entry)]?.fields : undefined;
  return own ? { ...spec, fields: [...own, ...spec.fields] } : spec;
};
const connectorCards = computed(() =>
  (current.value?.connectors || []).map((entry) => ({
    entry,
    uid: uidOf(entry),
    spec: specOf(entry),
  })),
);
const derivedSeedHint = (id: string) => {
  const seed = snapshot.workspaces.find((workspace) => workspace.id === id)?.theme_seed;
  return seed ? t('settings.workspace.seedDerived', { seed }) : t('settings.workspace.seedEmpty');
};
const fieldValue = (target: Record<string, unknown>, key: string) =>
  target[key] as string | string[] | undefined;
const setSecret = (entry: ConnectorEntry, key: string, value: string) => {
  typed.set(entry, Object.assign(typed.get(entry) || {}, { [key]: value }));
  typedCount.value += 1;
};
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
  confirm(
    t('settings.workspace.deleteQuestion', { name: current.value.name || current.value.id }),
    t('settings.workspace.delete'),
    t('settings.workspace.keep'),
    removeWorkspace,
  );
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
  confirm(
    t('settings.workspace.removeQuestion', { label, name: current.value.name || current.value.id }),
    t('settings.workspace.remove'),
    t('settings.workspace.keep'),
    () => removeConnector(index),
  );
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
      :title="adding ? t('settings.workspace.titleNew') : t('settings.workspace.title')"
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
          <h4 class="sheet-form__heading">{{ t('settings.workspace.heading') }}</h4>
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
            <legend class="field-row__label">{{ t('settings.workspace.inTheList') }}</legend>
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
          <h4 class="sheet-form__heading">{{ t('settings.workspace.look') }}</h4>
          <FieldRow
            v-for="spec in fields.theme"
            :key="spec.key"
            :spec="spec"
            :hint="spec.key === 'seed' && !current.theme?.seed ? derivedSeedHint(current.id) : ''"
            :model-value="fieldValue(current.theme, spec.key)"
            @update:model-value="setOrDrop(current.theme, spec.key, $event)"
          />
          <h4 ref="connectors-head" class="sheet-form__heading">{{ t('settings.workspace.sources') }}</h4>
          <div
            v-for="({ entry, spec: entrySpec, uid }, index) in connectorCards"
            :key="uid"
            class="workspace-settings-sheet__connector"
          >
            <div class="workspace-settings-sheet__connector-head">
              <strong class="workspace-settings-sheet__connector-name">{{ entrySpec.label }}</strong
              ><button type="button" class="btn btn--danger" @click="askRemoveConnector(index)">
                {{ t('settings.workspace.remove') }}
              </button>
            </div>
            <FieldRow
              :spec="ID_SPEC"
              :placeholder="entrySpec.type"
              :hint="t('settings.workspace.sourceIdHint')"
              :model-value="fieldValue(entry, 'id')"
              @update:model-value="setOrDrop(entry, 'id', $event)"
            />
            <AnimatePresence>
              <Motion
                v-if="isCustom(entry) && customProblem(entry, index)"
                v-bind="fade"
                class="workspace-settings-sheet__problem"
                role="alert"
              >
                {{ customProblem(entry, index) }}
              </Motion>
            </AnimatePresence>
            <FieldRow
              v-if="isCustom(entry)"
              :spec="CUSTOM_NAME_SPEC"
              :hint="customHint(entry)"
              :model-value="fieldValue(entry, 'label')"
              @update:model-value="setOrDrop(entry, 'label', $event)"
            />
            <FieldRow
              v-else
              :spec="LABEL_SPEC"
              :placeholder="entrySpec.label"
              :hint="t('settings.workspace.sourceLabelHint')"
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
              {{ t('settings.workspace.addSource', { label: spec.label }) }}
            </button>
          </div>
          <h4 class="sheet-form__heading">{{ t('settings.workspace.rules') }}</h4>
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
          <h4 class="sheet-form__heading">{{ t('settings.workspace.table') }}</h4>
          <p class="workspace-settings-sheet__rules-note">
            {{ t('settings.workspace.tableNote') }}
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
          <p v-else class="empty">{{ t('settings.workspace.tableEmpty') }}</p>
          <div v-if="!adding" class="workspace-settings-sheet__actions">
            <button type="button" class="btn btn--danger" @click="askRemoveWorkspace">
              {{ t('settings.workspace.deleteWorkspace') }}
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
  gap: 0.625rem;
  padding: 0.75rem 0.875rem;
  border: 1px solid var(--md-outline-variant);
  border-radius: 0.75rem;
  background: rgb(var(--glass), 0.35);
}

.workspace-settings-sheet__connector-head {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.workspace-settings-sheet__problem {
  padding: 0.375rem 0.625rem;
  border-radius: 0.5rem;
  background: var(--md-warn-container);
  color: var(--md-on-warn-container);
  font-size: 0.8125rem;
}

.workspace-settings-sheet__connector-name {
  flex: 1;
  font-weight: 600;
}

.workspace-settings-sheet__modes {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.25rem 0.5rem;
  margin: 0;
  padding: 0;
  border: 0;
}

.workspace-settings-sheet__mode {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
  align-items: center;
  font-size: 0.875rem;
}

.workspace-settings-sheet__mode-name {
  font-weight: 500;
}

.workspace-settings-sheet__mode-line {
  grid-column: 2;
  color: var(--md-on-surface-variant);
  font-size: 0.8125rem;
}

.workspace-settings-sheet__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.625rem;
}

.workspace-settings-sheet__rules {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin: 0;
  padding: 0 0 0 1.75rem;
  font-size: 0.8125rem;
}

.workspace-settings-sheet__rule {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 0.75rem;
  padding: 0.25rem 0;
  border-bottom: 1px solid var(--md-outline-variant);
}

.workspace-settings-sheet__rule-when {
  color: var(--md-on-surface-variant);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
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
  padding: 0.375rem 0.625rem;
  border-radius: 0.5rem;
  background: var(--md-warn-container);
  color: var(--md-on-warn-container);
}
</style>
