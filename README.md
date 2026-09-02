# Perfect Solutions — Collection MIS

A single-page collections MIS for real-estate builders. It reads a builder's Excel
workbook, keeps everything in memory while you work, and writes the workbook back
out. There is no server, no database and no account.

## Running it

Open `index.html` in any modern browser, then load a builder workbook from the file
picker on the page. Nothing is uploaded anywhere; the file never leaves the machine.

If your browser or IT policy restricts `file://` pages, serve the folder instead:

```bash
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```

and open <http://localhost:8123>.

## Handing it to someone else

They should get one file, not this folder. Build it:

```bash
powershell -ExecutionPolicy Bypass -File tools\build.ps1
```

That writes `dist\mis-app.html` — the stylesheet and every script inlined into one
self-contained page they can double-click. `dist/` is git-ignored; rebuild it rather
than committing it.

## What it does

One builder per workbook: `projects[] → towers[] → customers, collections, milestone
payments`. Every screen renders from that same in-memory state, filtered by the
Project / Tower context bar at the top.

**Action Items** — the working queue. Each open demand is split into a customer-side
chase and a bank-side chase, because the customer settles their own share and the bank
disburses the rest on its own timetable. The bank side is started early by however long
that particular bank actually takes.

**Dashboard** — Overview, Customer 360, Reliability, Forecast. Every number is
clickable: it opens the records that produced it, with the contributing column
highlighted.

**Records** — Customers, Collections, Documents (demand letters and receipts, modelled
on a real demand-letter-cum-tax-invoice so a customer who has had ten of them does not
have to learn to read an eleventh).

**Settings** — which data checks run, how serious each is, what it says, the threshold
numbers, and which fields are mandatory. All of it is saved into the workbook, so the
rule set travels with the builder file instead of living in one browser profile.

## Source layout

`index.html` is markup only. It pulls in the stylesheet and the scripts in a fixed
order:

| File | |
|---|---|
| `src/app.css` | Design tokens, light/dark themes, nav rail, all component CSS |
| `vendor/exceljs.js` | ExcelJS, with JSZip and buffer. Minified third-party build — **do not edit** |
| `src/template.js` | `TEMPLATE_BASE64`, the blank workbook new outputs are built from |
| `src/calc.js` | Shared calc engine: pure functions mirroring every formula column in the workbook |
| `src/state.js` | App state and the entry forms |
| `src/dashboard-data.js` | Dashboard data adapter |
| `src/workbook.js` | Workbook read/write via ExcelJS |
| `src/file-io.js` | Browser file load / save |
| `src/drilldown.js` | Report drill-through |
| `src/required.js` | Mandatory fields |
| `src/settings.js` | Settings |
| `src/actions.js` | Action Items engine |
| `src/actions-render.js` | Action Items rendering |
| `src/confirm.js` | In-page confirmation dialog |
| `src/collection-panel.js` | Per-customer collection panel |
| `src/charts.js` | Chart renderers |
| `src/documents.js` | Demand letters and receipts |
| `src/rail.js` | Navigation rail |
| `src/boot.js` | Event wiring and boot |

These are **classic scripts sharing globals, not modules**, so the order of the script
tags in `index.html` is load-bearing. A file may use anything defined above it and
nothing defined below. Adding a file means adding a tag in the right position; the
build picks it up automatically.

`src/state.js` is still large at ~4,100 lines because it holds every entry form
alongside the state itself. It is the obvious next thing to break up.

## Verifying a change did not break the structure

```bash
powershell -ExecutionPolicy Bypass -File tools\verify.ps1
```

This rebuilds the single file and compares it byte for byte against the pre-split
original recorded at the `baseline-import` tag. It passed at the moment of the split,
which is what proved the split lost nothing. Once you start editing the sources it is
*expected* to fail, since the output is then meant to differ. Point it at a later
known-good tag to keep using it:

```bash
powershell -ExecutionPolicy Bypass -File tools\verify.ps1 -BaselineRef v1.0:index.html
```

## Data and git

Builder workbooks are **git-ignored** (`*.xlsx`, `*.xls`, `*.csv`). They carry live
customer names, ledgers and contact numbers, and must never enter this history. Keep
them outside the repo folder.
