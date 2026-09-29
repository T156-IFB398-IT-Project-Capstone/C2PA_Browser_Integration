// Stand-in for '@contentauth/c2pa-web/inline', used only by tests that call
// the real verify() in extension/src/offscreen/offscreen.js. The redirect is
// installed by fake-sdk-hooks.mjs; offscreen.js itself is not modified.
//
// It never touches WASM or Worker. reader.manifestStore() returns whatever
// store the test queued with setStore(), so verify() runs its real
// determineStatus() + extractManifest() on pre-extracted manifest JSON.

let nextStore = null;
let nextError = null;
export const calls = { createC2pa: 0, fromBlob: [] };

/** Queue the store the next fromBlob() reader returns (null = "no manifest"). */
export function setStore(store) { nextStore = store; nextError = null; }

/** Make the next fromBlob() reject, e.g. with the SDK's UnsupportedType error. */
export function setError(err) { nextError = err; }

export async function createC2pa() {
  calls.createC2pa++;
  return {
    reader: {
      async fromBlob(mimeType, blob) {
        calls.fromBlob.push({ mimeType, size: blob.size });
        if (nextError) throw nextError;
        if (nextStore === null) return null;
        const store = nextStore;
        return { manifestStore: async () => store };
      },
    },
  };
}
