# 079 - Exclude temporary replacement buses

The owner explicitly excludes replacement buses from the planning dataset:
they are temporary measures, not courses to collect. This supersedes the
replacement-service inclusion decision in plan 057.

- Exclude bus routes identified as replacements in GTFS long names,
  descriptions or official registry direction descriptions, and the explicit
  rail-replacement bus type 714.
- Exclusion takes precedence over public registry status and audited public
  approvals. Log excluded identities. Do not filter by displayed numbers:
  ordinary buses numbered 20, 21, 22, etc. must remain eligible.
- Unclassified, undescribed routes still fail closed rather than being
  automatically included. Ferries and trams keep their existing rules.
- Rebuild the complete dataset with this policy, removing replacement keys
  from the catalogue, every geometry payload and legacy aggregate.
- Existing courses and completion history retain historical snapshots; the
  catalogue removal does not erase user records.

The owner also accepted the November feed's reviewed route/return changes and
authorized terminating the process occupying the browser-test port. Run the
full checks and refresh with removal approval after committing this policy.

Regression tests cover described and registered replacement buses,
call-ordered/explicit replacement types, approval precedence, preserved
ordinary same-number routes and exclusion from the published split dataset.
