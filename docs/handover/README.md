# Handover package — v1.0.0-handover

**Audience:** Databench engineers turning this browser extension into a built-in
MaxBrowser (Chromium/Brave) settings feature.
**Baseline:** tag `v1.0.0-handover` (commit `6a1ea31`). These documents were added
after the tag and describe the code at the tag.

| Document | What it answers |
|---|---|
| [SETTINGS_CONVERSION_GUIDE.md](SETTINGS_CONVERSION_GUIDE.md) | How each extension component maps to a browser-native equivalent; what is reusable; why the offscreen hop disappears; engine options; trust-list management; privacy rules; ON/OFF → browser preference; post-conversion test checklist |
| [SEAM_DOCUMENTATION.md](SEAM_DOCUMENTATION.md) | The eight seams (S1–S8): file, interface, callers, and what Databench replaces |
| [ENGINE_VERSION_RECORD.md](ENGINE_VERSION_RECORD.md) | c2pa-web 0.13.1 (c2pa-rs 0.90.1), the settings used and why, the trust-list source, what was validated and how, the upgrade procedure |
| [BUILD_AND_DEPLOYMENT.md](BUILD_AND_DEPLOYMENT.md) | Developer setup, build, checks and CI, release procedure, fresh-clone verification, test-bench deployment, MaxBrowser install (not yet verified) |

Related material in the repository:
- `KNOWN_LIMITATIONS.md`
- `docs/phase2/RELEASE_NOTES_v1.0.0-handover.md`
- `docs/phase2/decisions/`: trust anchors; no network during verification
- `docs/phase2/engine-check/`: engine-level evidence
- `perf/results/2026-10-07/`: performance
- `tests/engine/README.md`: how to run the engine-level check

## Known limitations, stated plainly

- **Trust list:** it ships with each release and is **not real-time**. There is no
  revocation (OCSP/CRL) checking.
- **CAWG identity:** CAWG identity assertions are **not decoded**, so they are not
  validated. Decoding them would trigger a network lookup.
- **Remote manifests:** they are not fetched. Such assets read "Credentials stored
  online — not checked".
- **QA fixes 3 and 4 are outstanding:**
  - the popup and test-bench badge rule versus the in-page rule,
  - the "Timestamp: Trusted" label,
  - the test-bench fixture labels.
- **MaxBrowser:** untested. Only Chrome has been verified.
- **Remux:** remuxing drops the C2PA box. This was reported by the 12 Oct final QA;
  evidence in the repository is outstanding.
- **Streaming:** MSE-streamed (`blob:`) media cannot be verified.
- **Stripped metadata:** it cannot be told apart from never-signed media.
- **Unit tests:** they use a stand-in SDK. Only the engine-level check exercises
  the engine.
