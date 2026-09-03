# Builder Onboarding Runbook

Guardrail #2 from `docs/LAUNCH_GUARDRAILS.md`: *"A written, repeatable
builder-onboarding runbook — followed exactly, every time."* There is no admin UI yet —
provisioning is manual SQL via Neon's SQL Editor — so this procedure **is** the safety
net. Follow it exactly, in order, every time. Do not skip step 4.

Everything here is copy-paste with placeholders in `ALL_CAPS`. Replace every placeholder
before running a statement — do not run a statement with a placeholder still in it.

## Before you start

- [ ] You have access to Neon's SQL Editor for the `perfect4developers` project.
- [ ] You have access to the Clerk dashboard for this app.
- [ ] You know the new builder's legal name, and the name/email of the first person who
      will log in on their side.
- [ ] A second person is available to do step 4 (the isolation check). **Not** the same
      person who runs steps 1–3 — see why in step 4.

## Step 1 — Create the person's login in Clerk

The database needs a real Clerk user id (`user_...`) before it can grant that person
access, so this comes first.

In the Clerk dashboard: **Users → Create user**, enter their email, and finish creating
the user (an email/password or invite flow, per however this Clerk instance is
configured). Once created, open that user's page and copy their **User ID** — it looks
like `user_2abCdEfGhIjKlMnOpQrStUvWxYz`.

- [ ] Clerk user id copied: `_______________________________`

If they've already signed themselves up through the app's own sign-in page before you
get to this step, that's fine too — find their existing user in Clerk's Users list by
email instead of creating a new one, and copy the same User ID from there.

## Step 2 — Insert the `builders` row

In Neon's SQL Editor, run (only `name` is required — fill in what you have, leave the
rest as `null`):

```sql
insert into builders (name, legal_entity_name, contact_name, contact_phone, contact_email)
values ('BUILDER DISPLAY NAME', 'LEGAL ENTITY NAME OR null', 'CONTACT PERSON OR null',
        'CONTACT PHONE OR null', 'CONTACT EMAIL OR null')
returning id, name;
```

**A good result looks like:** one row back, with a `name` matching what you typed and a
freshly generated `id` (a UUID). Copy that `id` — you need it in the next step.

- [ ] `builders.id` copied: `_______________________________`

## Step 3 — Insert the `builder_users` row

```sql
insert into builder_users (builder_id, email, full_name, role, clerk_user_id)
values ('BUILDERS_ID_FROM_STEP_2', 'their-email@example.com', 'THEIR FULL NAME', 'admin',
        'CLERK_USER_ID_FROM_STEP_1')
returning id, builder_id, email, clerk_user_id;
```

**A good result looks like:** one row back, `builder_id` matching step 2's id exactly,
`clerk_user_id` matching step 1's id exactly. If this errors with something mentioning
`builder_users_clerk_user_id_key`, that Clerk user is already linked to a builder_users
row somewhere — stop and figure out why before continuing, don't insert a second row for
the same person.

## Step 4 — Verify isolation, in person, before handing anything over

**This step is not optional, and should be done by someone other than whoever ran steps
1–3** — the point is an independent check, not a re-confirmation of your own work by
yourself.

1. Sign in to the app as the **new** builder user (the account from steps 1–3).
2. On the Overview screen, note the KPI numbers (units tracked, total agreement value,
   etc.) and on the Customers screen, note the row count in "Showing X of Y customers."
3. **Confirm those numbers are plausible for a brand-new builder with no data loaded
   yet** — near-zero, not a number that looks like it includes another builder's book of
   business.
4. **Try to see another builder's data.** The concrete, repeatable version of "try": in
   the Customers screen's search box, search for a customer name you know belongs to a
   *different* builder already on the platform (e.g. a Shilpkaar/Aarambh customer name).
   It must return **zero results**. If it returns anything, stop immediately — do not
   hand over the login, and treat this as the single highest-priority bug this platform
   can have (see `docs/LAUNCH_GUARDRAILS.md`'s "the bug that ends the company").
5. Sign out.

- [ ] New builder's own numbers look plausible (near-zero / matches what was actually
      loaded for them)
- [ ] Searched for a known other-builder customer name → **zero results**
- [ ] Verified by (name, not the same person as steps 1–3): `_______________________________`
- [ ] Date: `_______________________________`

**If step 4 fails at any point:** do not hand over the login. Do not proceed to step 5.
This is exactly the failure class `apps/api/tests/isolation.test.ts` and
`.github/workflows/ci.yml` exist to catch automatically — if it shows up here despite
that, something is wrong beyond this one builder's setup, and it needs to be understood
before anyone else logs in, not just patched for this one account.

## Step 5 — Hand over the login

Only after step 4's checklist is fully signed off. Tell the builder's person their login
email and how to sign in (or trigger Clerk's invite email from their dashboard entry, if
that's the flow this instance uses).

## Record of onboarded builders

Keep a row here per builder, so there's a durable record of who ran step 4 and when —
not just a claim it happened.

| Builder | Onboarded | Steps 1–3 by | Step 4 verified by | Notes |
|---|---|---|---|---|
| Shilpkaar (Aarambh) | pre-dates this runbook | — | — | First builder, onboarded before this document existed — see `CLAUDE.md`'s "Real data loaded" for how it was actually verified at the time. |
