import { ref } from 'vue';
import type { Meta, StoryObj } from '@storybook/vue3';
import FeedItemRow from '../FeedItem.vue';
import { feedItemStorybookMock } from './FeedItem.mock.ts';

type Kind = keyof typeof feedItemStorybookMock.items;
interface Args {
  kind: Kind;
  badge: string;
  fresh: boolean;
  flash: boolean;
}

const meta = {
  title: 'Islands/What changed/Item',
  component: FeedItemRow,
  args: { kind: 'comment', badge: 'GH', fresh: true, flash: false } as never,
  argTypes: {
    kind: { control: 'select', options: Object.keys(feedItemStorybookMock.items) },
    badge: { control: 'radio', options: ['GH', ''], description: 'Empty: the plain row without a source badge' },
    fresh: { control: 'boolean', description: 'Unread' },
    flash: { control: 'boolean', description: 'Highlighted after a jump' },
  } as never,
  render: (args) => ({
    components: { FeedItemRow },
    setup: () => {
      const { kind, badge, fresh, flash } = args as unknown as Args;
      const expanded = ref(false);
      const toggle = () => {
        expanded.value = !expanded.value;
      };
      return { item: feedItemStorybookMock.items[kind], source: feedItemStorybookMock.source, badge, fresh, flash, expanded, toggle };
    },
    template:
      '<ul style="list-style: none; margin: 0; padding: 0"><FeedItemRow :item="item" :source="source" :badge="badge" :fresh="fresh" :flash="flash" :expanded="expanded" @toggle="toggle" /></ul>',
  }),
} satisfies Meta<typeof FeedItemRow>;

export default meta;

export const Row: StoryObj<typeof meta> = {};
