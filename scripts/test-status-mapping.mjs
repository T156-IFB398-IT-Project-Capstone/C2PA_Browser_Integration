// scripts/test-status-mapping.mjs
//
// Test script to verify determineStatus logic against pre-extracted C2PA manifest stores.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join }  from 'node:path';
import { determineStatus } from '../extension/dist/offscreen.js';
import { VERIFY_STATUS } from '../extension/src/shared/constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TEST_CASES = [
  {
    file: '../test-assets/trusted/manifest-car',
    expected: VERIFY_STATUS.VERIFIED_TSA,
    description: '1. Adobe Photoshop manifest (car.jpg) -> TSA validated',
  },
  {
    file: '../test-assets/trusted/manifest-ChatGPTgen',
    expected: VERIFY_STATUS.VERIFIED_UNTRUSTED,
    description: '2. OpenAI ChatGPT manifest (ChatGPTgen.png) -> Untrusted signer',
  },
  {
    file: '../test-assets/trusted/manifest-cloudscape',
    expected: VERIFY_STATUS.VERIFIED_TSA,
    description: '3. Adobe Content Authenticity manifest (cloudscape.jpeg) -> TSA validated',
  },
  {
    store: { active_manifest: 'm1', validation_state: 'Trusted' },
    expected: VERIFY_STATUS.VERIFIED_TRUSTED,
    description: '4. Trusted CA anchor match -> Verified (Trusted)',
  },
  {
    store: {
      active_manifest: 'm1',
      validation_state: 'Valid',
      validation_results: {
        activeManifest: {
          failure: [{ code: 'signingCredential.expired', explanation: 'signing credential expired' }],
          success: []
        }
      }
    },
    expected: VERIFY_STATUS.SIGNING_EXPIRED,
    description: '5. Expired signing cert without TSA -> Expired (No TSA)',
  },
  {
    store: {
      active_manifest: 'm1',
      validation_state: 'Invalid',
      validation_results: {
        activeManifest: {
          failure: [{ code: 'assertion.dataHash.mismatch', explanation: 'data hash invalid' }]
        }
      }
    },
    expected: VERIFY_STATUS.CONTENT_TAMPERED,
    description: '6. Pixel hash mismatch -> Content Tampered',
  },
  {
    store: {
      active_manifest: 'm1',
      validation_state: 'Invalid',
      validation_results: {
        activeManifest: {
          failure: [{ code: 'claimSignature.mismatch', explanation: 'claim signature invalid' }]
        }
      }
    },
    expected: VERIFY_STATUS.BROKEN_SIGNATURE,
    description: '7. Corrupt signature -> Broken Signature',
  },
  {
    store: null,
    expected: VERIFY_STATUS.NO_CREDENTIALS,
    description: '8. Plain asset / null store -> No Credentials',
  },
];

console.log('='.repeat(60));
console.log('Testing determineStatus() against pre-extracted manifest stores');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

for (const tc of TEST_CASES) {
  try {
    let store = tc.store;
    if (tc.file) {
      const filepath = join(__dirname, tc.file);
      const raw = await readFile(filepath, 'utf8');
      store = JSON.parse(raw);
    }
    const resultStatus = determineStatus(store);
    const matches = resultStatus === tc.expected;

    console.log(`\nTest: ${tc.description}`);
    console.log(`  Expected: ${tc.expected}`);
    console.log(`  Actual:   ${resultStatus}`);
    console.log(`  Status:   ${matches ? '✅ PASS' : '❌ FAIL'}`);

    if (matches) {
      passed++;
    } else {
      failed++;
    }
  } catch (err) {
    console.error(`❌ Error in test "${tc.description}":`, err.message);
    failed++;
  }
}

console.log('\n' + '='.repeat(60));
console.log(`Summary: ${passed} passed, ${failed} failed.`);
console.log('='.repeat(60));
