// Minimal `chrome` global so extension modules that register listeners at
// import time (service-worker.js, offscreen.js) can be imported in Node.
// Same surface as docs/phase2/video-mime-fallback-evidence/run-mime-fallback-check.mjs.
//
// listeners.<event> collects every callback registered, so a test can call
// e.g. the offscreen document's onMessage handler directly.

export const listeners = {};

const event = (name) => ({
  addListener: (fn) => { (listeners[name] ??= []).push(fn); },
});
const noop = () => {};

export function installChromeStub() {
  globalThis.chrome = {
    alarms: { get: noop, create: noop, onAlarm: event('alarms.onAlarm') },
    offscreen: { hasDocument: async () => false, createDocument: async () => {}, Reason: { WORKERS: 'WORKERS' } },
    runtime: {
      onMessage: event('runtime.onMessage'),
      onInstalled: event('runtime.onInstalled'),
      onStartup: event('runtime.onStartup'),
      sendMessage: async () => ({}),
    },
    tabs: { onRemoved: event('tabs.onRemoved'), onUpdated: event('tabs.onUpdated') },
    storage: { local: { get: async () => ({}), set: async () => {} } },
  };
  return globalThis.chrome;
}
