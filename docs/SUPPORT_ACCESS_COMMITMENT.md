# Support-Access Commitment — Draft

Guardrail #5 from `docs/LAUNCH_GUARDRAILS.md`: *"Decide and write down the support-access
rule, then hold to it... the exact language already drafted in the platform plan."*

**That referenced language lives in `claude/Platform Plan - Architecture Options and
Costs.md`, which is in the Claude Project this app was built alongside, not in this repo
or anywhere else this session had access to.** Rather than guess at wording that might
already exist, this is a fresh draft from the guardrails doc's own summary of what it
needs to say. If the original is found, reconcile the two rather than keeping both.

**This is not legal language, and is not ready to put in front of a builder as-is.**
`docs/LAUNCH_GUARDRAILS.md` says the same about the fuller agreement (item 10): *"Budget
for a lawyer here rather than freehand-drafting it — this is exactly where a generic
template creates more risk than it removes."* The same caution applies to this clause.
Treat everything below as the substance to hand a lawyer, not the final wording.

## The actual technical fact this has to describe honestly

`app.is_staff` is a real, working bypass: any login resolved as Perfect Solutions staff
(`apps/api/src/auth.ts`) sees every builder's data, by design — it has to, for support to
be possible at all without a builder in the room. As of this writing:

- **True today:** a staff login can see any builder's data, at any time, with no
  additional check.
- **Not yet true:** there is no record of *when* a staff session actually queried a
  specific builder's data, or who did it, or why. Guardrail #6 (`docs/LAUNCH_GUARDRAILS.md`)
  — an actual audit log — is explicitly scoped for *after* a handful of builders, not
  before builder #2. Until that exists, "logged" below is a commitment about intended
  practice and manual discipline, not a technical guarantee the software currently
  enforces.

Do not let this document, or anything derived from it, claim the audit log already
exists. Say what's true now, and say what's coming, as two different sentences.

## The commitment, in the four parts the guardrails doc names

1. **Exists.** Perfect Solutions staff can access a builder's data for support purposes.
   This is necessary — a real support request usually requires seeing what the builder
   is seeing — and is not something a builder can opt out of while remaining on a
   platform Perfect Solutions operates and is accountable for.
2. **Is logged** *(commitment now, technical guarantee once guardrail #6 ships)*. Every
   instance of staff accessing a specific builder's data is intended to be recorded —
   who, when, which builder, and the reason. Until the automated audit log exists, this
   is upheld by internal discipline: a staff member accessing builder data for support
   should be able to say, if asked, why they did and when.
3. **Is attributed.** Access is never anonymous or shared — it is always tied to one
   named staff member's own login, never a shared or generic account.
4. **Is time-limited.** Staff access exists for the duration of an active support need,
   not as standing, unlimited surveillance of a builder's data. There is no current
   technical enforcement of this (no session-scoped or time-boxed staff grants exist
   today) — it is a stated operating principle, to be revisited if it needs a technical
   backstop as the builder count grows.

## Suggested plain-language version, for what a builder actually reads

> Perfect Solutions staff can access your data on this platform to provide support. We
> commit to: only accessing it under your own named staff member's login, never a shared
> account; only for as long as a specific support need is active; and, as our audit
> logging is completed, keeping a record of who accessed your data, when, and why. You
> can ask us at any time what was accessed and why.

## Where this goes next

- A lawyer turns this into actual contract language for `docs/LAUNCH_GUARDRAILS.md` item
  10 (the full per-builder agreement) — this document is the input to that conversation,
  not a substitute for it.
- If `claude/Platform Plan - Architecture Options and Costs.md`'s original language
  surfaces, compare it against this draft and keep whichever is clearer, or merge them.
- Once guardrail #6's audit log actually exists, update the "is logged" section above to
  say so as a present-tense technical fact, not a commitment.
