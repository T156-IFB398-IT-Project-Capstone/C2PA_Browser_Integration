// WI-2: the popup Shield (pickBadgeState over ai_source_type/has_non_ai_edit)
// and the in-page badge category (contentCategory) come from one ingredient-
// aware action list, so they must always mean the same thing. Runs the real
// verify() with the stand-in SDK (see verify-manifest.test.mjs).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { loadManifest, MANIFEST_FIXTURES, repoUrl, actionsAssertion, IPTC } from './helpers/fixtures.mjs';

register('./helpers/fake-sdk-hooks.mjs', import.meta.url);

const fakeSdk = await import('./helpers/fake-c2pa-web.mjs');
const { verify } = await import(repoUrl('extension/src/offscreen/offscreen.js'));
const { pickBadgeState } = await import(repoUrl('extension/src/shared/badge-map.js'));

// In-page contentCategory -> popup Shield state with the same meaning.
const CATEGORY_TO_SHIELD = {
  ai_generated: 'ai_generated',
  ai_edited:    'ai_edited',
  edited:       'authentic_edited',
  authentic:    'authentic',
};

async function verifyStore(store) {
  fakeSdk.setStore(store);
  return verify({ bytes: [1], mimeType: 'image/jpeg' });
}

/** Assert the two detectors agree, and return both views for extra checks. */
async function assertAgree(store) {
  const result = await verifyStore(store);
  const category = result.manifest.contentCategory;
  const shield = pickBadgeState(result);
  assert.ok(category in CATEGORY_TO_SHIELD, `unexpected contentCategory ${category}`);
  assert.equal(shield, CATEGORY_TO_SHIELD[category], `Shield ${shield} vs in-page ${category}`);
  return { category, shield, manifest: result.manifest };
}

/** Synthetic store (validation_state Valid -> a badge-eligible status). */
const chain = (active, manifests) => ({ active_manifest: active, validation_state: 'Valid', manifests });
const node = (actions, ingredients = []) => ({
  assertions: [actionsAssertion(actions)],
  ingredients: ingredients.map((label) => ({ active_manifest: label })),
});

const OPENED = { action: 'c2pa.opened' };
const CREATED = { action: 'c2pa.created', digitalSourceType: IPTC + 'digitalCapture' };
const AI_CREATED = { action: 'c2pa.created', digitalSourceType: IPTC + 'trainedAlgorithmicMedia' };
const AI_COMPOSITE = { action: 'c2pa.edited', digitalSourceType: IPTC + 'compositeWithTrainedAlgorithmicMedia' };

describe('popup Shield and in-page category agree', () => {
  test('mapping covers every content category', () => {
    assert.deepEqual(Object.keys(CATEGORY_TO_SHIELD).sort(), ['ai_edited', 'ai_generated', 'authentic', 'edited']);
  });

  describe('all six real manifests', () => {
    const expected = {
      car: 'edited', ChatGPTgen: 'ai_generated', cloudscape: 'edited',
      'crater-lake': 'edited', 'Firefly-cat': 'ai_generated', sora: 'ai_generated',
    };
    test('fixture list is complete', () => {
      assert.deepEqual(Object.keys(expected).sort(), [...MANIFEST_FIXTURES].sort());
    });
    for (const name of MANIFEST_FIXTURES) {
      test(`manifest-${name}`, async () => {
        const { category } = await assertAgree(loadManifest(name));
        assert.equal(category, expected[name]);
      });
    }
  });

  describe('synthetic ingredient chains', () => {
    test('AI generation only on an ingredient -> ai_generated', async () => {
      const { category, manifest } = await assertAgree(chain('w', { w: node([OPENED], ['src']), src: node([AI_CREATED]) }));
      assert.equal(category, 'ai_generated');
      assert.equal(manifest.ai_disclosure, true);
    });

    test('composite AI edit only on an ingredient -> ai_edited', async () => {
      const { category, manifest } = await assertAgree(chain('w', { w: node([OPENED], ['src']), src: node([CREATED, AI_COMPOSITE]) }));
      assert.equal(category, 'ai_edited');
      assert.equal(manifest.ai_source_type, 'composite');
    });

    test('generated on an ingredient outranks composite on the active manifest', async () => {
      const { category } = await assertAgree(chain('w', { w: node([AI_COMPOSITE], ['src']), src: node([AI_CREATED]) }));
      assert.equal(category, 'ai_generated');
    });

    test('created + published only -> authentic (published is not an edit)', async () => {
      const { category, manifest } = await assertAgree(chain('w', { w: node([CREATED, { action: 'c2pa.published' }]) }));
      assert.equal(category, 'authentic');
      assert.equal(manifest.has_non_ai_edit, false);
    });

    test('an action without an action code is not an edit', async () => {
      const { category } = await assertAgree(chain('w', { w: node([CREATED, { digitalSourceType: IPTC + 'digitalCapture' }]) }));
      assert.equal(category, 'authentic');
    });

    test('source photo with its own earlier edits -> edited', async () => {
      const { category, manifest } = await assertAgree(chain('w', { w: node([OPENED], ['src']), src: node([CREATED, { action: 'c2pa.cropped' }]) }));
      assert.equal(category, 'edited');
      assert.equal(manifest.has_non_ai_edit, true);
    });

    test('nested chain three levels deep -> AI found at the bottom', async () => {
      const { category } = await assertAgree(chain('a', {
        a: node([OPENED], ['b']),
        b: node([OPENED], ['c']),
        c: node([{ action: 'c2pa.created', digitalSourceType: IPTC + 'algorithmicMedia' }]),
      }));
      assert.equal(category, 'ai_generated');
    });

    test('same ingredient referenced twice is read once', async () => {
      const { category } = await assertAgree(chain('w', { w: node([OPENED], ['src', 'src']), src: node([CREATED]) }));
      assert.equal(category, 'authentic');
    });

    test('ingredient cycle terminates and still agrees', async () => {
      const plain = await assertAgree(chain('a', { a: node([CREATED], ['b']), b: node([OPENED], ['a']) }));
      assert.equal(plain.category, 'authentic');
      const edited = await assertAgree(chain('a', { a: node([CREATED], ['b']), b: node([{ action: 'c2pa.resized' }], ['a']) }));
      assert.equal(edited.category, 'edited');
    });
  });
});

// Not unified by WI-2: with no action history at all, contentCategory is null
// (the in-page badge falls back to the neutral "unverifiable" icon when
// trusted), but badge-map.js#pickBadgeState still returns "authentic". Fixing
// this needs a badge-map.js change — proposal for Brian, not done here.
test('KNOWN ISSUE: manifest with no action history — no in-page category, popup Shield says authentic', async () => {
  const result = await verifyStore(chain('w', { w: { assertions: [] } }));
  assert.equal(result.manifest.contentCategory, null);
  assert.equal(pickBadgeState(result), 'authentic');
});
