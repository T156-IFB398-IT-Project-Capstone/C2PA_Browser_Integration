// Preloaded by scripts/run-tests.mjs (`node --import … --test`) so every test
// process can import offscreen.js, which imports the bundled trust-list PEMs.
import { register } from 'node:module';

register('./pem-hooks.mjs', import.meta.url);
