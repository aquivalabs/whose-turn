import { expect, test } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/vue';
import FieldRow from './FieldRow.vue';

test('a list field sends the typed entries as an array and leaves its target alone', async () => {
  const { emitted } = render(FieldRow, {
    props: { spec: { key: 'links', label: 'Links', list: true }, modelValue: ['a'] },
  });

  await fireEvent.update(screen.getByDisplayValue('a'), ' b , , c ');

  expect(emitted()['update:modelValue']).toEqual([[['b', 'c']]]);
});

test('None on a colour field sends an empty value for the parent to drop', async () => {
  const { emitted } = render(FieldRow, {
    props: { spec: { key: 'seed', label: 'Seed colour', colour: true }, modelValue: '#336699' },
  });

  await fireEvent.click(screen.getByRole('button', { name: 'None' }));

  expect(emitted()['update:modelValue']).toEqual([['']]);
});
