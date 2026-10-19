# Merged branches record

Recorded 19 October 2026. The repository is currently Public; this file
contains repository facts only.

## 1. Purpose

On 19 Oct 2026 eight work branches were deleted from GitHub during a branch
cleanup, after each tip was verified as an ancestor of `main`
(`git merge-base --is-ancestor <tip> origin/main`). The same day they were
restored at their original tips, so the branch names cited in team documents
and in the GenAI log still resolve. Every commit on these branches is already
in `main`; restoring them changed no code. This file records each branch's
tip, the pull request that brought it into `main`, and how to restore it if it
is deleted again.

## 2. The eight branches

Times are AEST (+10:00). PR merge times are UTC, from `gh pr view <N> --json
mergedAt,mergeCommit`. "Restored" times come from the push log in
`docs/phase2/branch-cleanup-report.md`.

| Branch | Tip SHA | Tip author, date | PR | PR merged (UTC) | PR merge commit | Contents | Local backup tag | Restored 19 Oct |
|---|---|---|---|---|---|---|---|---|
| `Badge-Wording-Change` | `b54e3a8b14aaea6fc7feadbfd95f43e0e60b5ae0` | Brian Chiu, 2026-10-08 | #25 | 2026-10-09 11:29:51 | `b54e3a8` (auto, see §3) | Verification-state wording and tooltip heading changes, on top of `0e8a26c` | `backup/Badge-Wording-Change-20261019` | 13:55:45 |
| `Image-logo-popup` | `aa369b15c558123988a4d624baeecfbe8f96b702` | Van Thien Phuoc Mai (merge of `main`), 2026-09-07; work by Brian Chiu | #12 | 2026-09-07 09:09:36 | `8f28df564f2738a4d8900d6454f63e312e65e84c` | Popup logos and images, hover tooltip, structured-facts detail modal, click-to-scroll for Live Media | `backup/Image-logo-popup-20261019` | 13:55:54 |
| `Logo-Shadow` | `0e8a26ca911aa23cfc57d7422ad971d45cfb3295` | Brian Chiu, 2026-10-08 | #24 | 2026-10-09 11:29:51 | `0e8a26c` (auto, see §3) | Thin dark outline on corner badges for contrast | `backup/Logo-Shadow-20261019` | 13:56:04 |
| `MP4-Badge` | `6bf834c12bbcbc0de261a8bae1aab78883d3a0af` | Brian-brocode, 2026-09-30 | none (via #23) | 2026-10-06 13:56:46 (as part of #23) | `654a59dc5936779bfc2599720040452ac14b60c1` | Show the corner badge on `<video>` results | `backup/MP4-Badge-20261019` | 13:56:14 |
| `feat/dynamic-c2pa-trust-validation` | `29a25a5eccaa24fbbd3de4e8801f9febe0d006b1` | Van Thien Phuoc Mai (merge of `main`), 2026-09-07; work by Jonah Schmidley | #11 | 2026-09-07 09:10:02 | `b7a5d228a082c08ca6a7902fd5e26d3ce85f2c0b` | CAWG trust list validation. Note: despite the name, trust anchors are not configured on `main` (`git grep trustAnchors origin/main`, cleanup report §6) | `backup/feat-dynamic-c2pa-trust-validation-20261019` | 13:56:23 |
| `feat/on-off-control` | `a8ce7a002632063bbc94cfa5e872b4e737c45d7c` | Brian Chiu, 2026-10-09 | #26 | 2026-10-09 11:29:49 | `3496e4b1a972c3b1d2b9d13c8e29561377bb1a10` | ON/OFF switch (`3b344d8`) and badge layout fix (`a8ce7a0`); also carries `0e8a26c` and `b54e3a8` | `backup/feat-on-off-control-20261019` | 13:56:32 |
| `grace` | `3e98d378b84dae2ace31c44c0a3165c3e87e2f6d` | Van Thien Phuoc Mai (merge of `main`), 2026-06-07; work by gracesong | #13 | 2026-09-07 09:08:18 | `1d651c7a886b9e13b976f27868eb524b9430531c` | Test-asset outcome matrix and a temporary test-assets website | `backup/grace-20261019` | 13:56:43 |
| `integrate/mp4-badge-main` | `c47206cc878bd2eec961d633dfd94821180a07df` | Van Thien Phuoc Mai, 2026-10-06 | #23 | 2026-10-06 13:56:46 | `654a59dc5936779bfc2599720040452ac14b60c1` | Merge of `MP4-Badge` into a branch cut from `main` | `backup/integrate-mp4-badge-main-20261019` | 13:56:53 |

Restore command for each row, if the branch is deleted again (run from a clone
that has the commit; every tip is in `main`'s history):

```bash
git push origin <Tip SHA>:refs/heads/<Branch>
```

Alternatives: the **Restore branch** button on the merged PR page (not
available for `MP4-Badge`, which has no PR of its own), or
`git fetch origin pull/<N>/head:<Branch>` followed by a push.

## 3. Relationships

- **#24 → #25 → #26 were stacked.** Commits `0e8a26c` (Logo-Shadow) →
  `b54e3a8` (Badge-Wording-Change) → `3b344d8` → `a8ce7a0`
  (feat/on-off-control), each the parent of the next. Only #26 was actually
  merged (merge commit `3496e4b`, 11:29:49 UTC). GitHub marked #24 and #25 as
  merged 2 seconds later, because their head commits had just arrived on
  `main`, and reports each PR's own head commit as its "merge commit".
  Evidence: `gh pr view 24/25/26 --json mergedAt,mergeCommit`; and
  `gh api repos/{owner}/{repo}/commits/<sha>/pulls` returns #26 for all four
  commits.
- **`MP4-Badge` reached `main` through #23.** Its tip `6bf834c` was merged into
  `integrate/mp4-badge-main` as `c47206c`, which PR #23 merged into `main` as
  `654a59d`.
- **#11, #12 and #13 were all merged on 7 Sep 2026** (09:08–09:10 UTC), during
  the Sprint 2–3 integration.

## 4. Other merged PRs whose branches were deleted earlier

From `gh pr list --state merged --limit 100` (19 Oct 2026). None of these
branches exist in this repository any more (`git ls-remote --heads origin`).
PRs #2 and #8 were closed without merging and are not listed.

| PR | Branch | Merged |
|---|---|---|
| #1 | `antares_ver2` | 2026-05-11 |
| #3 | `extension-only-migration` | 2026-05-19 |
| #4, #5 | `extension-only-migration-final-version` | 2026-05-19 |
| #6 | `dependabot/npm_and_yarn/multi-869228f4b3` | 2026-08-03 |
| #7 | `feature/tsa-verification` (from the `arc-js` fork) | 2026-08-13 |
| #9 | `spike/mp4-verification` | 2026-08-14 |
| #10 | `feat/sprint2-3-ui-update` | 2026-09-07 |
| #14 | `feat/sprint2-3-ui-with-dev-setup` | 2026-09-07 |
| #15 | `fix/popup-thumb-css` | 2026-09-07 |
| #16 | `fix/dev-initial-build-race` | 2026-09-07 |
| #17 | `fix/dev-stale-bundle-message` | 2026-09-07 |
| #18 | `fix/dev-build-before-port` | 2026-09-07 |
| #19 | `feat/ci-minimal` | 2026-09-29 |
| #20 | `feat/unit-tests` | 2026-09-29 |
| #21 | `docs/ui-test-checklist` | 2026-09-29 |
| #22 | `fix/unify-ai-detectors` | 2026-09-29 |
| #27 | `docs-trust-list-handover` | 2026-10-09 |

## 5. Backups

- Bundle: `T156-repo-backup-20261019.bundle` (kept on Lucas's machine, outside
  the repository), SHA-256
  `450b9e14c8789bb1b81735faf0d0041b1955bf58d6596e16b84676dc79c133ea`.
  `git bundle verify` reported "okay" and "records a complete history".
- Local tags `backup/<branch, slashes as dashes>-20261019` point at each tip in
  the table above. They are **local only and must not be pushed**.

## 6. `perf/run-2026-10-07`

Kept on GitHub at `1f34c3e`. Its single commit is merged into `main` through
branch `chore/merge-perf-results` (merge commit `f580d5a`, parents `1f34c3e`
and `3496e4b`) with a merge commit, so `1f34c3e` keeps its hash and becomes
reachable from `main` once that PR is merged. The team reports cite this
branch by name, so it must not be deleted until the A2/A3 submissions are
done.
