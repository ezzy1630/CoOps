# Message hierarchy

Every public asset says these four things, in this order. Order carries the
argument. A reader who stops after the first line still knows what happened, and
one who stops after the second knows why a single agent could not have done it.

## 1. The outcome

> The missing launch video made it from a developer's laptop to the company's
> YouTube channel.

## 2. Why multiple agents were necessary

> Marketing could not access the laptop. Engineering could not access the YouTube
> channel.

## 3. What CoOps contributed

> CoOps coordinated the handoff without combining those permissions into one
> omnipotent agent.

## 4. The technical proof

> The run preserved the local checksum, cloud object identity, approval, YouTube
> video ID, and Cloud Run trace.

The locked strings themselves are in [launch-copy.md](launch-copy.md), together
with the receipt behind each claim they make.

## Vocabulary that waits its turn

Do not open with Gemini, A2A, Firestore, Model Armor, SSE, OAuth, or protocol
terminology. Each one is introduced where its role becomes visible and not
before. A reader who meets "Model Armor" in the first paragraph has been told a
vendor name instead of a fact.

The same applies to the stack. React, Vite and TypeScript answer "how do I run
this", so they belong beside the run instructions rather than in the lead.

## Tense is a claim

The outcome above is written in the past tense because it describes a run that
happened.
Publish it that way only when `npm run preflight` reads `GO`, which means a real
connector found the file, the same bytes reached Cloud Storage, a named human
approved the publication, and YouTube returned a video id. See
[deploy.md](deploy.md#gono-go-gates).

Until then, assets state the capability in the present tense: CoOps *moves* a
launch video off a laptop and onto the channel. The difference between "moves"
and "made it" is the difference between a description and a receipt, and the
proof package refuses to blur it, so the copy should not either.

## Positioning

Category: **federated agent operations**. Not "agent platform", "multi-agent
framework", or "AI operating system", which invite comparison with infrastructure
CoOps does not replace.

One line: *CoOps lets departmental AI agents work across organizational
boundaries without sharing unrestricted access.*

Tagline, unchanged: **Every department gets its own agent team.**

## Checking an asset

`server/src/test/messaging.test.ts` fails the build when an asset breaks the
order. It requires the outcome in the first paragraph, not merely somewhere above
the first subheading, because an outcome in the third paragraph has already lost
the reader who stopped at the first. It also rejects deferred vocabulary anywhere
in the opening. Add a new public surface to the list in that file when you write
one.

## Who the asset is for

The buyer is the Head of AI Platform, the CIO or CTO, the enterprise architect,
the COO, or the security and governance leader. The GTM lead in the story is the
protagonist, not the buyer, so an asset that only speaks to the protagonist is
aimed one level too low.
