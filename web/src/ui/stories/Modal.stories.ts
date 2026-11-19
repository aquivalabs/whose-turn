import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import Modal from '../Modal.vue';
import { modalStorybookMock } from './Modal.mock.ts';

interface Args {
  title: string;
  flush: boolean;
  footer: boolean;
  longBody: boolean;
}

const meta = {
  title: 'Primitives/Modal',
  component: Modal,
  args: { title: modalStorybookMock.title, flush: false, footer: true, longBody: false, labelId: 'modal-story-title' } as never,
  argTypes: {
    flush: { control: 'boolean', description: 'Body without padding' },
    footer: { control: 'boolean', description: 'Show the footer slot' },
    longBody: { control: 'boolean', description: 'Body longer than the card, so it scrolls' },
  } as never,
  render: (args) => ({
    components: { Modal },
    setup: () => {
      const open = ref(true);
      const { footer, longBody } = args as unknown as Args;
      const paragraphs = [...Array(longBody ? 20 : 3).keys()].map((index) => modalStorybookMock.paragraphs[index % 3]);
      return { args, open, footer, longBody, paragraphs, buttons: modalStorybookMock.footer };
    },
    template: `<div>
      <button type="button" class="btn" @click="open = true">Open dialog</button>
      <Modal v-if="open" v-bind="args" @close="open = false">
        <p v-for="(text, index) in paragraphs" :key="index">{{ text }}</p>
        <template v-if="args.footer" #footer><button v-for="label in buttons" :key="label" type="button" class="btn">{{ label }}</button></template>
      </Modal>
    </div>`,
  }),
} satisfies Meta<typeof Modal>;

export default meta;

export const Dialog: StoryObj<typeof meta> = {};
