const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRequire } = require('node:module');

for (const consumer of ['jayson', 'xcode']) {
  const dependencyRequire = createRequire(require.resolve(`${consumer}/package.json`));
  const uuid = dependencyRequire('uuid');
  test(`${consumer} rejects undersized UUID output buffers without writing`, () => {
    for (const algorithm of ['v3', 'v5']) {
      for (const [size, offset] of [[1, 0], [16, 1], [16, -1]]) {
        const buffer = new Uint8Array(size).fill(99);
        assert.throws(() => uuid[algorithm]('public-test-value', uuid[algorithm].DNS, buffer, offset), RangeError);
        assert.deepEqual(buffer, new Uint8Array(size).fill(99));
      }
    }
  });
}
test('existing build consumers keep their UUID formats', () => {
  assert.match(require('jayson/lib/utils').generateId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const project = require('xcode').project('synthetic-not-opened.pbxproj');
  project.hash = { project: { objects: {} } };
  assert.match(project.generateUuid(), /^[0-9A-F]{24}$/);
});
