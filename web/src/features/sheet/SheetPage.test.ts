import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { posesOf, speciesNames } from '@/lib/species.ts';
import { registry } from '@/species/index.ts';

const names = speciesNames(registry);

const open = async (search: string) => {
  window.history.replaceState(null, '', `/sheet${search}`);
  vi.resetModules();
  const { default: SheetPage } = await import('./SheetPage.vue');
  return render(SheetPage);
};

const rows = () => screen.getAllByRole('heading', { level: 2 });
const seedsOfFirstRow = () =>
  within(rows()[0].parentElement as HTMLElement)
    .getAllByRole('figure')
    .map((figure) => figure.textContent);

test('by default every species and pose gets a row of six seeds from seed 1', async () => {
  await open('');

  expect(screen.getByRole('heading', { name: 'Species sheet' })).toBeTruthy();
  const rowCount = names.reduce((sum, name) => sum + posesOf(registry, name).length, 0);
  expect(rows()).toHaveLength(rowCount);
  expect(seedsOfFirstRow()).toEqual(['1', '2', '3', '4', '5', '6']);
  expect(screen.getByRole('option', { name: `all (${names.length})` })).toBeTruthy();
});

test('the link picks one species, at most twelve seeds and the first seed', async () => {
  const name = names[0];

  await open(`?species=${name}&seeds=40&from=10`);

  expect(rows()).toHaveLength(posesOf(registry, name).length);
  expect(seedsOfFirstRow()).toEqual(['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21']);
});

test('a negative seed count still draws one seed', async () => {
  await open('?seeds=-5');

  expect(seedsOfFirstRow()).toEqual(['1']);
});

test('choosing a species in the list narrows the sheet to it', async () => {
  const name = names[names.length - 1];
  await open('');

  await fireEvent.update(screen.getByRole('combobox'), name);

  expect(rows()).toHaveLength(posesOf(registry, name).length);
  expect(rows()[0].textContent).toContain(name);
});
