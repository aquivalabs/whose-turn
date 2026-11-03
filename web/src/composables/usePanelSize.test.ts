import { beforeEach, expect, test } from 'vitest';
import { snapshot } from '@/store.ts';
import { ceilingHeight, clampSize, floorHeight, MORE_LINE, usePanelSize } from './usePanelSize.ts';

beforeEach(() => {
  localStorage.clear();
  snapshot.workspace = { ...snapshot.workspace, id: 'one' };
});

test('a drag stops at the floor and at the room, and a floor above the room wins', () => {
  expect(clampSize(10, 120, 400)).toBe(120);
  expect(clampSize(900, 120, 400)).toBe(400);
  expect(clampSize(250.4, 120, 400)).toBe(250);
  expect(clampSize(300, 120, 80)).toBe(120);
});

test('the floor shows the first full row and reserves the more line only when rows follow', () => {
  expect(floorHeight(140.2, 1)).toBe(141);
  expect(floorHeight(140, 5)).toBe(140 + MORE_LINE);
});

test('the ceiling leaves every open neighbour its floor and every folded one its height', () => {
  const neighbours = [
    { collapsed: false, height: 300, floor: 120 },
    { collapsed: true, height: 48, floor: 120 },
  ];
  expect(ceilingHeight(700, 12, neighbours)).toBe(700 - 24 - 120 - 48);
});

test('a size is remembered per workspace and cleared by null', () => {
  const panel = usePanelSize('waiting');
  panel.set(260);
  expect(panel.size.value).toBe(260);

  snapshot.workspace = { ...snapshot.workspace, id: 'two' };
  expect(panel.size.value).toBeNull();
  panel.set(180);

  snapshot.workspace = { ...snapshot.workspace, id: 'one' };
  expect(panel.size.value).toBe(260);
  panel.set(null);
  expect(panel.size.value).toBeNull();
  expect(usePanelSize('waiting').size.value).toBeNull();
});
