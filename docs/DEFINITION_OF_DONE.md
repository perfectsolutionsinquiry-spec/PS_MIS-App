# Definition of Done

A checklist to run against **every change, however small**, before it's
called complete — the moment a commit gets pushed, not something reviewed
after the fact. If a box can't honestly be checked, the change isn't done
yet, whatever else it does.

This exists because "done" got said a few times this repo's history when
it wasn't fully true — a filter menu that was still positioned wrong
after a first "fixed and verified" pass, a doc that was accurate the day
it was written and then quietly drifted. None of those were dishonesty;
they were skipped steps. This is the list of steps.

---

## 1. Documentation — check this first

A change isn't done until all three of these agree with the code. This
is first on purpose: it's the easiest step to skip under "I'll do it
next time," and skipping it is exactly how `CLAUDE.md`'s own sections
and the two reference docs drifted out of date before (see `CLAUDE.md`'s
commit-history entries that exist purely to catch a stale section back
up).

- [ ] **Code is commented** in plain, business-language prose explaining
      *why*, not just restating what the code does — the standing
      convention in `CLAUDE.md`'s "Documentation practice" section.
- [ ] **`docs/TECHNICAL_DOCUMENTATION.md` updated** — a new/changed
      table gets a row in the schema map, a new/changed route gets a row
      in the API reference, a new/changed file gets a row in the
      frontend index, a new flow gets a diagram.
- [ ] **`docs/FUNCTIONAL_GUIDE.md` updated** — a new/changed screen or
      user-facing behavior gets a plain-language paragraph, written for
      someone who's never seen the code.
- [ ] **`docs/portal/index.html` updated to match.** The portal is a
      *rendering* of the two docs above, not a third independent source
      — it drifts the moment either of them changes without a matching
      edit here. Its own top-of-file comment says the same thing; this
      is that rule, enforced.

## 2. Visual verification — for anything that touches the UI

- [ ] **Actually rendered and looked at** — a live reproduction
      (a throwaway local server, a standalone HTML mockup, or the real
      deployed app), never just reasoned about from the code. A CSS
      positioning claim that hasn't been watched happen in a browser is
      a guess, not a fix — confirmed the hard way on the column-filter
      menu, twice, before this rule existed.
- [ ] **Checked at the state most likely to break it**, not just the
      first state that happens to work — e.g. a positioning fix checked
      against the column nearest the screen edge, not just the leftmost
      one; an empty-state checked with zero rows, not just a full table.
- [ ] **Checked at responsive viewport sizes** — for any changed screen or
      dialog, verify a wide desktop viewport, a tablet-sized viewport, and a
      narrow mobile viewport. Confirm that fields, buttons, menus, tables,
      and dialogs reflow or scroll without clipping, overflowing, or becoming
      unusable. Record the checked viewport sizes in the change notes when
      the UI behavior is materially affected.
- [ ] **No new console errors** on load.
- [ ] **Interactive buttons use React Aria** — use the `Button` primitive from
      `react-aria-components` rather than native `<button>` elements or
      another button library. Keep behavior and styling explicit through
      React Aria props and existing component styles.
- [ ] **Supported form controls use React Aria** — use React Aria Components
      for text fields, textareas, selects, checkboxes, and other supported
      interactive controls. Keep semantic tables, SVG charts, layout
      containers, and third-party authentication widgets when React Aria does
      not provide an equivalent.
- [ ] **Supported structural controls use React Aria** — use React Aria
      `Table`, `Tabs`, `Dialog`, `Modal`, and `Popover` primitives where the
      application has an equivalent interactive surface. Do not recreate
      those accessibility behaviors with bespoke markup.

## 3. Deploy verification — after pushing

- [ ] **New bundle hash confirmed live**, cache-busted (`?cb=` or
      similar) — Cloudflare's edge cache in front of Render can serve a
      stale build for up to 5 minutes and look exactly like a stuck
      deploy.
- [ ] **Bundle content spot-checked** for the actual new feature's text
      or behavior, not just a changed filename hash — a different hash
      proves *a* build shipped, not that *this* change is in it.
- [ ] **Any new API route confirmed live and correctly gated** — 401 for
      an unauthenticated request, not 404 (404 means the route doesn't
      exist at all; 401 means it exists and is doing its job).

## 4. Known gaps — say them out loud

- [ ] Any deliberate simplification, deferred piece of scope, or
      known-but-unfixed edge case is stated in the commit message and/or
      the docs — not discovered later by someone assuming it was
      handled. This repo's own established pattern: "known, deliberate
      gaps" called out explicitly rather than hidden (see almost any
      commit message in this repo's history for the shape this takes).

---

*Added after the column-filter menu shipped "fixed and verified" once
and was still visibly broken on the next real check — the process gap
that made rule 2 necessary, and the reminder that rule 1 exists so this
file itself doesn't become the next thing that quietly goes stale.*
