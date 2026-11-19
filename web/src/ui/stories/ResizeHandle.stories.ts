import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import ResizeHandle from '../ResizeHandle.vue';
import { resizeHandleStorybookMock as mock } from './ResizeHandle.mock.ts';

const meta = {
  title: 'Primitives/ResizeHandle',
  component: ResizeHandle,
  args: { axis: 'y', top: false, off: false, label: mock.label } as never,
  argTypes: {
    axis: { control: 'radio', options: ['x', 'y'] },
    top: { control: 'boolean', description: 'Handle on the top edge (y axis)' },
    off: { control: 'boolean', description: 'Hidden and inert' },
  } as never,
  render: (args) => ({
    components: { ResizeHandle },
    setup: () => {
      const size = ref(mock.size);
      const bounds = () => ({ current: size.value, min: mock.min, max: mock.max });
      const style = () => (args.axis === 'y' ? { height: size.value + 'px' } : { width: size.value + 'px' });
      return { args, size, bounds, style, mock };
    },
    template: `<div class="surface" :style="{ position: 'relative', border: '1px solid var(--md-outline-variant)', borderRadius: '0.5rem', padding: '1rem', boxSizing: 'border-box', width: args.axis === 'y' ? '100%' : size + 'px', height: args.axis === 'y' ? size + 'px' : '16rem' }">
      Size {{ size }}px (min {{ mock.min }}, max {{ mock.max }}). Drag the edge, use the arrow keys, or double-click to reset.
      <ResizeHandle v-bind="args" :bounds="bounds" @resize="size = $event" @reset="size = mock.size" />
    </div>`,
  }),
} satisfies Meta<typeof ResizeHandle>;

export default meta;

export const Handle: StoryObj<typeof meta> = {};
