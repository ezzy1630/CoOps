# Launch copy

Every locked string for the submission, in one place. All of it describes one
run: a launch video that starts on a developer's laptop and ends on the company's
YouTube channel, with nobody holding both sets of credentials. Copy from here
instead of rewriting, so the assets stay identical to each other.

The order each asset argues in is fixed in [messaging.md](messaging.md). Nothing
here may be published before the checks below pass.

## Before publishing

Two things gate this copy.

Run `npm run preflight`. Every string here describes a real local file, real
bytes in Cloud Storage, a real named approval, and a real YouTube video id. The
verdict has to read `GO` before any of it is a description of something that
happened. Until then the copy is a plan, not an asset.

Read the run's own proof package. Activity → **Proof package** exports the
receipts as JSON, and its chain-of-custody verdict has to read `verified`. The
table at the end of this file says which receipt backs which sentence.

## Devpost headline

> CoOps: Departmental agents that work together without sharing unrestricted access

## Short description

> CoOps is a visual coordination layer for company agent teams. Each department
> retains its own agents, tools, context, and human authority while exchanging
> typed work directly with peer departments. In our launch-day demo, Marketing
> locates a missing video on a developer's machine, transfers it through Google
> Cloud, obtains publication approval, and uploads it to YouTube without either
> department receiving the other's credentials.

## Video opening

> It's launch day for a dating app for horses. Unfortunately, the horses still
> can't swipe, and Marketing can't find the launch video.

## Technical pivot

> The video is on a developer's laptop. Marketing cannot access that machine, and
> Engineering cannot access the company's YouTube channel. That is exactly the
> kind of boundary CoOps coordinates.

## Closing

> The right machine. The right department. The right human. One complete trace.
> No omnipotent agent—and no hooves required.

## Social post

> We built CoOps for the #AllThingsAgenticHackathon: a coordination layer where
> every department owns its own agent team.
>
> For the demo, a launch video is trapped on a developer's laptop. Marketing's
> agent finds the right department, stages the verified file through Google
> Cloud, waits for the correct human, and delivers it to YouTube—without sharing
> unrestricted credentials.

## What each claim rests on

Every external claim in the copy above has a receipt behind it, except one, which
says so.

| Claim | Where it appears | Backed by | How to read it |
|---|---|---|---|
| locates a missing video on a developer's machine | Short description, social post | `local-discovery` | Connector identity, allow-listed search root, filename, modified time, byte size, checksum |
| transfers it through Google Cloud | Short description, social post | `cloud-handoff` | Bucket, object, generation, bytes uploaded, and the stored md5 checked against the local file |
| obtains publication approval, waits for the correct human | Short description, social post | `authority` | Named approver, exact channel, proposed title, privacy setting, asset checksum, approval timestamp |
| uploads it to YouTube, delivers it to YouTube | Short description, social post | `publication` | API result, video id, privacy status, processing status, watch URL |
| One complete trace | Closing | `coops` | Live execution label, run id, typed Task Envelopes, tool events, approval event, completion event, Cloud Run revision |
| without either department receiving the other's credentials | Short description, social post | `architecture` | No receipt records an absence. Discovery reads nothing outside `COOPS_LOCAL_ROOTS`, resolved through symlinks, and the `youtube` tool refuses any asset whose checksum a named human did not approve |

The last row is the one to be careful with on camera. A receipt proves that
something happened; nothing proves that a credential was never shared. That claim
rests on the code, so show the code, or show the publication being refused
without an approval.

## If YouTube restricts the upload

A new API project that has not passed its compliance audit can only upload
privately. Say so:

> Uploaded privately to the launch channel and ready for release.

The go/no-go report prints that sentence when the returned privacy status is
lower than the one the approver agreed to, so the constraint reaches the script
before the recording does.
