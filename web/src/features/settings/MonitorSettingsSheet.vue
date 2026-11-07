<script setup lang="ts">
// Monitor settings: what belongs to the whole monitor and not to one workspace; notifications save at once like the bell, the four numbers save with Save, and the server validates them.
import { AnimatePresence, M as Motion } from 'motion-v';
import { computed, ref } from 'vue';
import { snapshot, ui, reload, restoreWorkspace, toggleNotifications } from '@/store.ts';
import { listed } from '@/motion.ts';
import type { FieldSpec } from '@/lib/types.ts';
import { useText } from '@/i18n/index.ts';
import FieldRow from '@/ui/FieldRow.vue';
import SettingsFrame from './SettingsFrame.vue';
import { useConfigSheet } from './useConfigSheet.ts';

interface ConfigReply {
  settings?: Record<string, number>;
  settings_fields?: Record<string, { label: string; hint: string; min?: number; max?: number }>;
  config_file?: string;
  problems?: string[];
}

const t = useText();
const draft = ref<Record<string, string>>({});
const specs = ref<FieldSpec[]>([]);
const configFile = ref('');
const loadedKey = ref('');
const hiddenWorkspaces = computed(() => snapshot.workspaces.filter((workspace) => workspace.hidden));
const { ask, requestClose, answer, problems, fieldErrors, unloaded, dirty, save: saveTo } = useConfigSheet<ConfigReply>({
  isOpen: () => ui.monitor,
  close: () => {
    ui.monitor = false;
  },
  changed: () => JSON.stringify(draft.value) !== loadedKey.value,
  apply: (reply) => {
    const fieldsOf = reply.settings_fields || {};
    specs.value = Object.entries(fieldsOf).map(([key, spec]) => ({
      key,
      label: spec.label,
      hint: spec.hint,
      min: spec.min,
      max: spec.max,
    }));
    draft.value = Object.fromEntries(
      Object.keys(fieldsOf).map((key) => [key, String(reply.settings?.[key] ?? '')]),
    );
    loadedKey.value = JSON.stringify(draft.value);
    configFile.value = reply.config_file || '';
  },
});
const save = () =>
  saveTo({ settings: Object.fromEntries(Object.entries(draft.value).map(([key, text]) => [key, Number(text)])) }, () => {
    ui.monitor = false;
    reload();
  });
</script>
<template>
  <AnimatePresence>
    <SettingsFrame
      v-if="ui.monitor"
      :title="t('settings.monitor.title')"
      label-id="monitor-title"
      :dirty="dirty"
      :ask="ask"
      :unloaded="unloaded"
      :problems="problems"
      @close="requestClose"
      @save="save"
      @answer="answer"
    >
      <div class="sheet-form">
        <h4 class="sheet-form__heading">{{ t('settings.monitor.notifications') }}</h4>
        <label class="monitor-settings-sheet__switch">
          <input
            type="checkbox"
            role="switch"
            :checked="snapshot.notifications.desktop"
            @change="toggleNotifications"
          />
          {{ t('settings.monitor.notificationsSwitch') }}
        </label>
        <h4 class="sheet-form__heading">{{ t('settings.monitor.polling') }}</h4>
        <FieldRow
          v-for="spec in specs"
          :key="spec.key"
          v-model="draft[spec.key]"
          :spec="spec"
          :error="fieldErrors['settings.' + spec.key]"
        />
        <template v-if="hiddenWorkspaces.length">
          <h4 class="sheet-form__heading">{{ t('settings.monitor.hiddenHeading') }}</h4>
          <p class="monitor-settings-sheet__note">
            {{ t('settings.monitor.hiddenNote') }}
          </p>
          <AnimatePresence>
            <Motion
              v-for="workspace in hiddenWorkspaces"
              :key="workspace.id"
              v-bind="listed"
              class="monitor-settings-sheet__hidden"
            >
              <strong class="monitor-settings-sheet__hidden-name">{{ workspace.name }}</strong>
              <span class="monitor-settings-sheet__hidden-mode">{{ workspace.hidden }}</span>
              <button
                type="button"
                class="btn"
                :aria-label="t('settings.monitor.restoreLabel', { name: workspace.name })"
                :data-tip="t('settings.monitor.restoreTip')"
                @click="restoreWorkspace(workspace.id)"
              >
                {{ t('settings.monitor.restore') }}
              </button>
            </Motion>
          </AnimatePresence>
        </template>
        <h4 class="sheet-form__heading">{{ t('settings.monitor.configFile') }}</h4>
        <p class="monitor-settings-sheet__file">{{ configFile }}</p>
      </div>
    </SettingsFrame>
  </AnimatePresence>
</template>
<style scoped>
.monitor-settings-sheet__switch {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--md-on-surface-variant);
  font-size: 0.8125rem;
}

.monitor-settings-sheet__note {
  margin: 0;
  color: var(--md-on-surface-variant);
  font-size: 0.8125rem;
}

.monitor-settings-sheet__hidden {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.monitor-settings-sheet__hidden-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.monitor-settings-sheet__hidden-mode {
  color: var(--md-on-surface-variant);
  font-size: 0.8125rem;
}

.monitor-settings-sheet__file {
  margin: 0;
  color: var(--md-on-surface-variant);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
  overflow-wrap: anywhere;
  user-select: all;
}
</style>
