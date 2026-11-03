# 078 - Actionable monthly transit refresh review

## Scope

Keep classification, geometry and removal gates fail-closed. Make a failed
monthly refresh actionable without downloading the feed again or repeatedly
discovering one empty route description at a time.

- Before rejecting unknown buses or ferries, write `.cache/route-audit.json`:
  all identities, service dates, trip template counts, stop patterns and shape
  evidence. Empty headsigns and missing geometry remain explicit.
- Add a concise classification table to the GitHub job summary. Validation
  reports each removed key, its former endpoints and any retained base route.
- Upload a 30-day failure artifact with the audit, build and validation logs,
  old/new aggregates and explicitly enumerated public GTFS/registry source
  files. Never upload `.env`, credentials or broad cache directories.
- On failure, create or comment on one open `Transit refresh needs review`
  issue, mention the repository owner and link the run with next actions.
  Notification and artifact errors are visible; publication never depends on
  an automatic approval.

## November 2026 removal review

The 2026-11-03 feed is missing four former route identities: Gothenburg
replacement buses 1E, 11E, 12E and train-replacement bus 37. Six old return
keys (22, 35, 42, 355, 679, 875) are absent while their base route remains
represented. These are feed/representative changes, not loss of every affected
line. Existing course snapshots are retained, but accepting these removals
requires the owner's explicit publication decision.

The new Boras routes are independently resolved in plan 077. A successful
classification fix does not imply approval of unrelated removed keys.

## Verification

Builder fixtures check complete structured evidence, service-day counts,
missing geometry, ferry classification, summary output and unchanged published
data after failure. Validation fixtures check removal-review details without
changing the approval gate. Use an isolated checkout to avoid other work in
the shared repository.
