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
  assert.strictEqual(manifest.version, '1.3.6');
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

test('manifest: permissions는 storage·nativeMessaging만, 금지 키 없음', () => {
  assert.deepStrictEqual(manifest.permissions, ['storage', 'nativeMessaging']);
  for (const k of ['host_permissions', 'web_accessible_resources']) {
    assert.ok(!(k in manifest), k + ' 없어야 함');
  }
});

function pngSize(rel) {
  const b = fs.readFileSync(path.join(root, rel));
  assert.strictEqual(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', rel);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test('manifest: background 파일 존재, content_scripts에는 없음', () => {
  assert.deepStrictEqual(manifest.background, { service_worker: 'content/background.js' });
  assert.ok(fs.existsSync(path.join(root, manifest.background.service_worker)));
  assert.ok(!manifest.content_scripts[0].js.includes('content/background.js'));
});

test('manifest: icons·default_icon 파일 존재와 PNG 크기', () => {
  assert.deepStrictEqual(Object.keys(manifest.icons), ['48', '96', '128', '256', '512']);
  assert.deepStrictEqual(Object.keys(manifest.action.default_icon), ['16', '19', '32', '38']);
  assert.strictEqual(manifest.action.default_title, 'SDR HDR');
  for (const map of [manifest.icons, manifest.action.default_icon]) {
    for (const [k, f] of Object.entries(map)) {
      assert.deepStrictEqual(pngSize(f), [Number(k), Number(k)], f);
    }
  }
});
