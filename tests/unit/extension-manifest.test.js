'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..', 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('manifest: 필수 키', () => {
  assert.strictEqual(manifest.manifest_version, 3);
  assert.strictEqual(manifest.name, 'SDR HDR');
  assert.strictEqual(manifest.version, '1.0.0');
  assert.strictEqual(typeof manifest.description, 'string');
  assert.ok(manifest.description.trim().length > 0);
  assert.strictEqual(manifest.action.default_popup, 'popup/popup.html');
});

test('manifest: content_scripts 순서·옵션·파일 존재', () => {
  assert.strictEqual(manifest.content_scripts.length, 1);
  const cs = manifest.content_scripts[0];
  assert.deepStrictEqual(cs.matches, ['https://www.youtube.com/*']);
  assert.strictEqual(cs.run_at, 'document_idle');
  assert.strictEqual(cs.all_frames, false);
  assert.deepStrictEqual(
    cs.js,
    [
      'ns.js',
      'detect.js',
      'params.js',
      'tonecurve.js',
      'itm.wgsl.js',
      'hud.js',
      'renderer.js',
      'overlay.js',
      'main.js',
    ].map((f) => 'content/' + f),
  );
  for (const f of cs.js) assert.ok(fs.existsSync(path.join(root, f)), f);
  assert.ok(fs.existsSync(path.join(root, manifest.action.default_popup)));
});

test('manifest: permissions는 storage만, 금지 키 없음', () => {
  assert.deepStrictEqual(manifest.permissions, ['storage']);
  for (const k of ['background', 'host_permissions', 'web_accessible_resources', 'icons']) {
    assert.ok(!(k in manifest), k + ' 없어야 함');
  }
});
