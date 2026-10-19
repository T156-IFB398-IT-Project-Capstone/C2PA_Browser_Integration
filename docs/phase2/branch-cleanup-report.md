# Branch audit and cleanup report — 19 October 2026

Repository: `T156-IFB398-IT-Project-Capstone/C2PA_Browser_Integration`
Requested by: Lucas Mai (Technical Lead). Run by Claude Code under
`CLAUDE_CODE_PROMPT_Branch_Cleanup.md`, plan approved by Lucas ("Approve")
on 19 Oct 2026 after the read-only audit.

## 1. Summary

- Before: 10 remote branches, 2 remote tags. Eight non-main branches were
  already fully contained in `main` (tip is an ancestor of `origin/main`,
  `git cherry` empty).
- `perf/run-2026-10-07` was the only branch with unmerged work: one commit,
  `1f34c3e` (performance run results, `perf/analyze.mjs`).
- Done: backup bundle + 10 local backup tags; 8 merged branches deleted from
  GitHub one at a time; local `main` fast-forwarded; one merged local branch
  deleted (`-d`); a stale worktree record pruned.
- `origin/main` merged into `perf/run-2026-10-07` locally (merge commit
  `f580d5a`, genai-log conflict resolved keeping all entries).
- **Later the same day the 8 deleted branches were restored** at their original
  tips, because documents cite them by name, and `f580d5a` was moved to a new
  branch `chore/merge-perf-results` so that `perf/run-2026-10-07` stays at
  `1f34c3e` (Section 13). The perf results go into `main` through that
  branch's PR: **PR open, merge pending** (Section 4).
- Now: 11 remote branches (`main`, `perf/run-2026-10-07`, the 8 restored
  branches, `chore/merge-perf-results`), 2 remote tags (unchanged). No commit
  added to `main` by this task so far.
- Needs a human decision: the repository is **Public** (Team Agreement v3.0
  says private); `main` has no required CI check; none of the 15 Oct QA fixes
  exist anywhere on GitHub.

## 2. Before / after

The "After" column records the state at 13:44 after the cleanup. All eight
deleted branches were restored at 13:55–13:56 (Section 13).

### Remote branches

| Branch | Before (tip) | After |
|---|---|---|
| `main` | `3496e4b` | `3496e4b` (unchanged) |
| `perf/run-2026-10-07` | `1f34c3e` | `1f34c3e` (kept; local branch at `f580d5a`, not yet pushed) |
| `feat/on-off-control` | `a8ce7a0` | deleted |
| `Badge-Wording-Change` | `b54e3a8` | deleted |
| `Logo-Shadow` | `0e8a26c` | deleted |
| `integrate/mp4-badge-main` | `c47206c` | deleted |
| `MP4-Badge` | `6bf834c` | deleted |
| `feat/dynamic-c2pa-trust-validation` | `29a25a5` | deleted |
| `Image-logo-popup` | `aa369b1` | deleted |
| `grace` | `3e98d37` | deleted |
| **Count** | **10** | **2** |

Evidence: `git ls-remote --heads origin` before (13:39:43) and after (13:44:29).

### Tags

