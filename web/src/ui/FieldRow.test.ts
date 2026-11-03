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

const runs = { key: 'workflow_runs', label: 'Workflow runs', boolean: true, default: true, hint: 'watch runs' };

test('a boolean field is a checkbox that shows its default when unset', () => {
  render(FieldRow, { props: { spec: runs, modelValue: undefined } });

  expect((screen.getByRole('checkbox', { name: 'watch runs' }) as HTMLInputElement).checked).toBe(true);
});

test('unticking a default-on checkbox sends false and ticking it again sends nothing', async () => {
  const { emitted } = render(FieldRow, { props: { spec: runs, modelValue: undefined } });
  const box = screen.getByRole('checkbox');

  await fireEvent.click(box);
  await fireEvent.click(box);

  expect(emitted()['update:modelValue']).toEqual([[false], [undefined]]);
});
