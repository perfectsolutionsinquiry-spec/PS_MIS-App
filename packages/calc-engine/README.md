# calc-engine (placeholder)

The existing MIS tool's calculation engine (demand amounts, GST split,
payment reliability, forecasting) is already JavaScript and has been verified
to the rupee against an independent spreadsheet engine — see
`claude/Platform Plan - Architecture Options and Costs.md` in the project.

When it's time to build the real dashboard screens, that engine should be
extracted into this package and reused, not rewritten — rewriting it would
throw away that verification. Not started yet; this is increment 4+ territory.