| Tag | Points to | Where | Change |
|---|---|---|---|
| `v0.1.2` (annotated) | `60ba321` (19 May, "remove item") | remote + local | none |
| `v0.2.0-handover` | `d2920f0` (PR #18 merge, 7 Sep) | remote + local | none |
| `v1.0.0-handover` | — | — | does not exist yet |
| `backup/branch/*` (7), `backup/main-before-mp4badge-2026-10-06` | various | local only | none (from 6 Oct session) |
| `backup/<branch>-20261019` (10) | branch tips, Section 8 | local only, not pushed | **added** |

### Local

| Item | Before | After |
|---|---|---|
| `main` | `654a59d` (behind origin) | `3496e4b` (fast-forward) |
| `integrate/mp4-badge-main` | `c47206c` | deleted with `git branch -d` |
| `perf/run-2026-10-07` | `1f34c3e` | `f580d5a` (merge of `origin/main`, unpushed) |
| Worktrees | 1 + 1 prunable (folder missing) | 1 |
| Stashes | none | none |

## 3. Per-branch decision log

All checks against `origin/main` = `3496e4b`. "Ancestor" = `git merge-base
--is-ancestor <branch> origin/main`. "Cherry" = `git cherry -v origin/main
<branch>` (empty means no commit missing from `main`). No branch had been
pushed by anyone other than Lucas within the last 7 days (latest teammate push
9 Oct, Brian Chiu), so no branch qualified as ASK-OWNER.

| Branch | Tip | Last author, date | Behind / ahead | Ancestor | Cherry | PR | Cited in docs | Category | Action |
|---|---|---|---|---|---|---|---|---|---|
| `main` | `3496e4b` | Lucas, 9 Oct | — | — | — | — | — | KEEP | none |
| `perf/run-2026-10-07` | `1f34c3e` | Lucas, 7 Oct | 7 / 1 | no | `+ 1f34c3e` | none | yes: branch name in `perf/results/2026-10-07/raw/environment.json`, `results.json`, genai-log; team reports | UNMERGED-WORK | kept; merge via PR (Section 4) |
| `feat/on-off-control` | `a8ce7a0` | Brian Chiu, 9 Oct | 3 / 0 | yes | empty | #26 merged 9 Oct | name as genai-log heading only | MERGED-SAFE-DELETE | deleted 13:43:22 |
| `Badge-Wording-Change` | `b54e3a8` | Brian Chiu, 8 Oct | 5 / 0 | yes | empty | #25 merged 9 Oct | no | MERGED-SAFE-DELETE | deleted 13:43:05 |
| `Logo-Shadow` | `0e8a26c` | Brian Chiu, 8 Oct | 6 / 0 | yes | empty | #24 merged 9 Oct | name as genai-log heading only | MERGED-SAFE-DELETE | deleted 13:42:45 |
| `integrate/mp4-badge-main` | `c47206c` | Lucas, 6 Oct | 8 / 0 | yes | empty | #23 merged 6 Oct | name as genai-log heading only | MERGED-SAFE-DELETE | deleted 13:41:31 (remote), 13:44:43 (local) |
| `MP4-Badge` | `6bf834c` | Brian-brocode, 30 Sep | 9 / 0 | yes | empty | none (merged via #23) | name as genai-log heading only | MERGED-SAFE-DELETE | deleted 13:42:29 |
| `feat/dynamic-c2pa-trust-validation` | `29a25a5` | Lucas (merge), 7 Sep | 45 / 0 | yes | empty | #11 merged 7 Sep | mentioned in genai-log 2026-09 | MERGED-SAFE-DELETE | deleted 13:43:41 |
| `Image-logo-popup` | `aa369b1` | Lucas (merge), 7 Sep | 42 / 0 | yes | empty | #12 merged 7 Sep | mentioned in genai-log 2026-09 | MERGED-SAFE-DELETE | deleted 13:43:56 |
| `grace` | `3e98d37` | Lucas (merge), 7 Jun | 69 / 0 | yes | empty | #13 merged 7 Sep | no | MERGED-SAFE-DELETE | deleted 13:44:24 |

On "cited in docs": the genai-log uses branch names as session headings, which
record where work happened. They are not links that break when a branch is
deleted, because every commit they describe is reachable from `main`. Every
commit hash the team documents cite (`654a59d`, `6bf834c`, `0e8a26c`, `b54e3a8`,
`3b344d8`, `a8ce7a0`, `3496e4b`) remains reachable from `main`.

After each deletion: `git ls-remote --heads origin <branch>` returned 0 lines,
`gh pr view <N>` still reported `MERGED` with its original merge date, and
`main`'s check run ("Build and static checks" on `3496e4b`) stayed `success`.

## 4. Performance-branch merge

**Status: PR open, merge pending** (Lucas to confirm the merge). The merge
commit `f580d5a` now lives on branch `chore/merge-perf-results`, not on
`perf/run-2026-10-07`, which stays at `1f34c3e` on GitHub (Section 13). PR:
**#28** "Merge performance results (run 2026-10-07) and record merged
branches" (`chore/merge-perf-results` → `main`), opened 19 Oct 2026 14:00.
CI "Build and static checks" passed on `c027858` (Actions run
39197390889); `gh pr view 28`: `MERGEABLE`, `CLEAN`.

- Content confirmed: `1f34c3e` is the only commit on the branch not in `main`
  (`git cherry`). It touches 16 files: `perf/results/2026-10-07/` (README,
  `results.json`, 11 raw JSON logs), `perf/analyze.mjs`,
  `docs/phase2/performance-harness-evidence/README.md`,
  `docs/genai-log/2026-10.md`.
- Conflict predicted by `git merge-tree` and confirmed: `docs/genai-log/2026-10.md`
  (add/add — the file was created independently on both sides).
- Resolution: merge commit `f580d5a` (parents `1f34c3e`, `3496e4b`). The file
  is the branch's 6–7 Oct entries, one blank line, then `main`'s 8–9 Oct
  entries. Byte-exact check: `diff <(git show 1f34c3e:F; echo; git show
  origin/main:F) <(git show :F)` printed nothing.
- `git diff --stat origin/main f580d5a`: 16 files, the same set as `1f34c3e`.
- `git merge-base --is-ancestor 1f34c3e f580d5a`: true.
- `npm test` on `f580d5a`: 157 pass / 0 fail (same count as `main` on 9 Oct).
- Merge method: "merge commit" is allowed on the repository (`gh repo view`:
  `mergeCommitAllowed: true`), so the hash `1f34c3e` is preserved.

To complete (after Lucas confirms): `gh pr merge <N> --merge` (merge commit,
no `--delete-branch`), then verify `git merge-base --is-ancestor 1f34c3e
origin/main`. Merge commit SHA and verification output to be added here.

## 5. PR mapping

| PR | Branch | Commits | Merged | Merge commit |
|---|---|---|---|---|
| #11 | `feat/dynamic-c2pa-trust-validation` | CAWG trust list validation | 7 Sep 09:10Z | `b7a5d22` |
| #12 | `Image-logo-popup` | popup logo/image | 7 Sep 09:09Z | `8f28df5` |
| #13 | `grace` | Grace's work | 7 Sep 09:08Z | `1d651c7` |
| #23 | `integrate/mp4-badge-main` | `MP4-Badge` (`6bf834c`) via `c47206c` | 6 Oct 13:56Z | `654a59d` |
| #24 | `Logo-Shadow` | `0e8a26c` | 9 Oct 11:29:51Z | reported as `0e8a26c` |
| #25 | `Badge-Wording-Change` | `0e8a26c`, `b54e3a8` | 9 Oct 11:29:51Z | reported as `b54e3a8` |
| #26 | `feat/on-off-control` | `0e8a26c` → `b54e3a8` → `3b344d8` → `a8ce7a0` | 9 Oct 11:29:49Z | `3496e4b` |
| #27 | `docs-trust-list-handover` (already deleted) | `92c3d1a` | 9 Oct 07:53Z | `61a91b6` |

**How #24 and #25 relate to #26.** Brian's branches were stacked:
`Logo-Shadow` (`0e8a26c`) ← `Badge-Wording-Change` (`b54e3a8`) ←
`feat/on-off-control` (`3b344d8`, `a8ce7a0`). Only #26 was actually merged.
Two seconds later GitHub automatically marked #24 and #25 as merged, because
their head commits had just arrived on `main`, and it reports each PR's head
commit as its "merge commit". Evidence: `gh pr list` merge times and
`mergeCommit` values above; `gh api .../commits/<sha>/pulls` returns #26 for
each of `0e8a26c`, `b54e3a8`, `3b344d8`, `a8ce7a0`. So the documents are right
to cite these four hashes under #26, and #24/#25 need no separate mention.

## 6. `main` since 9 October

`git log origin/main --first-parent --since=2026-10-01`:

| Commit | Date | Author | How it arrived |
|---|---|---|---|
| `3496e4b` | 9 Oct 21:29 | Lucas (merge button) | PR #26 |
| `61a91b6` | 9 Oct 17:53 | Jonah (merge button) | PR #27 |
| `654a59d` | 6 Oct 23:56 | Lucas (merge button) | PR #23 |

No commit has reached `main` after 9 Oct, and no direct pushes. `main` is
3 commits ahead of the #26 branch only because of `92c3d1a` + `61a91b6` (#27)
and the #26 merge commit itself.

Planned QA fixes (15 Oct) — none are on `main`:

| Fix | On `main`? | Evidence |
|---|---|---|
| Trust anchors configured | no | `git grep trustAnchors origin/main` matches only bundled library code in `extension/spike-harness/raw.bundle.js` |
| Remote-manifest setting | no | no match for `remoteManifest`/`fetchRemoteManifests` |
| Badge-rule alignment | no | no commit after 9 Oct |
| Fixture labels | no | no commit after 9 Oct |
| Exact `c2pa-web` pin | no | `package.json`: `"@contentauth/c2pa-web": "^0.13.1"` |
| `extension.crx` removal | no | `git ls-tree -l origin/main extension.crx`: 8,447,915 bytes, added in `a1b9986` (11 Aug) |

The only fork (`arc-js/C2PA_Browser_Integration`) was last pushed 11 Aug.
So the 15 Oct fixes are either unpushed on a teammate's machine or not done.
**Not evidenced either way — Lucas to ask the team.**

## 7. Command log

All times 19 Oct 2026, AEST (+10:00). Repository commands run from the repo
root; `$R` = `repos/T156-IFB398-IT-Project-Capstone/C2PA_Browser_Integration`.
Long arguments are shortened with `…`; every command run is listed.

**Phase A (read-only)**

```
13:35:17 git for-each-ref refs/ (snapshot before fetch, saved to session scratchpad)
13:35:17 git remote -v; git status; git stash list; git worktree list; git branch -a -vv
13:35:18 gh --version; gh auth status
13:35:25 git fetch --all --prune --tags
13:35:27 git ls-remote --heads origin; git ls-remote --tags origin; git tag -n
13:35:29 git for-each-ref --sort=-committerdate refs/remotes/origin --format=…
13:35:37 for each origin/* branch: git rev-list --left-right --count origin/main...$b;
         git merge-base --is-ancestor $b origin/main; git cherry -v origin/main $b; git log -1 $b
13:35:39 gh pr list --state all --limit 100 --json …
13:35:49 git log origin/main --first-parent --since=2026-10-01 …; git log origin/main --since=2026-10-06 …
13:35:49 gh api $R/commits/{3496e4b,61a91b6,a8ce7a0,3b344d8,b54e3a8,0e8a26c}/pulls
13:35:53 git log --oneline origin/main...origin/perf/run-2026-10-07 --left-right
13:35:53 git show --stat 1f34c3e
13:36:03 git grep -n -I -E '<branch names and cited hashes>' origin/main (and origin/perf/run-2026-10-07)
13:36:04 git grep -l '\bgrace\b' origin/main -- docs
13:36:04 git merge-tree --write-tree --name-only origin/main origin/perf/run-2026-10-07
13:36:04 git show origin/main:package.json | grep c2pa; git ls-tree -r origin/main | grep '\.crx$|\.pem$|…'
13:36:15 git grep 'trustAnchors|remoteManifest|…' origin/main
13:36:15 gh repo view … --json visibility,isPrivate,mergeCommitAllowed,…,deleteBranchOnMerge
13:36:16 gh api $R/branches/main; gh api $R/branches/main/protection (404)
13:36:17 gh api $R/rulesets; gh api $R/rules/branches/main
13:36:18 gh pr list --state open
13:36:19 gh api $R/commits/3496e4b/check-runs
13:36:19 git cat-file -t v0.1.2; git rev-parse v0.1.2^{commit} v0.2.0-handover^{commit}; …
13:36:29 gh api $R/rulesets/16587520; gh api $R/rulesets/24166483
13:36:30 gh api $R/forks
13:36:31 git log --all --diff-filter=A --name-only | grep '\.(pem|key|p12|pfx|crx|env)$|secret|…'
13:36:31 git rev-list --objects --all | git cat-file --batch-check | awk '$3>5000000'
13:36:31 git log --all -- extension.crx; git ls-tree -l origin/main extension.crx
13:36:39 git grep -l 'BEGIN … PRIVATE KEY' $(git rev-list --all)
13:36:43 git grep -l -i 'confidential|meeting minutes|…' origin/main
13:36:44 git ls-tree -r origin/main | grep -i 'minutes|meeting|agreement|databench'
13:36:44 git log origin/main -1 -- c2pa-extension-v0.1.0.zip; git ls-tree origin/main …
13:36:44 git branch --merged origin/main; git log origin/main..integrate/mp4-badge-main; git log origin/main..main
```

**Phase B (after approval)**

```
13:39:42 git fetch --all --prune --tags; git ls-remote --heads origin
13:39:44 git bundle create ../T156-repo-backup-20261019.bundle --all
13:39:45 git bundle verify ../T156-repo-backup-20261019.bundle; sha256sum …
13:39:45 git tag backup/<branch>-20261019 $(git rev-parse origin/<branch>)   (x10, 13:39:45–13:39:47)
13:39:53 git merge --no-ff --no-commit origin/main            (on perf/run-2026-10-07)
13:39:53 git status --short; grep conflict markers in docs/genai-log/2026-10.md
13:40:xx (denied by tool sandbox, not executed) shell rewrite of the conflicted file
~13:40:15 three Edit-tool edits removing the three conflict markers
13:40:30 grep for leftover markers; diff each side against its parent (CRLF/LF check)
13:40:52 git add docs/genai-log/2026-10.md; byte-exact diff of staged blob
13:40:53 git commit -F <message file>     → f580d5a
13:40:53 git diff --stat origin/main HEAD; git merge-base --is-ancestor 1f34c3e HEAD
13:41:01 npm test                          → 157 pass / 0 fail
13:41:31 git merge-base --is-ancestor origin/integrate/mp4-badge-main origin/main
13:41:31 git push origin --delete integrate/mp4-badge-main; ls-remote check; gh pr view 23; main check-runs
13:42:xx (denied by tool sandbox, not executed) a loop deleting the remaining 7 branches
13:42:29 ancestor check; git push origin --delete MP4-Badge; ls-remote check
13:42:44 ancestor check; git push origin --delete Logo-Shadow; ls-remote check; gh pr view 24
13:43:05 ancestor check; git push origin --delete Badge-Wording-Change; ls-remote check; gh pr view 25
13:43:22 ancestor check; git push origin --delete feat/on-off-control; ls-remote check; gh pr view 26
13:43:40 ancestor check; git push origin --delete feat/dynamic-c2pa-trust-validation; ls-remote check; gh pr view 11
13:43:56 ancestor check; git push origin --delete Image-logo-popup; ls-remote check; gh pr view 12
13:44:24 ancestor check; git push origin --delete grace; ls-remote check; gh pr view 13
13:44:28 gh api $R/commits/main/check-runs; git ls-remote --heads origin
13:44:41 git fetch --all --prune
13:44:42 git fetch origin main:main        (fast-forward 654a59d..3496e4b)
13:44:43 git branch --merged origin/main; git branch -d integrate/mp4-badge-main
13:44:43 git worktree prune; git worktree list; git branch -a -vv; git stash list
```

## 8. Backups and rollback

- Bundle: `C:\Users\thien\Downloads\T156-repo-backup-20261019.bundle`
  (53,633,631 bytes), SHA-256
  `450b9e14c8789bb1b81735faf0d0041b1955bf58d6596e16b84676dc79c133ea`.
  `git bundle verify`: "is okay", "records a complete history".
- Local backup tags (not pushed):

| Tag | SHA |
|---|---|
| `backup/Badge-Wording-Change-20261019` | `b54e3a8b14aaea6fc7feadbfd95f43e0e60b5ae0` |
| `backup/Image-logo-popup-20261019` | `aa369b15c558123988a4d624baeecfbe8f96b702` |
| `backup/Logo-Shadow-20261019` | `0e8a26ca911aa23cfc57d7422ad971d45cfb3295` |
| `backup/MP4-Badge-20261019` | `6bf834c12bbcbc0de261a8bae1aab78883d3a0af` |
| `backup/feat-dynamic-c2pa-trust-validation-20261019` | `29a25a5eccaa24fbbd3de4e8801f9febe0d006b1` |
| `backup/feat-on-off-control-20261019` | `a8ce7a002632063bbc94cfa5e872b4e737c45d7c` |
| `backup/grace-20261019` | `3e98d378b84dae2ace31c44c0a3165c3e87e2f6d` |
| `backup/integrate-mp4-badge-main-20261019` | `c47206cc878bd2eec961d633dfd94821180a07df` |
| `backup/perf-run-2026-10-07-20261019` | `1f34c3eba0dcf908320ffd45416e0d99bd8d595c` |
| `backup/main-20261019` | `3496e4b1a972c3b1d2b9d13c8e29561377bb1a10` |

**Restoring a deleted branch** (any of the three works; `<name>` and `<sha>`
from the table above):

1. From this clone: `git push origin <sha>:refs/heads/<name>`
2. From GitHub: open the merged PR (#11, #12, #13, #23, #24, #25, #26) and
   click **Restore branch**. `MP4-Badge` has no PR of its own — use option 1
   or 3.
3. From any clone, including a fresh one: `git fetch origin pull/<N>/head:<name>`
   (PR branches), or `git clone T156-repo-backup-20261019.bundle` and push the
   branch from there.

Since every deleted tip is an ancestor of `main`, all of these commits also
remain in `main`'s history regardless.

## 9. Side-check findings (no settings changed)

1. **Visibility — needs a decision (Lucas, Zach → Databench).**
   `gh repo view`: `"visibility":"PUBLIC","isPrivate":false`. Team Agreement
   v3.0 says the repository is private; the agreement is wrong or the setting
   is. Publicly readable today:
   - `CLAUDE.md` (names Databench's CTO, refers to the project-owner meeting
     minutes and Databench's product plans).
   - `extension.crx` (8.4 MB packaged build) on `main`.
   - History: `c2pa-extension-v0.1.0.zip` (7.5 MB, removed in `60ba321` but
     still in history), test media.
   - A public fork exists: `arc-js/C2PA_Browser_Integration`.
   - No private keys found: `git grep 'BEGIN … PRIVATE KEY'` over every commit
     returned nothing. `C2PA-trusted-certs/*.pem` are public trust lists. No
     `.env`, `.p12`, `.pfx` or `.key` files in history.
   Licence/ownership for open-sourcing is undecided, so visibility should be
   raised with Databench before handover.
2. **Branch protection — not set as classic protection; partial ruleset.**
   `gh api $R/branches/main/protection` → 404 "Branch not protected".
   Ruleset "Admin rule" (active, default branch): blocks deletion and
   force-push only, no bypass actors. Ruleset "branch_protection" (same
   rules): disabled. **No required status checks and no required PR review**,
   so the team documents' "not evidenced" for required CI is accurate. CI
   ("Build and static checks") is green on `3496e4b`.
3. **Merge methods:** merge commit, squash and rebase all allowed;
   "automatically delete head branches" is **off** (`deleteBranchOnMerge:
   false`) — which is why merged branches accumulated.
4. **Tags:** `v0.1.2` → `60ba321`, `v0.2.0-handover` → `d2920f0`;
   `v1.0.0-handover` does not exist.
5. **Hidden branches / PRs:** none. `git ls-remote` matched the screenshot's 10
   branches; `gh pr list --state open` returned nothing.
6. **Large blobs (> 5 MB) in history:** `c2pa-test-bench/assets/sample-video.mp4`
   (15.5 MB), `extension/spike-harness/raw.bundle.js` (10.5 MB, on `main`),
   `extension.crx` (8.4 MB, on `main`), `c2pa-extension-v0.1.0.zip` (7.5 MB,
   history only), `dev-test-library/adobe-official-manifests/sora.MP4`
   (5.3 MB). Removing them from history would need a rewrite — out of scope
   and not recommended before handover.
7. **Related:** PR #6 (Dependabot, merged 3 Aug) bumped `@contentauth/c2pa-web`.
   With the caret range still in `package.json`, a fresh install can resolve
   a newer 0.13.x than the one tested, which conflicts with the CLAUDE.md
   pinning rule. This is the "exact pin" QA fix in Section 6.

## 10. Deferred to Stage 2 (after `v1.0.0-handover` is tagged and A2/A3 are submitted)

- Delete `perf/run-2026-10-07` once its commits are on `main` and the reports
  cite the commit/path in `main` (or an `evidence/perf-run-2026-10-07` tag on
  `1f34c3e`) instead of the branch name.
- Branch-protection recommendation for Databench: require a PR and the
  "Build and static checks" check on `main`; turn on "automatically delete
  head branches".
- Add a short "Branching model" section to the README: `main` plus release
  tags only; work branches are deleted after merge.
- Decide whether to remove `extension.crx` and other build artefacts from the
  tree (QA fix list, Section 6).
- Delete the local `backup/*` tags once the handover is accepted.

## 11. Walkthrough note (for Databench)

> The repository has one long-lived branch, `main`, which holds everything
> we hand over. Releases are marked with tags: `v0.1.2` is the Phase 1 proof
> of concept, `v0.2.0-handover` the September interim, and `v1.0.0-handover`
> will mark the final handover. Every feature arrived through a pull request,
> so the PR list is the change history. Working branches that are already
> merged are listed, with their PRs and restore points, in
> `docs/phase2/merged-branches-record.md`, and will be removed after the
> handover. Evidence for our
> claims lives in `main`: performance results in `perf/results/2026-10-07/`
> (with `perf/analyze.mjs` to regenerate every figure), design notes and
> decisions in `docs/phase2/`, and a record of AI-assisted work in
> `docs/genai-log/`.

## 12. GenAI log entry

Original draft below. An extended version, covering the restoration, was
added to `docs/genai-log/2026-10.md` on branch `chore/merge-perf-results`.

```
## 2026-10-19 — perf/run-2026-10-07 (branch audit and cleanup)
Task:            Audit all branches and tags, delete merged branches, prepare
                 the performance branch for merge into main, report.
Agent produced:  Read-only audit (ancestry, cherry, PR mapping, repo
                 settings, sensitive/large file scan); backup bundle and 10
                 local backup tags; deleted 8 merged remote branches one at a
                 time and 1 local branch; merge commit f580d5a (origin/main
                 into perf/run-2026-10-07, genai-log conflict resolved by
                 keeping all entries); docs/phase2/branch-cleanup-report.md.
Human review:    Lucas approved the deletion plan before any change; pushing
                 and merging the perf branch held for his review.
Verification:    git ls-remote --heads origin → main + perf/run-2026-10-07
                 only; gh pr view → #11-13, #23-26 still MERGED; bundle
                 verify "okay"; npm test on f580d5a 157 pass / 0 fail.
```

## 13. Restoration (19 Oct 2026)

Requested by Lucas after the cleanup: team documents and the GenAI log cite
the deleted branches by name, so all eight were restored at their original
tips, and the local merge work was moved off `perf/run-2026-10-07` so that
branch stays identical to what the reports cite. Nothing was deleted,
force-pushed or rewritten, and no `backup/*` tag was pushed.

**Step 1 — preflight (read-only, 13:55).** `git fetch --all --prune --tags`,
then for each branch: `git cat-file -e <sha>^{commit}` (present),
`git rev-parse backup/<name>-20261019` (equal to the expected SHA),
`git merge-base --is-ancestor <sha> origin/main` (true) and
`git ls-remote --heads origin <name>` (0 lines). All 8 passed; no fetch from
the bundle was needed.

**Step 2 — restore, one push per branch.** Each push was
`git push origin <sha>:refs/heads/<branch>`, followed by
`git ls-remote --heads origin <branch>` (printed exactly the SHA) and
`gh pr view <N> --json state,mergedAt` (still `MERGED`, original date). No new
PRs were created.

| Time | Branch | SHA confirmed on origin | PR state after |
|---|---|---|---|
| 13:55:45 | `Badge-Wording-Change` | `b54e3a8b14aaea6fc7feadbfd95f43e0e60b5ae0` | #25 MERGED 2026-10-09T11:29:51Z |
| 13:55:54 | `Image-logo-popup` | `aa369b15c558123988a4d624baeecfbe8f96b702` | #12 MERGED 2026-09-07T09:09:36Z |
| 13:56:04 | `Logo-Shadow` | `0e8a26ca911aa23cfc57d7422ad971d45cfb3295` | #24 MERGED 2026-10-09T11:29:51Z |
| 13:56:14 | `MP4-Badge` | `6bf834c12bbcbc0de261a8bae1aab78883d3a0af` | no PR of its own |
| 13:56:23 | `feat/dynamic-c2pa-trust-validation` | `29a25a5eccaa24fbbd3de4e8801f9febe0d006b1` | #11 MERGED 2026-09-07T09:10:02Z |
| 13:56:32 | `feat/on-off-control` | `a8ce7a002632063bbc94cfa5e872b4e737c45d7c` | #26 MERGED 2026-10-09T11:29:49Z |
| 13:56:43 | `grace` | `3e98d378b84dae2ace31c44c0a3165c3e87e2f6d` | #13 MERGED 2026-09-07T09:08:18Z |
| 13:56:53 | `integrate/mp4-badge-main` | `c47206cc878bd2eec961d633dfd94821180a07df` | #23 MERGED 2026-10-06T13:56:46Z |

`git ls-remote --heads origin` at 13:56:57 listed the 8 restored branches,
`main` (`3496e4b`) and `perf/run-2026-10-07` (`1f34c3e`).

**Step 3 — move the merge work (13:57).** `git status -sb` showed only the
untracked report. Then `git switch -c chore/merge-perf-results` (at
`f580d5a`) and `git branch -f perf/run-2026-10-07 1f34c3e`.
`git rev-parse perf/run-2026-10-07 origin/perf/run-2026-10-07` printed
`1f34c3eba0dcf908320ffd45416e0d99bd8d595c` twice, and
`git log -3 chore/merge-perf-results` showed `f580d5a` with parents `1f34c3e`
and `3496e4b`. `f580d5a` is also kept by `chore/merge-perf-results`.

**Steps 4–6 — on `chore/merge-perf-results`.**

- 13:57:14–13:57:35: `gh pr view 11/12/13/23/24/25/26 --json
  …mergedAt,mergeCommit,commits` and `gh pr list --state merged` for the record.
- 13:58:42: commit `f0411ed` "docs: record merged branches and their restore
  points" (`docs/phase2/merged-branches-record.md`). A first `git commit`
  attempt in the same shell call failed before running, because a log
  placeholder was parsed as a redirect; it created no file and no commit.
- 13:59–14:00: `4542aa3` (record wording fix), `3ab87c8` (this report),
  `c027858` (genai-log entry, append-only: `git diff` showed 25 additions,
  0 deletions).
- 14:00:33: `git diff --stat origin/main...HEAD` → 18 files, 1446
  insertions, 8 deletions; `git push -u origin chore/merge-perf-results`
  (new branch at `c027858`; `perf/run-2026-10-07` still `1f34c3e`).
- 14:00: `gh pr create --base main --head chore/merge-perf-results` → PR #28;
  `gh pr checks 28 --watch` → "Build and static checks" pass.
