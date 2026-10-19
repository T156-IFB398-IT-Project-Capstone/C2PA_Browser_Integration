# Engine version record

**Baseline:** tag `v1.0.0-handover` (commit `6a1ea31`).

## Version

| Component | Version | Evidence |
|---|---|---|
| `@contentauth/c2pa-web` | **0.13.1, pinned exactly** (no caret range; PR #29) | `package.json`, `package-lock.json` |
| `@contentauth/c2pa-wasm` (dependency of c2pa-web) | 0.11.0 | `package-lock.json` |
| c2pa-rs (compiled into the WASM) | 0.90.1 | Source-path strings `c2pa-0.90.1` in `node_modules/@contentauth/c2pa-web/dist/resources/c2pa_bg.wasm`; same method as SPIKE-001 |
| esbuild (build only) | `^0.25.12` | `package.json` (devDependency) |

- **History:** the Phase 2 MP4 spike (SPIKE-001, `docs/phase2/spike-001-mp4-verification.md`) ran on c2pa-web **0.7.0** (c2pa-rs 0.76.1). Builds then resolved 0.13.1 through the caret range, after Dependabot PR #6 (3 Aug). The exact pin removes that drift.
- **Why exact:** c2pa-web is pre-1.0 and has breaking changes between releases (CLAUDE.md constraint 2).

## Settings used, and why

Defined in `extension/src/offscreen/offscreen.js` as `ENGINE_SETTINGS` and passed
to `createC2pa({ settings })`. The SDK converts the names to snake_case and hands
them to c2pa-rs.

| Setting | Value | Why | Evidence |
|---|---|---|---|
| `trust.trustAnchors` | **One PEM string**: the official C2PA Trust List and TSA Trust List, 55 certificates | Lets C2PA signers chain to a trusted CA. Before PR #31 nothing could be trusted (risk R20). It must be one string: the SDK fetches URLs and every item of an array. | `docs/phase2/engine-check/after-trust-anchors/`; `docs/phase2/decisions/2026-10-19-trust-anchors.md` |
| `verify.remoteManifestFetch` | `false` | No outbound request for remote-only manifests (risk R21). These assets read `remote_not_checked`. The key is not in the 0.13.1 TypeScript types, but is honoured. | `docs/phase2/engine-check/after-remote-manifests/` |
| `core.decodeIdentityAssertions` | `false` | Decoding CAWG identity assertions fetched a DID document from the identity provider. Found by the engine-level check; the 12 Oct QA had not recorded it. | `docs/phase2/engine-check/before/` (request recorded) vs `after-remote-manifests/` (none); `docs/phase2/decisions/2026-10-19-no-network-verification.md` |
| `cawgTrust.verifyTrustList` | `true` | Kept from PR #11. It concerns CAWG identity only, and has no effect while identity assertions are not decoded. | `offscreen.js` comment |

If the engine rejects these settings, verification returns an **error result**.
There is no silent fallback to SDK defaults
(`tests/unit/engine-settings.test.mjs`).

**Not usable in 0.13.1:** `core.allowedNetworkHosts`. The SDK serialises arrays as
maps, and the engine then refuses to start: `BadParam("invalid type: map,
expected a sequence")`, from a probe run on 19 Oct recorded in the no-network
decision note.

## Trust-list source

From `trust-lists/c2pa-conformance/SOURCE.json` and the trust-anchor decision:

| File | Certificates | SHA-256 |
|---|---|---|
| `C2PA-TRUST-LIST.pem` | 32 | `b3949271a07b007e92ef1d18050b55388f5e0d2686a16fd864176c48421af8ae` |
| `C2PA-TSA-TRUST-LIST.pem` | 23 | `7182cb227c02701be0eebd67ab635fca7f85431c32796fb53b267c657cd2c675` |

Source: `c2pa-org/conformance-public`, commit `47009eedfe6721edd0ce3e69b89c1101cd6f03e5`
(17 Oct 2026), retrieved 2026-10-19T04:35:24Z, licence CC-BY-4.0.

## What was validated, and how

| Method | Exercises the real engine? | What it shows | Where |
|---|---|---|---|
| **Engine-level check** (`node tests/engine/run.mjs`) | **Yes.** Real `verifyDetailed()` with c2pa-web 0.13.1 and `ENGINE_SETTINGS`, in headless Chrome 155. | State, raw SDK result and every network request (page and Web Workers) for 5 samples. Fails on: network capture not working, settings rejected, anchors not one string or not active, any outbound request. | `docs/phase2/engine-check/` — runs `before/` (`3ab97f5`), `after-trust-anchors/` (`95f47e5`), `after-remote-manifests/` (`5036bfc`). A fresh-clone run of `6a1ea31` passed before tagging (`docs/genai-log/2026-10.md`). |
| **Test bench** (`c2pa-test-bench/`) | **Yes.** It bundles the unmodified `verify()`. | Fixture outcomes in a browser | Local `npm run dev`. The hosted copy (c2patest.pages.dev) is behind the repository. |
| **Performance run, 7 Oct 2026** | **Yes**, in the real extension | Timing and heap for 1 and 100 items | `perf/results/2026-10-07/`. Commit `654a59d`, Chrome 154, before PRs #31 and #32: not re-measured with the current settings. |
| **Unit tests** (`npm test`, 174 tests at the tag) | **No.** A stand-in SDK (`tests/unit/helpers/fake-c2pa-web.mjs`) replaces c2pa-web. | Status mapping, result model, settings *given* to the engine, message contracts, cache and queue | `tests/unit/` |

Engine states at the tag (`after-remote-manifests/`):

| Sample | State |
|---|---|
| `car.jpg` | `verified_tsa` |
| `ChatGPTgen.png` | `invalid_or_changed` |
| `crater-lake.jpg` | `remote_not_checked` |
| `cloudscape.jpeg` | `invalid_or_changed` |
| `sora.MP4` | `invalid_or_changed` |

No outbound request was made. No sample is signed under a CA on the official
list; a test-only control proves that a listed signer reaches `verified_trusted`.

## Upgrade procedure (deliberate, never a side effect)

1. Use a separate branch and PR, and say in the PR that this is an engine upgrade.
2. Change `package.json` to the new **exact** version, then run `npm install` to
   update the lockfile and `npm ci` to check it.
3. Read the new SDK's `dist/lib/settings.d.ts` and release notes:
   - Do `trustAnchors`, `remoteManifestFetch` (snake_case `remote_manifest_fetch`)
     and `decodeIdentityAssertions` still exist with the same meaning?
   - Is a URL or an array still fetched?
4. Run `npm test` and `node scripts/check-syntax.mjs`.
5. Run `node tests/engine/run.mjs --out docs/phase2/engine-check/<upgrade-label>`.
   All checks must pass, and any sample whose state changes must be explained.
6. Run the test bench fixtures (`npm run dev`) and the manual UI checklist
   (`docs/phase2/ui-test-checklist.md`).
7. Update this record (version, c2pa-rs version, evidence) and the release notes.
