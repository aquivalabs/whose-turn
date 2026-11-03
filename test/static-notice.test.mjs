import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStatic } from '../lib/static.mjs';

test('the unbuilt notice names the app directory and the full build command', async () => {
  const serve = createStatic('/opt/whose-turn/dist');
  const { body } = await serve('/');
  const text = String(body);
  assert.match(text, /npm ci &amp;&amp; npm run build/);
  assert.match(text, /<code>\/opt\/whose-turn<\/code>/);
});
