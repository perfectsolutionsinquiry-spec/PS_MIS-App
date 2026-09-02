# Perfect Solutions — Collection MIS

A single-page collections MIS for real-estate builders. One HTML file, opened
straight from disk. It reads a builder's Excel workbook, keeps everything in
memory while you work, and writes the workbook back out — there is no server,
no database and no account.

## Running it

Double-click `index.html`, or open it in any modern browser. Then load a builder
workbook from the file picker on the page. Nothing is uploaded anywhere; the file
never leaves the machine.

## What it does

One builder per workbook: `projects[] → towers[] → customers, collections,
milestone payments`. Every screen renders from that same in-memory state,
filtered by the Project / Tower context bar at the top.

**Action Items** — the working queue. Each open demand is split into a
customer-side chase and a bank-side chase, because the customer settles their own
share and the bank disburses the rest on its own timetable. The bank side is
started early by however long that particular bank actually takes.

**Dashboard** — Overview, Customer 360, Reliability, Forecast. Every number is
clickable: it opens the records that produced it, with the contributing column
highlighted.

**Records** — Customers, Collections, Documents (demand letters and receipts,
modelled on a real demand-letter-cum-tax-invoice so a customer who has had ten of
them does not have to learn to read an eleventh).

**Settings** — which data checks run, how serious each is, what it says, the
threshold numbers, and which fields are mandatory. All of it is saved into the
workbook, so the rule set travels with the builder file rather than living in one
browser profile.

## Layout of the file

`index.html` is currently one self-contained file, ~13,200 lines. It is already
organised into labelled blocks, in load order:

| Lines | Block |
|---|---|
| 7–1205 | Stylesheet: design tokens, light/dark themes, nav rail, all component CSS |
| 1206–2879 | Page markup |
| 2880–2924 | **Vendor**: ExcelJS bundle (with JSZip, buffer, ieee754) — ~925 KB, minified, do not edit |
| 2925 | `TEMPLATE_BASE64` — the blank workbook new outputs are built from |
| 2926–3369 | Shared calc engine — pure functions mirroring every formula column in the workbook |
| 3370–7512 | App state and the entry forms |
| 7513–7665 | Dashboard data adapter |
| 7666–8493 | Workbook read/write (ExcelJS) |
| 8494–8504 | Browser file load / save |
| 8505–8823 | Report drill-through |
| 8824–8994 | Mandatory fields |
| 8995–9266 | Settings |
| 9267–9712 | Action Items engine |
| 9713–9990 | Action Items rendering |
| 9991–10068 | In-page confirmation dialog |
| 10069–10772 | Per-customer collection panel |
| 10773–12108 | Chart renderers |
| 12109–12646 | Demand letters and receipts |
| 12647–12724 | Navigation rail |
| 12725–13202 | Event wiring and boot |

These are classic scripts sharing globals, so **execution order matters**. They
are being split into separate files under `src/`, one per block, loaded by
`index.html` in exactly this order.

## Data and git

Builder workbooks are **git-ignored** (`*.xlsx`, `*.xls`, `*.csv`). They carry
live customer names, ledgers and contact numbers, and must never enter this
history. Keep them outside the repo folder, or accept the ignore rule as it
stands.
