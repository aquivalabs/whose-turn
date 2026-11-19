import type { Meta, StoryObj } from '@storybook/vue3';
import { ref, watch } from 'vue';
import PowerMenu from '../PowerMenu.vue';
import { powerMenuStorybookMock } from './PowerMenu.mock.ts';

const meta = {
  title: 'Islands/Rail/Power menu',
  component: PowerMenu,
  args: { open: true } as never,
  argTypes: { open: { control: 'boolean', description: 'The menu shown; Quit asks once inside it' } } as never,
  render: (args) => ({
    components: { PowerMenu },
    setup: () => {
      const open = ref(Boolean(args.open));
      watch(() => args.open, (value) => (open.value = Boolean(value)));
      return { open, anchor: ref<HTMLElement | null>(null), label: powerMenuStorybookMock.anchorLabel };
    },
    template: `<div style="position: relative; height: 12rem; transform: translateZ(0)">
      <button ref="anchor" type="button" class="btn" style="position: absolute; bottom: 1rem; left: 1rem" @click="open = !open">{{ label }}</button>
      <PowerMenu v-model:open="open" :anchor="anchor" />
    </div>`,
  }),
} satisfies Meta<typeof PowerMenu>;

export default meta;

export const Menu: StoryObj<typeof meta> = {};
