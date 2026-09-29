// Module resolve hook: sends '@contentauth/c2pa-web/inline' to the fake SDK.
// Register it BEFORE importing offscreen.js:
//
//   import { register } from 'node:module';
//   register('./helpers/fake-sdk-hooks.mjs', import.meta.url);
//   const { verify } = await import(repoUrl('extension/src/offscreen/offscreen.js'));
//
// Needs module.register() (Node >= 20.6). Each test file runs in its own
// process under `node --test`, so the redirect never leaks into other files.

const FAKE_SDK = new URL('./fake-c2pa-web.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@contentauth/c2pa-web/inline') {
    return { url: FAKE_SDK, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
