// background/service-worker.js#fetchAsBytes — MIME type resolution and size
// cap. Same approach as
// docs/phase2/video-mime-fallback-evidence/run-mime-fallback-check.mjs, but
// with a stubbed fetch instead of a local server: no network at all.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeStub } from './helpers/chrome-stub.mjs';
import { repoUrl } from './helpers/fixtures.mjs';

installChromeStub(); // service-worker.js registers chrome.* listeners at import time
globalThis.fetch = async (url) => { throw new Error(`unstubbed fetch in a unit test: ${url}`); };

const { fetchAsBytes } = await import(repoUrl('extension/src/background/service-worker.js'));
const { MAX_ASSET_BYTES } = await import(repoUrl('extension/src/shared/constants.js'));

/** Stub fetch for one test; contentType null = no Content-Type header. */
function stubFetch(t, { contentType = null, status = 200, body = new Uint8Array([1, 2, 3]) } = {}) {
  const headers = contentType ? { 'Content-Type': contentType } : {};
  return t.mock.method(globalThis, 'fetch', async () => new Response(body, { status, headers }));
}

describe('fetchAsBytes', () => {
  test('returns bytes, media type and timing; fetches without credentials', async (t) => {
    const fetchMock = stubFetch(t, { contentType: 'image/png' });
    const res = await fetchAsBytes('https://example.test/a.png');
    assert.equal(res.mediaType, 'image/png');
    assert.deepEqual([...res.bytes], [1, 2, 3]);
    assert.equal(typeof res.fetchMs, 'number');
    assert.deepEqual(fetchMock.mock.calls[0].arguments[1], { credentials: 'omit' });
  });

  test('a supported Content-Type wins over the extension; parameters are stripped', async (t) => {
    stubFetch(t, { contentType: 'image/jpeg; charset=binary' });
    assert.equal((await fetchAsBytes('https://example.test/file.png')).mediaType, 'image/jpeg');
  });

  describe('falls back to the URL extension when Content-Type is missing or unsupported', () => {
    const cases = [
      ['photo.jpg', 'image/jpeg'], ['photo.JPEG', 'image/jpeg'], ['p.png', 'image/png'],
      ['a.gif', 'image/gif'], ['a.webp', 'image/webp'], ['clip.mp4', 'video/mp4'],
      ['clip.MP4?token=1', 'video/mp4'],
    ];
    for (const [file, expected] of cases) {
      for (const contentType of [null, 'application/octet-stream']) {
        test(`${file} with ${contentType ?? 'no Content-Type'} -> ${expected}`, async (t) => {
          stubFetch(t, { contentType });
          assert.equal((await fetchAsBytes(`https://cdn.example.test/${file}`)).mediaType, expected);
        });
      }
    }
  });

  test('unsupported type with no known extension is returned unchanged', async (t) => {
    // verifyOne() in the service worker then reports unsupported_format.
    stubFetch(t, { contentType: 'text/plain' });
    assert.equal((await fetchAsBytes('https://example.test/notes.txt')).mediaType, 'text/plain');
  });

  test('no Content-Type and no extension -> empty media type', async (t) => {
    stubFetch(t);
    assert.equal((await fetchAsBytes('https://example.test/image')).mediaType, '');
  });

  test('extension must end the path (or precede ?)', async (t) => {
    stubFetch(t, { contentType: 'text/html' });
    assert.equal((await fetchAsBytes('https://example.test/photo.jpg.html')).mediaType, 'text/html');
  });

  test('HTTP error status throws', async (t) => {
    stubFetch(t, { status: 404 });
    await assert.rejects(fetchAsBytes('https://example.test/a.jpg'), /Fetch failed \(404\)/);
  });

  test('size cap: exactly MAX_ASSET_BYTES is accepted, one byte more is rejected', async (t) => {
    stubFetch(t, { contentType: 'image/jpeg', body: new Uint8Array(MAX_ASSET_BYTES) });
    assert.equal((await fetchAsBytes('https://example.test/max.jpg')).bytes.length, MAX_ASSET_BYTES);
    t.mock.restoreAll();
    stubFetch(t, { contentType: 'image/jpeg', body: new Uint8Array(MAX_ASSET_BYTES + 1) });
    await assert.rejects(fetchAsBytes('https://example.test/big.jpg'), /Asset too large/);
  });
});
