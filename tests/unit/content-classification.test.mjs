// In-page content category: classifyContentFromActions(), classifyContent()
// (which walks ingredients via the private collectActionsDeep()), and
// describeActions().

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyContentFromActions,
  classifyContent,
  describeActions,
} from '../../extension/src/offscreen/offscreen.js';
import { loadManifest, actionsAssertion, IPTC } from './helpers/fixtures.mjs';

const created = (dst) => ({ action: 'c2pa.created', ...(dst && { digitalSourceType: IPTC + dst }) });

describe('classifyContentFromActions', () => {
  test('no actions -> null', () => {
    assert.equal(classifyContentFromActions([]), null);
    assert.equal(classifyContentFromActions(undefined), null);
  });

  test('created / opened / published only -> authentic', () => {
    const actions = [created('digitalCapture'), { action: 'c2pa.opened' }, { action: 'c2pa.published' }];
    assert.equal(classifyContentFromActions(actions), 'authentic');
  });

  test('any other action -> edited', () => {
    assert.equal(classifyContentFromActions([created(), { action: 'c2pa.cropped' }]), 'edited');
  });

  test('trainedAlgorithmicMedia / algorithmicMedia -> ai_generated', () => {
    assert.equal(classifyContentFromActions([created('trainedAlgorithmicMedia')]), 'ai_generated');
    assert.equal(classifyContentFromActions([created('algorithmicMedia')]), 'ai_generated');
  });

  test('compositeWithTrainedAlgorithmicMedia -> ai_edited', () => {
    const actions = [created(), { action: 'c2pa.edited', digitalSourceType: IPTC + 'compositeWithTrainedAlgorithmicMedia' }];
    assert.equal(classifyContentFromActions(actions), 'ai_edited');
  });

  test('generated outranks composite', () => {
    const actions = [
      { action: 'c2pa.edited', digitalSourceType: IPTC + 'compositeWithTrainedAlgorithmicMedia' },
      created('trainedAlgorithmicMedia'),
    ];
    assert.equal(classifyContentFromActions(actions), 'ai_generated');
  });
});

describe('classifyContent (ingredient walk via collectActionsDeep)', () => {
  const store = (manifests, active = 'wrapper') => ({ active_manifest: active, manifests });

  test('AI disclosure only on an ingredient is still found', () => {
    const s = store({
      wrapper: { assertions: [actionsAssertion([{ action: 'c2pa.opened' }])], ingredients: [{ active_manifest: 'inner' }] },
      inner:   { assertions: [actionsAssertion([created('trainedAlgorithmicMedia')])] },
    });
    assert.equal(classifyContent(s, 'wrapper'), 'ai_generated');
  });

  test('ingredient cycle terminates', () => {
    const s = store({
      a: { assertions: [actionsAssertion([created()])], ingredients: [{ active_manifest: 'b' }] },
      b: { assertions: [actionsAssertion([{ action: 'c2pa.opened' }])], ingredients: [{ active_manifest: 'a' }] },
    }, 'a');
    assert.equal(classifyContent(s, 'a'), 'authentic');
  });

  test('unknown label or no action assertions -> null', () => {
    assert.equal(classifyContent(store({}), 'missing'), null);
    assert.equal(classifyContent(store({ wrapper: { assertions: [] } }), 'wrapper'), null);
  });

  test('both c2pa.actions and c2pa.actions.v2 labels are read', () => {
    const s = store({ wrapper: { assertions: [actionsAssertion([{ action: 'c2pa.resized' }], 'c2pa.actions')] } });
    assert.equal(classifyContent(s, 'wrapper'), 'edited');
  });

  const expected = {
    car: 'edited', ChatGPTgen: 'ai_generated', cloudscape: 'edited',
    'crater-lake': 'edited', 'Firefly-cat': 'ai_generated', sora: 'ai_generated',
  };
  for (const [name, category] of Object.entries(expected)) {
    test(`manifest-${name} -> ${category}`, () => {
      const m = loadManifest(name);
      assert.equal(classifyContent(m, m.active_manifest), category);
    });
  }
});

describe('describeActions', () => {
  test('known codes get labels; agent and AI marker are appended', () => {
    const labels = describeActions([
      { action: 'c2pa.created', softwareAgent: { name: 'Camera' } },
      { action: 'c2pa.color_adjustments', softwareAgent: 'Editor 1.0' },
      created('trainedAlgorithmicMedia'),
    ]);
    assert.deepEqual(labels, ['Created by Camera', 'Color adjusted by Editor 1.0', 'Created (AI)']);
  });

  test('unknown code is title-cased without the c2pa. prefix; missing code is labelled', () => {
    assert.deepEqual(describeActions([{ action: 'c2pa.watermarked' }, {}]), ['Watermarked', 'Unknown action']);
  });

  test('null/undefined input -> empty list', () => {
    assert.deepEqual(describeActions(undefined), []);
  });
});
