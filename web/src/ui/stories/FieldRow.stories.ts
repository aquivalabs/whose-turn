import { ref, watch } from 'vue';
import type { Meta, StoryObj } from '@storybook/vue3';
import FieldRow from '../FieldRow.vue';
import { fieldRowStorybookMock, fieldRowValues } from './FieldRow.mock.ts';

interface Args {
  field: keyof typeof fieldRowStorybookMock;
  error: string;
  fixed: boolean;
}

const meta = {
  title: 'Primitives/FieldRow',
  component: FieldRow,
  args: { field: 'text', error: '', fixed: false } as never,
  argTypes: {
    field: { control: 'select', options: Object.keys(fieldRowStorybookMock), description: 'The kind of field the spec draws' },
    error: { control: 'text' },
    fixed: { control: 'boolean', description: 'Show the value as read-only text' },
    spec: { table: { disable: true } },
  } as never,
  render: (args) => ({
    components: { FieldRow },
    setup: () => {
      const model = ref<string | string[] | boolean | undefined>();
      const reset = () => {
        model.value = fieldRowValues[(args as unknown as Args).field] as never;
      };
      reset();
      watch(() => (args as unknown as Args).field, reset);
      return { args, model, reset, specs: fieldRowStorybookMock };
    },
    template: `<div style="flex: 1">
      <FieldRow v-model="model" :spec="specs[args.field]" :error="args.error" :fixed="args.fixed" :placeholder="specs[args.field].placeholder" />
      <p style="font-size: 0.75rem; opacity: 0.7">value: {{ JSON.stringify(model) }}</p>
    </div>`,
  }),
  parameters: { frame: { width: '24rem' } },
} satisfies Meta<typeof FieldRow>;

export default meta;

export const Field: StoryObj<typeof meta> = {};
