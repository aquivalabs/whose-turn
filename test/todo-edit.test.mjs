import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RULES } from '../lib/config.mjs';
import { createWorkspace } from '../lib/workspace.mjs';
import './fixtures/demo-connector.mjs';
import { scratchDir } from './fixtures/scratch.mjs';

const workspaceWith = (text) => {
  const workspace = createWorkspace(
    { id: 'edit', name: 'Edit', key_pattern: 'PROJ-\\d+', rules: DEFAULT_RULES, connectors: [{ type: 'demo', scenario: 'northwind' }] },
    { dataDir: scratchDir('whose-turn-'), historyDays: 14, http: {}, notify: () => {} },
  );
  workspace.addTodo({ text });
  return { workspace, todo: workspace.store.todos[0] };
};

test('edit replaces the text, trimmed and capped at 500 characters, and re-derives the ticket key', () => {
  // Setup
  const { workspace, todo } = workspaceWith('call the vendor');
  // Exercise
  const changed = workspace.changeTodo(todo, { action: 'edit', text: `  see PROJ-12 ${'x'.repeat(600)}  ` });
  // Verify
  assert.equal(changed, true);
  assert.equal(todo.text.length, 500);
  assert.ok(todo.text.startsWith('see PROJ-12 x'));
  assert.equal(todo.key, 'PROJ-12');
});

test('edit with empty or blank text is refused and leaves the to-do alone', () => {
  // Setup
  const { workspace, todo } = workspaceWith('see PROJ-7');
  for (const text of [undefined, '', '   \n']) {
    // Exercise
    const changed = workspace.changeTodo(todo, { action: 'edit', text });
    // Verify
    assert.equal(changed, false);
    assert.equal(todo.text, 'see PROJ-7');
    assert.equal(todo.key, 'PROJ-7');
  }
});

test('edit to text without a key keeps the earlier key, and never touches done or id', () => {
  // Setup
  const { workspace, todo } = workspaceWith('see PROJ-7');
  const { id } = todo;
  workspace.changeTodo(todo, { action: 'done' });
  const doneAt = todo.done;
  // Exercise
  workspace.changeTodo(todo, { action: 'edit', text: 'no ticket now' });
  // Verify
  assert.equal(todo.text, 'no ticket now');
  assert.equal(todo.key, 'PROJ-7');
  assert.equal(todo.id, id);
  assert.equal(todo.done, doneAt);
});
