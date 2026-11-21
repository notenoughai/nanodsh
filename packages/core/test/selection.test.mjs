import assert from 'node:assert/strict';
import test from 'node:test';
import { launcherBoundary, selectionFlags } from '@nanodsh/core';

test('the boundary ends where the launcher stops knowing the arguments', () => {
  assert.deepEqual(launcherBoundary(['--instance', 'dev', 'work', '--port', '8080', '--dump-config']), { end: 3, profile: 'work', profileIndex: 2 });
  assert.deepEqual(launcherBoundary(['--profile', 'work', '--dump-config']), { end: 3, profile: undefined, profileIndex: undefined });
  assert.deepEqual(launcherBoundary(['work', '--dump-config']), { end: 2, profile: 'work', profileIndex: 0 });
  assert.deepEqual(launcherBoundary(['--port', '8080', 'work']), { end: 0, profile: undefined, profileIndex: undefined });
});

test('a profile flag leaves later positionals to the app', () => {
  assert.deepEqual(launcherBoundary(['--profile', 'work', 'extra']), { end: 2, profile: undefined, profileIndex: undefined });
});

test('selection flags stop before the app arguments', () => {
  assert.deepEqual(selectionFlags(['--profile', 'missing', '--app-flag', '--instance', 'nowhere']), {});
  assert.deepEqual(selectionFlags(['--instance', 'dev', '--port', '8080', '--home', 'elsewhere']), { instance: 'dev' });
});
