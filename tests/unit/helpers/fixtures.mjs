// Shared fixture helpers for the unit tests.
//
// Real fixtures: test-assets/trusted/manifest-<name> are pre-extracted
// manifestStore() JSON from real signed assets (c2pa-web cannot run in Node,
// so tests work on these instead of the image bytes). None of them verifies
// as verified_trusted; Databench supplies real trusted fixtures after handoff.
//
// Synthetic stores: minimal hand-written shapes that exercise one branch of
// determineStatus() each. They are not real assets and must not be presented
// as such.

import fs from 'node:fs';

export const REPO_ROOT = new URL('../../../', import.meta.url);

/** File URL for a repo-relative path, for dynamic import(). */
export const repoUrl = (rel) => new URL(rel, REPO_ROOT).href;

export const MANIFEST_FIXTURES = ['car', 'ChatGPTgen', 'cloudscape', 'crater-lake', 'Firefly-cat', 'sora'];

/** Parsed manifestStore() JSON for test-assets/trusted/manifest-<name>. */
export function loadManifest(name) {
  return JSON.parse(fs.readFileSync(new URL(`test-assets/trusted/manifest-${name}`, REPO_ROOT), 'utf8'));
}

/**
 * Synthetic manifest store for determineStatus().
 * @param {string|null} state           validation_state: 'Trusted' | 'Valid' | 'Invalid' | null
 * @param {{ failure?: object[], success?: object[], status?: object[] }} [codes]
 *   failure/success go in validation_results.activeManifest; status is the
 *   flat validation_status list. Each entry is { code, explanation? }.
 */
export function syntheticStore(state, { failure = [], success = [], status } = {}) {
  const store = {
    active_manifest: 'synthetic:m1',
    validation_state: state,
    validation_results: { activeManifest: { failure, success } },
  };
  if (status) store.validation_status = status;
  return store;
}

/** A c2pa.actions assertion holding `actions`. */
export const actionsAssertion = (actions, label = 'c2pa.actions.v2') => ({ label, data: { actions } });

export const IPTC = 'http://cv.iptc.org/newscodes/digitalsourcetype/';
