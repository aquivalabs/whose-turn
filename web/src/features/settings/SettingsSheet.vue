<script setup lang="ts">
// Settings: the workspace list on the left, one workspace's form on the right, drawn from the catalogues the server sends; the server validates, stores secrets, writes config.json and reloads.
import { ref, computed, watch, nextTick, useTemplateRef } from 'vue';
import { snapshot, ui, reload } from '@/store.ts';
import { getJson, post, problemsOf } from '@/lib/api.ts';
import { SERVER_DOWN, writeProblem } from '@/lib/problems.ts';
import {
  normaliseForForm,
  forSaving,
  pendingSecrets,
  ruleText,
  setOrDrop,
  settingsKey,
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
}

const list = ref<RawWorkspace[]>([]);
const selected = ref(0);
const catalogue = ref<ConnectorSpec[]>([]);
const fields = ref<FormFields>({ workspace: [], theme: [], rules: [], statuses: [] });
const configFile = ref('');
const problems = ref<string[]>([]);
const tables = ref<Record<string, RuleRow[]>>({});
const connectorsHead = useTemplateRef<HTMLElement>('connectors-head');
const typed = new Map<ConnectorEntry, Record<string, string>>();
const typedCount = ref(0);
const loadedKey = ref('');
const ask = ref<Ask | null>(null);
const unloaded = ref('');
const dirty = computed(
  () => !unloaded.value && (typedCount.value > 0 || settingsKey(list.value) !== loadedKey.value),
);
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
/** A field's stored value as FieldRow shows it; an edit goes back through setOrDrop, so an emptied field leaves the config. */
const fieldValue = (target: Record<string, unknown>, key: string) =>
  target[key] as string | string[] | undefined;
const setSecret = (entry: ConnectorEntry, key: string, value: string) => {
  typed.set(entry, Object.assign(typed.get(entry) || {}, { [key]: value }));
  typedCount.value += 1;
};
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
      tables.value = reply.tables || {};
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
      problems.value = problemsOf(reply.error);
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
  [dirty, () => ui.settings],
  () => {
    ui.settingsDirty = ui.settings && dirty.value;
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
        <span
          v-if="!unloaded"
          class="btn btn--tonal"
          role="button"
          tabindex="0"
          @click="save"
          @keydown.enter.prevent="save"
          >Save</span
        >
        <span
          class="btn"
          role="button"
          tabindex="0"
          @click="requestClose"
          @keydown.enter.prevent="requestClose"
          >Close</span
        >
      </div>
      <div v-if="ask" class="settings-sheet__confirm" role="alertdialog">
        <span class="settings-sheet__confirm-text">{{ ask.text }}</span>
        <span class="btn btn--danger" role="button" tabindex="0" @click="answer(true)">{{
          ask.yes
        }}</span>
        <span class="btn" role="button" tabindex="0" @click="answer(false)">{{ ask.no }}</span>
      </div>
      <div v-if="unloaded" class="alert settings-sheet__alert" role="alert">{{ unloaded }}</div>
      <div v-else-if="problems.length" class="alert settings-sheet__alert">
        {{ problems.join('  ·  ') }}
      </div>
      <div v-if="!unloaded" class="settings-sheet__body">
        <ul class="settings-sheet__list">
          <li
            v-for="(workspace, index) in list"
            :key="index"
            class="settings-sheet__workspace"
            :aria-selected="index === selected"
            @click="selected = index"
          >
            {{ workspace.name || workspace.id || 'Workspace ' + (index + 1) }}
          </li>
          <li
            class="settings-sheet__workspace settings-sheet__workspace--add"
            @click="addWorkspace"
          >
            + Add workspace
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
              :model-value="fieldValue(current, spec.key)"
              @update:model-value="setOrDrop(current, spec.key, $event)"
            />
            <h4 class="sheet-form__heading">Theme</h4>
            <FieldRow
              v-for="spec in fields.theme"
              :key="spec.key"
              :spec="spec"
              :model-value="fieldValue(current.theme, spec.key)"
              @update:model-value="setOrDrop(current.theme, spec.key, $event)"
            />
            <h4 ref="connectors-head" class="sheet-form__heading">Connectors</h4>
            <div
              v-for="(entry, index) in current.connectors"
              :key="index"
              class="settings-sheet__connector"
            >
              <div class="settings-sheet__connector-head">
                <strong class="settings-sheet__connector-name">{{ specOf(entry).label }}</strong
                ><span
                  class="btn btn--danger"
                  role="button"
                  tabindex="0"
                  @click="askRemoveConnector(index)"
                  >Remove</span
                >
              </div>
              <FieldRow
                :spec="{ key: 'id', label: 'Entry id' }"
                :placeholder="specOf(entry).type"
                hint="only needed when one type appears twice"
                :model-value="fieldValue(entry, 'id')"
                @update:model-value="setOrDrop(entry, 'id', $event)"
              />
              <FieldRow
                :spec="{ key: 'label', label: 'Label' }"
                :placeholder="specOf(entry).label"
                hint="shown in the feed filter"
                :model-value="fieldValue(entry, 'label')"
                @update:model-value="setOrDrop(entry, 'label', $event)"
              />
              <FieldRow
                v-for="spec in specOf(entry).fields"
                :key="spec.key"
                :spec="spec"
                :model-value="fieldValue(entry, spec.key)"
                @update:model-value="setOrDrop(entry, spec.key, $event)"
                @secret="(key, value) => setSecret(entry, key, value)"
              />
            </div>
            <div class="settings-sheet__actions">
              <span
                v-for="spec in catalogue"
                :key="spec.type"
                class="btn"
                role="button"
                tabindex="0"
                @click="addConnector(spec)"
                >+ {{ spec.label }}</span
              >
            </div>
            <h4 class="sheet-form__heading">Rules</h4>
            <FieldRow
              v-for="spec in fields.rules"
              :key="spec.key"
              :spec="spec"
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
            <ol v-if="ruleRows.length" class="settings-sheet__rules">
              <li v-for="(rule, index) in ruleRows" :key="index" class="settings-sheet__rule">
                <span class="settings-sheet__rule-when">{{ rule.when }}</span>
                <span class="settings-sheet__rule-then">{{ rule.then }}</span>
              </li>
            </ol>
            <p v-else class="empty">Save the workspace to see its rows.</p>
            <div class="settings-sheet__actions">
              <span class="btn btn--danger" role="button" tabindex="0" @click="askRemoveWorkspace"
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

.settings-sheet__workspace[aria-selected='true'] {
  background: var(--md-secondary-container);
  color: var(--md-on-secondary-container);
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
</style>
