<script setup lang="ts">
// The menu behind the rail's power button: Restart at once, Quit asked once inside it. RMA-425.
import { AnimatePresence, M as Motion } from 'motion-v';
import { ref, toRef, watch } from 'vue';
import { onClickOutside, onKeyStroke } from '@vueuse/core';
import { stopServer } from '@/store.ts';
import { fade } from '@/motion.ts';
import { useText } from '@/i18n/index.ts';

const props = defineProps<{ anchor: HTMLElement | null }>();
const open = defineModel<boolean>('open', { required: true });
const t = useText();
const asking = ref(false);
const bottom = ref(0);
const menu = ref<HTMLElement | null>(null);

watch(open, (shown) => {
  asking.value = false;
  const box = shown ? props.anchor?.getBoundingClientRect() : undefined;
  if (box) {
    bottom.value = window.innerHeight - box.bottom;
  }
});

const act = (action: 'restart' | 'quit') => {
  open.value = false;
  void stopServer(action);
};

onClickOutside(menu, () => (open.value = false), { ignore: [toRef(props, 'anchor')] });
onKeyStroke('Escape', () => {
  open.value = false;
});
</script>
<template>
  <Teleport defer to=".app">
    <AnimatePresence>
      <Motion
        v-if="open"
        ref="menu"
        v-bind="fade"
        class="power-menu"
        role="menu"
        :aria-label="t('rail.power')"
        :style="{ bottom: `${bottom}px` }"
      >
        <p class="power-menu__note">{{ asking ? t('rail.quitQuestion') : t('rail.powerNote') }}</p>
        <div v-if="asking" class="power-menu__row">
          <button type="button" class="btn btn--danger" role="menuitem" @click="act('quit')">{{ t('rail.quit') }}</button>
          <button type="button" class="btn" role="menuitem" @click="asking = false">{{ t('rail.keepRunning') }}</button>
        </div>
        <div v-else class="power-menu__row">
          <button type="button" class="btn" role="menuitem" @click="act('restart')">{{ t('rail.restart') }}</button>
          <button type="button" class="btn btn--danger" role="menuitem" @click="asking = true">{{ t('rail.quit') }}</button>
        </div>
      </Motion>
    </AnimatePresence>
  </Teleport>
</template>
<style scoped>
.power-menu {
  position: fixed;
  left: 15rem;
  z-index: 40;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 17rem;
  padding: 0.75rem;
  border: 1px solid var(--glass-edge);
  border-radius: var(--md-r-card);
  background: rgb(var(--glass), 0.9);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
  font-family: var(--md-font);
  color: var(--md-on-surface);
}

.power-menu__note {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--md-on-surface-variant);
}

.power-menu__row {
  display: flex;
  gap: 0.5rem;
}
</style>
