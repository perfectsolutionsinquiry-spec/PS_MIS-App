/* ================= Workbook read/write (ExcelJS) =================
   Dual-runtime: required by the Node verification prototype, and inlined
   verbatim into the browser tool. Depends on calc.js functions as globals.
*/

// Legacy fixed-10 milestone display columns on Collection MIS NEW. Only filled when a
// tower's schedule happens to be exactly 10 stages; Payment Timeline is authoritative.
const MILESTONE_COLS = ['AO','AP','AQ','AR','AS','AT','AU','AV','AW','AX'];
const TOTAL_SUM_COLS = ['U','W','X','Z','AA','AC','AD','AG','AH','AI','AJ','AK','AL','AM','AN',
  ...MILESTONE_COLS, 'AY','AZ','BA','BB','BE','BI','BJ','BK','BL','BO','BP','BR','BS','BU','BV'];
const SH_PROJECTS = 'Projects & Towers';
const SH_COLL     = 'COLLECTION MIS NEW';
const SH_REC      = 'Recovery Sheet';
const SH_TL       = 'Payment Timeline';
const SH_SET      = 'Settings';
const SH_NOTES    = 'Work Notes';
const SH_BUILDER  = 'Builder Partner';
const SH_CONTACTS = 'Project Contacts';
const SH_COAPP    = 'Co-Applicants';
const SH_INVENTORY= 'Inventory';

function colLetterToNum(letter) { let n = 0; for (let i = 0; i < letter.length; i++) n = n * 26 + (letter.charCodeAt(i) - 64); return n; }
function cellVal(cell) {
  const v = cell.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) return v.result;
    return null; // formula with no cached result -- never trusted on read
  }
  return v;
}
function asNum(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function asDate(v) { if (!v) return null; const d = (v instanceof Date) ? v : new Date(v); return isNaN(d.getTime()) ? null : d; }
function isoOf(d) { const x = asDate(d); return x ? new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : ''; }
function dateOfIso(v) { return v ? new Date(v + 'T00:00:00') : null; }

/* ---------------- READ ---------------- */
function parseWorkbookIntoState(wb, mkid) {
  const wsPr = wb.getWorksheet(SH_PROJECTS) || wb.getWorksheet('Projects');
  const wsC  = wb.getWorksheet(SH_COLL);
  const wsR  = wb.getWorksheet(SH_REC) || wb.getWorksheet('RECOVERY SHEET');
  const wsP  = wb.getWorksheet(SH_TL);
  if (!wsC) throw new Error('That does not look like a Perfect Solutions MIS record.');

  // ---- Projects & Towers ----
  // v3 layout: Project, Builder, Address, Tower, PossessionTarget, Milestone, %, Order
  // v2 layout: Project, Builder, Address, Milestone, %, Order  (no tower -> one implicit tower)
  const projects = [];
  if (wsPr) {
    const hasTower = String(cellVal(wsPr.getRow(2).getCell(4)) || '').toLowerCase().includes('tower');
    const byProj = {};
    let r = 3, blanks = 0;
    while (r < 20000) {
      const row = wsPr.getRow(r);
      const pname = cellVal(row.getCell(1));
      if (!pname) { blanks++; if (blanks > 3) break; r++; continue; }
      blanks = 0;
      const pkey = String(pname);
      if (!byProj[pkey]) {
        byProj[pkey] = { id: mkid('p'), name: pkey, builder: cellVal(row.getCell(2)) || '',
                         address: cellVal(row.getCell(3)) || '',
                         rera: cellVal(row.getCell(11)) || '', survey: cellVal(row.getCell(12)) || '',
                         city: cellVal(row.getCell(13)) || '', accountId: cellVal(row.getCell(14)) || '',
                         towers: [], _tw: {} };
        projects.push(byProj[pkey]);
      }
      const P = byProj[pkey];
      const tname = hasTower ? (cellVal(row.getCell(4)) || '') : 'A';
      const tkey = String(tname);
      if (!P._tw[tkey]) {
        P._tw[tkey] = { id: mkid('t'), name: tkey,
                        possessionTarget: hasTower ? asDate(cellVal(row.getCell(5))) : null, schedule: [] };
        P.towers.push(P._tw[tkey]);
      }
      const T = P._tw[tkey];
      const label = cellVal(row.getCell(hasTower ? 6 : 4));
      if (label) {
        const ordRaw = cellVal(row.getCell(hasTower ? 8 : 6));
        T.schedule.push({ id: mkid('m'), label: String(label), pct: asNum(cellVal(row.getCell(hasTower ? 7 : 5))),
                          plannedDate: hasTower ? asDate(cellVal(row.getCell(9))) : null,
                          completedDate: hasTower ? asDate(cellVal(row.getCell(10))) : null,
                          _o: (ordRaw == null ? T.schedule.length : asNum(ordRaw)) });
      }
      r++;
    }
    projects.forEach(p => {
      p.towers.forEach(t => { t.schedule.sort((a, b) => a._o - b._o); t.schedule.forEach(m => delete m._o); });
      delete p._tw;
    });
  }
  projects.forEach(p => { if (!p.contacts) p.contacts = []; });
  if (typeof readContactsSheet === 'function') readContactsSheet(wb, projects);
  if (typeof readInventorySheet === 'function') readInventorySheet(wb, projects, mkid);

  const findTower = (pName, tName) => {
    const p = projects.find(x => x.name === String(pName || ''));
    if (!p) return { project: null, tower: null };
    const t = p.towers.find(x => x.name === String(tName || '')) || null;
    return { project: p, tower: t };
  };

  // ---- Collection MIS NEW ----
  const customers = [];
  let r = 2;
  while (r < 20000) {
    const name = cellVal(wsC.getRow(r).getCell(2));
    if (!name || String(name).trim().toUpperCase() === 'TOTAL') { r++; if (!name) break; continue; }
    const row = wsC.getRow(r);
    const g = (col) => cellVal(row.getCell(colLetterToNum(col)));
    const link = findTower(g('BN'), g('L'));
    customers.push({
      id: mkid('c'), agreeNo: g('A') || (customers.length + 1),
      projectId: link.project ? link.project.id : null,
      towerId: link.tower ? link.tower.id : null,
      name: String(name), contact: g('C') || '', email: g('D') || '', pan: g('E') || '', aadhar: g('F') || '',
      profession: g('G') || '', address: g('H') || '',
      possessionDate: asDate(g('I')), bookingDate: asDate(g('J')), agreementDate: asDate(g('K')),
      wing: g('L') || '', flat: g('M') || '', type: g('N') || '',
      carpetArea: asNum(g('O')), balconyArea: asNum(g('P')), salableArea: asNum(g('S')), rate: asNum(g('T')),
      basicValueManual: asNum(g('W')), parkingAmt: asNum(g('X')), parkingType: g('Y') || '', infraCharges: asNum(g('Z')),
      agreementValueIndex: asNum(g('AC')), duePctPercent: asNum(g('AE')) * 100,
      tdsDuePctPercent: (g('AF') != null ? asNum(g('AF')) * 100 : 1),
      tdsPaid: asNum(g('AH')), stampDutyReceived: asNum(g('AK')),
      dlStatus: g('BC') || 'NOT STARTED', dlDate: asDate(g('BD')), bankOrOwn: g('BF') || '', bankersNo: g('BG') || '',
      fileNo: g('BH') || '', loanAmount: asNum(g('BI')), ocrAmt: asNum(g('BJ')), ocrPaid: asNum(g('BK')),
      remark: g('BM') || '',
      // funding plan (absent in older files -- defaults then apply)
      loanExpected: asNum(g('BO')),
      tokenPaid: asNum(g('BP')),
      stampDutyPct: g('BQ') != null ? asNum(g('BQ')) * 100 : null,
      stampDutyAmt: asNum(g('BR')),
      registrationAmt: g('BS') != null ? asNum(g('BS')) : null,
      gstPct: g('BT') != null ? asNum(g('BT')) * 100 : null,
      otherCharges: asNum(g('BU')),
      psNo: g('BW') ? String(g('BW')).trim() : '',
      loanExpectedMax: String(g('BX') || '').trim().toUpperCase() === 'YES',
      assignedTo: g('BY') ? String(g('BY')).trim() : '',
      assignedPhone: g('BZ') ? String(g('BZ')).trim() : '',
      assignedEmail: g('CA') ? String(g('CA')).trim() : '',
      // fields added after reviewing a live builder's report; older files simply lack them
      coApplicant: g('CB') || '', coApplicantPan: g('CC') || '', coApplicants: null,
      marketValue: asNum(g('CD')),
      bookingSource: g('CE') || '', subSource: g('CF') || '',
      salesManager: g('CG') || '', bookingScheme: g('CH') || '',
      bookingStatus: (g('CI') ? String(g('CI')).trim().toUpperCase() : 'BOOKED'),
      parkingLevel: g('CJ') || '', parkingNo: g('CK') || '',
      maintenanceAmt: asNum(g('CL')), maintenanceGst: asNum(g('CM')),
      maintenanceReceived: asNum(g('CN')), maintenanceGstReceived: asNum(g('CO')),
      registrationNo: g('CP') || '', registrationDate: asDate(g('CQ')),
      cancelDate: asDate(g('CT')), cancelReason: g('CU') || '',
      stage: g('CV') ? String(g('CV')).trim().toLowerCase() : '',
    });
    r++;
  }
  const custByName = {};
  customers.forEach(c => { custByName[c.name] = c; });

  // ---- Co-Applicants (own sheet; absent in older records) ----
  const wsCA = wb.getWorksheet(SH_COAPP);
  if (wsCA) {
    const seen = {};
    let ar = 2, ablanks = 0;
    while (ar < 60000) {
      const who = cellVal(wsCA.getRow(ar).getCell(1));
      if (!who) { ablanks++; if (ablanks > 3) break; ar++; continue; }
      ablanks = 0;
      const c = custByName[String(who).trim()];
      if (c) {
        if (!seen[c.name]) { c.coApplicants = []; seen[c.name] = true; }
        const row = wsCA.getRow(ar);
        const rec = { id: mkid('ca') };
        COAPP_FIELDS.forEach(([k, , t], i) => {
          const v = cellVal(row.getCell(3 + i));
          rec[k] = t === 'num' ? asNum(v) : (v == null ? '' : String(v));
        });
        if (c.coApplicants.length < MAX_COAPPLICANTS) c.coApplicants.push(rec);
      }
      ar++;
    }
  }
  // anything still null falls back to the two legacy columns
  customers.forEach(c => {
    if (!Array.isArray(c.coApplicants)) {
      c.coApplicants = (c.coApplicant || c.coApplicantPan)
        ? [Object.assign({ id: mkid('ca') },
            COAPP_FIELDS.reduce((o, [k, , t]) => { o[k] = t === 'num' ? 0 : ''; return o; }, {}),
            { name: c.coApplicant || '', pan: c.coApplicantPan || '' })]
        : [];
    }
  });

  // ---- Recovery Sheet (v2/v3 tidy with Project at B, or v1 tidy without) ----
  const collections = [];
  if (wsR) {
    const hB = String(cellVal(wsR.getRow(2).getCell(2)) || '').toLowerCase();
    const hC = String(cellVal(wsR.getRow(2).getCell(3)) || '').toLowerCase();
    // v3 appends Source (J) and Requested On (K) after Remark; older files simply lack them
    const cols = hC.includes('customer') ? { date:1, cust:3, wing:4, flat:5, cost:6, gst:7, rem:9, src:10, req:11 }
               : hB.includes('customer') ? { date:1, cust:2, wing:3, flat:4, cost:5, gst:6, rem:8, src:0, req:0 } : null;
    if (cols) {
      let rr = 3, blanks = 0;
      while (rr < 60000) {
        const row = wsR.getRow(rr);
        const cust = cellVal(row.getCell(cols.cust));
        if (!cust) { blanks++; if (blanks > 3) break; rr++; continue; }
        blanks = 0;
        if (String(cust).trim().toUpperCase() === 'TOTAL') { rr++; continue; }
        const date = asDate(cellVal(row.getCell(cols.date)));
        if (date) {
          const rawSrc = cols.src ? String(cellVal(row.getCell(cols.src)) || '').trim() : '';
          collections.push({ id: mkid('r'), date, customer: String(cust),
            wing: cellVal(row.getCell(cols.wing)) || '', flat: cellVal(row.getCell(cols.flat)) || '',
            flatCost: asNum(cellVal(row.getCell(cols.cost))), gst: asNum(cellVal(row.getCell(cols.gst))),
            remark: cellVal(row.getCell(cols.rem)) || '',
            source: /bank/i.test(rawSrc) ? 'Bank' : (rawSrc ? 'Own' : ''),
            requestedDate: cols.req ? asDate(cellVal(row.getCell(cols.req))) : null });
        }
        rr++;
      }
    }
  }

  // ---- Payment Timeline ----
  // Rows for a customer are written consecutively in their tower's schedule order,
  // so milestone identity is recovered positionally (labels may have been edited).
  const milestonePaid = {};
  if (wsP) {
    const hasTower = String(cellVal(wsP.getRow(2).getCell(4)) || '').toLowerCase().includes('tower');
    const C = hasTower ? { paid:10, pdate:11, reason:13 } : { paid:9, pdate:10, reason:12 };
    let pr = 3, blanks = 0, lastCust = null, idx = 0;
    while (pr < 200000) {
      const row = wsP.getRow(pr);
      const cust = cellVal(row.getCell(1));
      if (!cust) { blanks++; if (blanks > 3) break; pr++; continue; }
      blanks = 0;
      const cs = String(cust);
      idx = (cs === lastCust) ? idx + 1 : 0;
      lastCust = cs;
      const c = custByName[cs];
      let sched = null;
      if (c && c.projectId && c.towerId) {
        const p = projects.find(x => x.id === c.projectId);
        const t = p && p.towers.find(x => x.id === c.towerId);
        sched = t ? t.schedule : null;
      }
      const m = sched ? sched[idx] : null;
      const amt = cellVal(row.getCell(C.paid));
      const pd  = asDate(cellVal(row.getCell(C.pdate)));
      if (m && amt != null && amt !== '' && pd) {
        if (!milestonePaid[cs]) milestonePaid[cs] = {};
        milestonePaid[cs][m.id] = { amount: asNum(amt), date: isoOf(pd), reason: cellVal(row.getCell(C.reason)) || '' };
      }
      pr++;
    }
  }

  // ---- Settings (absent in older files -- shipped defaults then apply) ----
  const wsS = wb.getWorksheet(SH_SET);
  let settings = null;
  if (wsS) {
    settings = {};
    let sr = 3, blanks = 0;
    while (sr < 500) {
      const key = cellVal(wsS.getRow(sr).getCell(1));
      if (!key) { blanks++; if (blanks > 3) break; sr++; continue; }
      blanks = 0;
      const raw = cellVal(wsS.getRow(sr).getCell(2));
      const k = String(key);
      if (k === 'banks') {
        settings.banks = String(raw || '').split('|').map(x => x.trim()).filter(Boolean);
      } else if (k.indexOf('req.') === 0) {
        const id = k.slice(4).replace(/\.on$/, '');
        settings.req = settings.req || {};
        settings.req[id] = { on: (String(raw).toLowerCase() === 'true' || raw === true) };
      } else if (k.indexOf('gap.') === 0) {
        const [, id, field] = k.split('.');
        settings.gaps = settings.gaps || {};
        settings.gaps[id] = settings.gaps[id] || {};
        settings.gaps[id][field] = (field === 'on') ? (String(raw).toLowerCase() === 'true' || raw === true)
                                                    : String(raw == null ? '' : raw);
      } else {
        const n = parseFloat(raw);
        settings[k] = isNaN(n) ? raw : n;
      }
      sr++;
    }
  }

  // ---- Work Notes (absent in older files: the trail simply starts from today) ----
  const workNotes = {};
  const wsN = wb.getWorksheet(SH_NOTES);
  if (wsN) {
    let nr = 2, blanks = 0;
    while (nr < 20000) {
      const row = wsN.getRow(nr);
      const who = cellVal(row.getCell(1));
      if (!who) { blanks++; if (blanks > 5) break; nr++; continue; }
      blanks = 0;
      const name = String(who).trim();
      const when = cellVal(row.getCell(2));
      (workNotes[name] = workNotes[name] || []).push({
        ts: (when instanceof Date) ? when.toISOString() : String(when || ''),
        kind: String(cellVal(row.getCell(3)) || 'note').trim().toLowerCase(),
        text: String(cellVal(row.getCell(4)) || ''),
        changesText: String(cellVal(row.getCell(5)) || ''),
      });
      nr++;
    }
  }

  return { projects, customers, collections, milestonePaid, settings, workNotes };
}

/* ---------------- WRITE ---------------- */
// only the values that differ from the shipped defaults are written, so the sheet stays readable
function writeSettings(wb) {
  const ws = wb.getWorksheet(SH_SET);
  if (!ws) return;
  for (let r = 3; r <= 400; r++) { const row = ws.getRow(r); for (let c = 1; c <= 3; c++) row.getCell(c).value = null; }
  const style = []; ws.getRow(3).eachCell({ includeEmpty: true }, (c, i) => { style[i] = c.style; });
  let r = 3;
  const put = (k, v, note) => {
    const row = ws.getRow(r);
    style.forEach((st, i) => { if (st) row.getCell(i).style = st; });
    row.getCell(1).value = k; row.getCell(2).value = v; row.getCell(3).value = note || '';
    row.commit(); r++;
  };
  Object.keys(CONFIG_DEFAULTS).forEach(k => {
    if (k === 'gaps' || k === 'req' || k === 'banks') return;
    if (CONFIG[k] !== CONFIG_DEFAULTS[k]) put(k, CONFIG[k], 'default ' + CONFIG_DEFAULTS[k]);
  });
  // the lending panel, pipe-joined -- only written when it differs from the shipped list
  const bl = bankList().filter(b => b !== OWN_FUNDS);
  const dl = (CONFIG_DEFAULTS.banks || []).map(b => String(b).toUpperCase()).sort();
  if (bl.join('|') !== dl.join('|')) put('banks', bl.join('|'), 'lenders offered on the customer form');
  const req = CONFIG.req || {};
  Object.keys(req).forEach(id => {
    const r = REQ_BY_ID[id];
    if (!r || typeof req[id].on !== 'boolean' || req[id].on === r.def) return;
    put('req.' + id + '.on', req[id].on, (req[id].on ? 'blocks' : 'does not block') + ' the save');
  });
  const gaps = CONFIG.gaps || {};
  Object.keys(gaps).forEach(id => {
    const o = gaps[id] || {};
    if (o.on === false || o.on === true) put('gap.' + id + '.on', o.on, 'is this check running');
    if (o.sev) put('gap.' + id + '.sev', o.sev, 'crit = blocking, warn = warning');
    if (o.msg) put('gap.' + id + '.msg', o.msg, 'message shown for this check');
  });
  if (r === 3) put('(defaults)', 'nothing customised', 'every check and threshold is at its shipped value');
}

/* One row per entry, oldest first, so the trail reads top to bottom in Excel as well.
   The sheet is created when it is missing, which is how older builder files pick it up. */
function writeWorkNotes(wb, S) {
  let ws = wb.getWorksheet(SH_NOTES);
  if (!ws) {
    ws = wb.addWorksheet(SH_NOTES);
    ws.columns = [{ width: 26 }, { width: 21 }, { width: 10 }, { width: 52 }, { width: 70 }];
  }
  const head = ['Customer', 'When', 'Type', 'Note', 'What changed'];
  head.forEach((h, i) => { const c = ws.getRow(1).getCell(i + 1); c.value = h; c.font = { bold: true }; });
  ws.getRow(1).commit();
  const last = ws.rowCount;
  for (let r = 2; r <= Math.max(last, 2); r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= 5; c++) row.getCell(c).value = null;
  }
  let r = 2;
  Object.keys(S.workNotes || {}).forEach(name => {
    (S.workNotes[name] || []).forEach(n => {
      const row = ws.getRow(r);
      row.getCell(1).value = name;
      // a real date, so the column sorts and reads as a date in Excel rather than as text
      const when = n.ts ? new Date(n.ts) : null;
      if (when && !isNaN(when)) { row.getCell(2).value = when; row.getCell(2).numFmt = 'dd-mm-yyyy hh:mm'; }
      else row.getCell(2).value = n.ts || '';
      row.getCell(3).value = n.kind || 'note';
      row.getCell(4).value = n.text || '';
      row.getCell(5).value = n.changesText || '';
      row.getCell(5).alignment = { wrapText: true, vertical: 'top' };
      row.commit();
      r++;
    });
  });
}

/* ---------------- Inventory ----------------
   One row per unit, with the unit type repeated on each row. That is redundant in database
   terms and exactly right here: the sheet has to be readable by whoever opens it in Excel,
   and a builder reads inventory as a list of flats, not as a normalised schema.
   A unit type with no units yet is written with a blank flat number so it survives. */
const INV_COLS = ['Project', 'Tower / Wing', 'Type ref', 'Unit type', 'Configuration', 'Carpet (sq.ft)',
  'Balcony (sq.ft)', 'Total carpet (sq.ft)', 'Total carpet (sq.mt)', 'Sellable (sq.ft)',
  'Rate (Rs/sq.ft)', 'Parking', 'Floor', 'Flat no.', 'Note'];

function readInventorySheet(wb, projects, mkid) {
  const ws = wb.getWorksheet(SH_INVENTORY);
  if (!ws) return;
  const mk = mkid || (p => (p || 'x') + Math.random().toString(36).slice(2));
  let r = 2, blanks = 0;
  while (r < 60000) {
    const row = ws.getRow(r);
    const pname = cellVal(row.getCell(1));
    if (!pname) { blanks++; if (blanks > 3) break; r++; continue; }
    blanks = 0;
    const p = projects.find(x => x.name === String(pname));
    const t = p && p.towers.find(x => x.name === String(cellVal(row.getCell(2)) || ''));
    if (t) {
      if (!Array.isArray(t.unitTypes)) t.unitTypes = [];
      if (!Array.isArray(t.units)) t.units = [];
      if (!t._utByRef) t._utByRef = {};
      // "Type ref" is the type's own number within the tower. Matching on the name instead
      // merged two types that happened to share one -- two blank rows, or the same name in
      // different case -- and quietly gave one of them the other's areas and price.
      const ref = cellVal(row.getCell(3));
      const refKey = ref == null ? '' : String(ref).trim();
      let ut = refKey ? t._utByRef[refKey] : null;
      if (refKey && !ut) {
        ut = { id: mk('ut'), name: String(cellVal(row.getCell(4)) || ''),
               config: String(cellVal(row.getCell(5)) || ''),
               carpet: asNum(cellVal(row.getCell(6))), balcony: asNum(cellVal(row.getCell(7))),
               sellable: asNum(cellVal(row.getCell(10))), rate: asNum(cellVal(row.getCell(11))),
               parking: String(cellVal(row.getCell(12)) || '') };
        t.unitTypes.push(ut);
        t._utByRef[refKey] = ut;
      }
      const flat = cellVal(row.getCell(14));
      if (flat != null && String(flat).trim() !== '') {
        // a unit with no type ref is one whose type was deleted: it stays unassigned rather
        // than conjuring a nameless type with zero areas
        t.units.push({ id: mk('iu'), flat: String(flat).trim(), floor: asNum(cellVal(row.getCell(13))),
                       typeId: ut ? ut.id : '', note: String(cellVal(row.getCell(15)) || '') });
      }
    }
    r++;
  }
  projects.forEach(p => (p.towers || []).forEach(t => { delete t._utByRef; }));
}

function writeInventorySheet(wb, S) {
  const has = (S.projects || []).some(p => (p.towers || []).some(t =>
    (t.units && t.units.length) || (t.unitTypes && t.unitTypes.length)));
  let ws = wb.getWorksheet(SH_INVENTORY);
  if (!ws && !has) return;
  if (!ws) {
    ws = wb.addWorksheet(SH_INVENTORY);
    ws.columns = [{ width: 26 }, { width: 14 }, { width: 9 }, { width: 22 }, { width: 14 },
                  { width: 15 }, { width: 15 }, { width: 18 }, { width: 18 }, { width: 16 },
                  { width: 15 }, { width: 14 }, { width: 8 }, { width: 14 }, { width: 30 }];
  }
  const last = Math.max(ws.actualRowCount || 0, ws.rowCount > 1e6 ? 2 : (ws.rowCount || 0), 2) + 5;
  for (let r = 1; r <= last; r++) { const row = ws.getRow(r); for (let c = 1; c <= INV_COLS.length + 1; c++) row.getCell(c).value = null; }
  INV_COLS.forEach((l, i) => { const c = ws.getRow(1).getCell(i + 1); c.value = l; c.font = { bold: true }; });
  let r = 2;
  (S.projects || []).forEach(p => (p.towers || []).forEach(t => {
    const types = t.unitTypes || [];
    const units = t.units || [];
    const refOf = ut => ut ? (types.indexOf(ut) + 1) : null;
    const put = (ut, u) => {
      const row = ws.getRow(r);
      row.getCell(1).value = p.name;
      row.getCell(2).value = t.name || '';
      row.getCell(3).value = refOf(ut);
      row.getCell(4).value = ut ? (ut.name || '') : '';
      row.getCell(5).value = ut ? (ut.config || '') : '';
      row.getCell(6).value = ut ? (ut.carpet || 0) : 0;
      row.getCell(7).value = ut ? (ut.balcony || 0) : 0;
      row.getCell(8).value = ut ? round2((ut.carpet || 0) + (ut.balcony || 0)) : 0;
      row.getCell(9).value = ut ? round2(((ut.carpet || 0) + (ut.balcony || 0)) * 0.092903) : 0;
      row.getCell(10).value = ut ? (ut.sellable || 0) : 0;
      row.getCell(11).value = ut ? (ut.rate || 0) : 0;
      row.getCell(12).value = ut ? (ut.parking || '') : '';
      row.getCell(13).value = u ? (u.floor || null) : null;
      row.getCell(14).value = u ? (u.flat || '') : '';
      row.getCell(15).value = u ? (u.note || '') : '';
      row.commit(); r++;
    };
    units.forEach(u => put(types.find(x => x.id === u.typeId) || null, u));
    // a type nobody has been placed against yet still has to survive the round trip
    types.forEach(ut => { if (!units.some(u => u.typeId === ut.id)) put(ut, null); });
  }));
}

/* Co-applicants get their own sheet rather than another thirty columns bolted onto
   Collection MIS NEW: four people with nine fields each is a table, and a table that has
   to stay readable to whoever opens the workbook in Excel. */
function writeCoApplicantsSheet(wb, S) {
  let ws = wb.getWorksheet(SH_COAPP);
  if (!ws) {
    ws = wb.addWorksheet(SH_COAPP);
    ws.columns = [{ width: 30 }, { width: 6 }, { width: 28 }, { width: 18 }, { width: 16 },
                  { width: 20 }, { width: 16 }, { width: 28 }, { width: 20 }, { width: 16 }, { width: 40 }];
  }
  const last = Math.max(ws.actualRowCount || 0, ws.rowCount > 1e6 ? 2 : (ws.rowCount || 0), 2) + 5;
  for (let r = 1; r <= last; r++) { const row = ws.getRow(r); for (let c = 1; c <= 2 + COAPP_FIELDS.length; c++) row.getCell(c).value = null; }
  ['Customer', 'Sr'].concat(COAPP_FIELDS.map(f => f[1])).forEach((l, i) => {
    const c = ws.getRow(1).getCell(i + 1); c.value = l; c.font = { bold: true };
  });
  let r = 2;
  (S.customers || []).forEach(c => {
    const list = Array.isArray(c.coApplicants) ? c.coApplicants : [];
    list.slice(0, MAX_COAPPLICANTS).forEach((ca, i) => {
      const row = ws.getRow(r);
      row.getCell(1).value = c.name;
      row.getCell(2).value = i + 1;
      COAPP_FIELDS.forEach(([k, , t], j) => { row.getCell(3 + j).value = t === 'num' ? (ca[k] || 0) : (ca[k] || ''); });
      row.commit(); r++;
    });
  });
}

function writeStateToWorkbook(wb, S) {
  writeSettings(wb);
  writeWorkNotes(wb, S);
  writeCoApplicantsSheet(wb, S);
  writeInventorySheet(wb, S);
  if (typeof writeBuilderSheet === 'function') writeBuilderSheet(wb, S.builder);
  if (typeof writeContactsSheet === 'function') writeContactsSheet(wb, S);
  const wsPr = wb.getWorksheet(SH_PROJECTS);
  const wsC  = wb.getWorksheet(SH_COLL);
  const wsR  = wb.getWorksheet(SH_REC);
  const wsP  = wb.getWorksheet(SH_TL);

  // capture style donor rows BEFORE mutating
  const grab = (ws, rowNum) => { const a = []; ws.getRow(rowNum).eachCell({ includeEmpty: true }, (c, i) => { a[i] = c.style; }); return a; };
  const stylePr = grab(wsPr, 3), styleC = grab(wsC, 2), styleR = grab(wsR, 3), styleP = grab(wsP, 3);
  const applyStyle = (row, styles) => { styles.forEach((s, i) => { if (s) row.getCell(i).style = s; }); };

  /* Wipe what the previous save left behind -- but only as far as there is anything to
     wipe. Clearing to a fixed 60,000 rows created about a million empty cells on every
     save: a 2.6 MB workbook and ten seconds of work per file, which with a whole folder
     open is a minute of waiting for nothing. */
  const clear = (ws, from, cap, nCols) => {
    const to = Math.min(cap, Math.max(from, (ws.actualRowCount || 0) + 5, (ws.rowCount || 0) > 1e6 ? from : (ws.rowCount || 0)));
    for (let r = from; r <= to; r++) { const row = ws.getRow(r); for (let c = 1; c <= nCols; c++) row.getCell(c).value = null; }
  };
  clear(wsPr, 3, 6000, 14);
  clear(wsC, 2, 4000, 100);
  clear(wsR, 3, 12000, 11);
  clear(wsP, 3, 60000, 13);

  const towerOf = (c) => {
    const p = S.projects.find(x => x.id === c.projectId);
    if (!p) return { project: null, tower: null };
    return { project: p, tower: p.towers.find(x => x.id === c.towerId) || null };
  };
  const sumRecovery = (name) => {
    let flatCost = 0, gst = 0;
    S.collections.forEach(e => { if (e.customer === name) { flatCost += (e.flatCost || 0); gst += (e.gst || 0); } });
    return { flatCost, gst };
  };
  // duePct / tdsDuePct are held as 0-100 in the UI; the calc engine + sheet want fractions
  const calcCust = (c) => ({ ...c, duePct: (c.duePctPercent || 0) / 100,
                             tdsDuePct: (c.tdsDuePctPercent != null ? c.tdsDuePctPercent : 1) / 100 });

  // ---- Projects & Towers ----
  let pr = 3;
  S.projects.forEach(p => {
    const towers = p.towers.length ? p.towers : [{ name: '', possessionTarget: null, schedule: [] }];
    towers.forEach(t => {
      const stages = t.schedule.length ? t.schedule : [{ label: '', pct: null }];
      stages.forEach((m, i) => {
        const row = wsPr.getRow(pr);
        applyStyle(row, stylePr);
        row.getCell(1).value = p.name;
        row.getCell(2).value = p.builder || '';
        row.getCell(3).value = p.address || '';
        row.getCell(4).value = t.name || '';
        row.getCell(5).value = t.possessionTarget || null;
        row.getCell(6).value = m.label || null;
        row.getCell(7).value = (m.pct == null ? null : m.pct);
        row.getCell(8).value = m.label ? i + 1 : null;
        row.getCell(9).value = m.plannedDate || null;
        row.getCell(10).value = m.completedDate || null;
        // appended in this version: the project's own registration, place and collection account
        row.getCell(11).value = p.rera || '';
        row.getCell(12).value = p.survey || '';
        row.getCell(13).value = p.city || '';
        row.getCell(14).value = p.accountId || '';
        row.commit();
        pr++;
      });
    });
  });

  // ---- Collection MIS NEW ----
  const custRow = {};
  S.customers.forEach((c0, i) => {
    const c = calcCust(c0);
    const r = 2 + i;
    custRow[c.name] = r;
    const row = wsC.getRow(r);
    applyStyle(row, styleC);
    const set = (L, v) => { row.getCell(colLetterToNum(L)).value = v; };
    const link = towerOf(c0);
    const schedule = link.tower ? link.tower.schedule : [];
    const d = deriveCustomer(c, sumRecovery(c.name), schedule);
    const prog = fundingProgress(c, S.collections);
    set('A', c0.agreeNo || (i + 1));
    set('B', c.name); set('C', c.contact); set('D', c.email); set('E', c.pan); set('F', c.aadhar);
    set('G', c.profession); set('H', c.address);
    set('I', c.possessionDate); set('J', c.bookingDate); set('K', c.agreementDate);
    set('L', link.tower ? link.tower.name : (c.wing || '')); set('M', c.flat); set('N', c.type);
    set('O', c.carpetArea); set('P', c.balconyArea);
    set('Q', { formula: `O${r}+P${r}`, result: d.Q });
    set('R', { formula: `ROUND(Q${r}*0.092903,2)`, result: d.R });
    set('S', c.salableArea); set('T', c.rate);
    set('U', { formula: `S${r}*T${r}`, result: d.U });
    const k = costOfFlat(c);
    set('W', c.basicValueManual);
    set('V', { formula: `U${r}-W${r}`, result: d.V });
    set('X', c.parkingAmt); set('Y', c.parkingType); set('Z', c.infraCharges);
    set('AA', { formula: `W${r}+Z${r}+X${r}`, result: d.AA });
    set('AC', c.agreementValueIndex);
    set('AB', { formula: `AA${r}-AC${r}`, result: d.AB });
    // a flat GST figure entered by hand must survive the round trip -- the formula would
    // otherwise recalculate it away from the rate the moment the file is reopened
    set('AD', k.gstOverridden ? k.gst
              : { formula: `ROUND(AC${r}*BT${r},0)`, result: k.gst });
    set('AE', c.duePct); set('AF', c.tdsDuePct);
    set('AG', { formula: `ROUND(AC${r}*AF${r},0)`, result: d.AG });
    set('AH', c.tdsPaid);
    set('AI', { formula: `ROUND(AC${r}*AE${r},0)`, result: d.AI });
    set('AL', { formula: `SUMIF('${SH_REC}'!$C$3:$C$100000,B${r},'${SH_REC}'!$F$3:$F$100000)`, result: d.AL });
    set('AJ', { formula: `AL${r}+AH${r}`, result: d.AJ });
    set('AK', c.stampDutyReceived);
    set('AM', { formula: `ROUND(AI${r}-AJ${r},0)`, result: d.AM });
    set('AN', { formula: `AC${r}-AJ${r}`, result: d.AN });
    if (schedule.length === 10) {
      schedule.forEach((m, mi) => set(MILESTONE_COLS[mi], { formula: `ROUND(AC${r}*${m.pct},0)`, result: d.milestoneAmounts[mi] }));
    }
    // was hardcoded 0.05 -- affordable housing is 1%, and a flat GST override is common
    set('AY', { formula: `ROUND(AD${r}*AE${r},0)`, result: d.AY });
    set('AZ', { formula: `SUMIF('${SH_REC}'!$C$3:$C$100000,B${r},'${SH_REC}'!$G$3:$G$100000)`, result: d.AZ });
    set('BA', { formula: `ROUND(AY${r}-AZ${r},0)`, result: d.BA });
    set('BB', { formula: `AD${r}-AZ${r}`, result: d.BB });
    set('BC', c.dlStatus); set('BD', c.dlDate);
    set('BE', { formula: `AM${r}+BA${r}`, result: d.BE });
    set('BF', c.bankOrOwn); set('BG', c.bankersNo); set('BH', c.fileNo); set('BI', c.loanAmount);
    // ---- cost of flat: every input overridable, every total a live formula ----
    const fp = fundingPlan(c);
    set('BO', c.loanExpected || 0);
    set('BP', c.tokenPaid || 0);
    set('BQ', k.sdPct / 100);
    // duty is charged on the higher of the agreement value and the ready reckoner (CD),
    // so the sheet has to say so too or it drifts from the application the moment a unit
    // is sold below the government rate
    set('BR', k.stampDutyOverridden ? k.stampDuty
              : { formula: `ROUND(MAX(AC${r},CD${r})*BQ${r},0)`, result: k.stampDuty });
    set('BS', k.registration);
    set('BT', k.gstPct / 100);
    set('BU', k.other);
    // AD is the GST column; it now carries the customer's own rate, so the recalculated
    // formula and the cached result agree. Previously AD was hardcoded 5% while the
    // result came from the per-customer rate, and the two diverged the moment Excel opened.
    set('BV', { formula: `AC${r}+BR${r}+BS${r}+AD${r}+BU${r}`, result: k.totalCost });
    set('BW', c.psNo || '');
    set('BX', c.loanExpectedMax ? 'YES' : '');
    set('BY', c.assignedTo || '');
    set('BZ', c.assignedPhone || '');
    set('CA', c.assignedEmail || '');
    // ---- own contribution (OCR): required = total cost minus whichever loan figure applies ----
    // BX = "expects the maximum the bank will give" -- an open expectation, not a number,
    // so it must not be treated as an expected loan amount when nothing is sanctioned yet
    set('BJ', { formula: `BV${r}-IF(BI${r}>0,BI${r},IF(BX${r}="YES",0,BO${r}))`,
                result: fp.ownRequired });
    set('BK', { formula: `SUMIFS('${SH_REC}'!$F$3:$F$100000,'${SH_REC}'!$C$3:$C$100000,B${r},'${SH_REC}'!$J$3:$J$100000,"Own funds")` +
                        `+SUMIFS('${SH_REC}'!$G$3:$G$100000,'${SH_REC}'!$C$3:$C$100000,B${r},'${SH_REC}'!$J$3:$J$100000,"Own funds")` +
                        `+AK${r}-MIN(AK${r},${round0(stampLoggedOf(c, S.collections))})`, result: prog.ownPaid });
    // clamped at zero, exactly as the application shows it: a customer who has paid more
    // than their own share does not owe a negative amount, and the excess is reported
    // separately by the over-payment check
    set('BL', { formula: `MAX(0,BJ${r}-BK${r})`, result: round0(prog.ownPending) });
    set('BM', c.remark);
    set('BN', link.project ? link.project.name : '');
    // ---- fields taken from a live builder's own daily sales report ----
    // the first co-applicant stays in these two columns so the layout still matches the
    // builder's own daily sales report; the rest live on the Co-Applicants sheet
    const ca0 = (Array.isArray(c.coApplicants) && c.coApplicants[0]) || null;
    set('CB', ca0 ? (ca0.name || '') : (c.coApplicant || ''));
    set('CC', ca0 ? (ca0.pan || '') : (c.coApplicantPan || ''));
    set('CD', c.marketValue || 0);
    set('CE', c.bookingSource || '');
    set('CF', c.subSource || '');
    set('CG', c.salesManager || '');
    set('CH', c.bookingScheme || '');
    set('CI', c.bookingStatus || 'BOOKED');
    set('CJ', c.parkingLevel || '');
    set('CK', c.parkingNo || '');
    set('CL', c.maintenanceAmt || 0);
    set('CM', c.maintenanceGst || 0);
    set('CN', c.maintenanceReceived || 0);
    set('CO', c.maintenanceGstReceived || 0);
    set('CP', c.registrationNo || '');
    set('CQ', c.registrationDate || null);
    // realised rate: what this unit actually fetched per square foot
    set('CR', c.salableArea > 0 ? { formula: `IF(S${r}>0,ROUND(AC${r}/S${r},2),0)`, result: realisedRate(c) } : 0);
    // money received above what is currently due -- reported, never netted off silently
    set('CS', { formula: `MAX(0,AJ${r}-AI${r})`, result: Math.max(0, (d.AJ || 0) - (d.AI || 0)) });
    set('CT', c.cancelDate || null);
    set('CU', c.cancelReason || '');
    // where this unit stands in our own pipeline, when it has been set by hand
    set('CV', c.stage || '');
    row.commit();
  });
  if (S.customers.length) {
    const lastRow = 1 + S.customers.length;
    const trow = wsC.getRow(lastRow + 2);
    trow.getCell(2).value = 'TOTAL';
    trow.getCell(2).font = { name: 'Arial', bold: true };
    const dAll = S.customers.map(c0 => {
      const link = towerOf(c0);
      return deriveCustomer(calcCust(c0), sumRecovery(c0.name), link.tower ? link.tower.schedule : []);
    });
    const manualSums = { W:'basicValueManual', X:'parkingAmt', Z:'infraCharges', AC:'agreementValueIndex',
                         AH:'tdsPaid', AK:'stampDutyReceived', BI:'loanAmount',
                         BO:'loanExpected', BP:'tokenPaid', BS:'registrationAmt', BU:'otherCharges' };
    const fundSums = { BR:'stampDuty', BV:'totalCost' };
    const ownSums  = { BJ:'ownRequired', BK:'ownPaid', BL:'ownPending' };
    const progAll = S.customers.map(c0 => fundingProgress(calcCust(c0), S.collections));
    const dMap = { U:'U', V:'V', AA:'AA', AB:'AB', AD:'AD', AG:'AG', AI:'AI', AJ:'AJ', AL:'AL', AN:'AN',
                   AY:'AY', AZ:'AZ', BA:'BA', BB:'BB', BE:'BE', BL:'BL' };
    const msIdx = { AO:0, AP:1, AQ:2, AR:3, AS:4, AT:5, AU:6, AV:7, AW:8, AX:9 };
    TOTAL_SUM_COLS.forEach(col => {
      let f, v;
      if (col === 'AM') {
        f = `SUMIF(AM2:AM${lastRow},">0")`;
        v = dAll.reduce((a, d) => a + (d.AM > 0 ? d.AM : 0), 0);
      } else {
        f = `SUM(${col}2:${col}${lastRow})`;
        if (col in manualSums) v = S.customers.reduce((a, c0) => a + asNum(c0[manualSums[col]]), 0);
        else if (col in fundSums) v = progAll.reduce((a, x) => a + (x[fundSums[col]] || 0), 0);
        else if (col in ownSums)  v = progAll.reduce((a, x) => a + (x[ownSums[col]] || 0), 0);
        else if (col in dMap)  v = dAll.reduce((a, d) => a + (d[dMap[col]] || 0), 0);
        else if (col in msIdx) v = dAll.reduce((a, d) => a + (d.milestoneAmounts[msIdx[col]] || 0), 0);
        else v = 0;
      }
      const cell = trow.getCell(colLetterToNum(col));
      cell.value = { formula: f, result: v };
      cell.font = { name: 'Arial', bold: true };
      const st = styleC[colLetterToNum(col)];
      if (st) cell.numFmt = st.numFmt;
    });
    trow.commit();
  }

  // ---- Recovery Sheet ----
  const sorted = [...S.collections].sort((a, b) => new Date(a.date) - new Date(b.date));
  sorted.forEach((e, i) => {
    const r = 3 + i;
    const row = wsR.getRow(r);
    applyStyle(row, styleR);
    const c = S.customers.find(x => x.name === e.customer);
    const link = c ? towerOf(c) : { project: null, tower: null };
    row.getCell(1).value = e.date;
    row.getCell(2).value = link.project ? link.project.name : '';
    row.getCell(3).value = e.customer;
    row.getCell(4).value = link.tower ? link.tower.name : (e.wing || '');
    row.getCell(5).value = e.flat;
    row.getCell(6).value = e.flatCost;
    row.getCell(7).value = e.gst;
    row.getCell(8).value = { formula: `F${r}+G${r}`, result: (e.flatCost || 0) + (e.gst || 0) };
    row.getCell(9).value = e.remark || '';
    row.getCell(10).value = e.source === 'Bank' ? 'Bank disbursement' : (e.source === 'Own' ? 'Own funds' : '');
    row.getCell(11).value = e.source === 'Bank' ? (e.requestedDate || null) : null;
    row.commit();
  });
  if (sorted.length) {
    const lastR = 3 + sorted.length - 1;
    const trow = wsR.getRow(lastR + 2);
    trow.getCell(3).value = 'TOTAL';
    trow.getCell(3).font = { name: 'Arial', bold: true };
    const sf = sorted.reduce((a, e) => a + (e.flatCost || 0), 0);
    const sg = sorted.reduce((a, e) => a + (e.gst || 0), 0);
    trow.getCell(6).value = { formula: `SUM(F3:F${lastR})`, result: sf };
    trow.getCell(7).value = { formula: `SUM(G3:G${lastR})`, result: sg };
    trow.getCell(8).value = { formula: `SUM(H3:H${lastR})`, result: sf + sg };
    [6, 7, 8].forEach(i => { trow.getCell(i).font = { name: 'Arial', bold: true }; if (styleR[i]) trow.getCell(i).numFmt = styleR[i].numFmt; });
    trow.commit();
  }

  // ---- Payment Timeline ----
  let tr = 3;
  const today = new Date();
  S.customers.forEach(c0 => {
    const c = calcCust(c0);
    const rc = custRow[c.name];
    const link = towerOf(c0);
    const schedule = link.tower ? link.tower.schedule : [];
    const cum = scheduleCumPct(schedule);
    const paid = S.milestonePaid[c.name] || {};
    const d = deriveCustomer(c, sumRecovery(c.name), schedule);
    schedule.forEach((m, i) => {
      const row = wsP.getRow(tr);
      applyStyle(row, styleP);
      const due = stageDueDate(m, c.bookingDate, c.possessionDate, cum[i]);
      const fromStage = dueDateSource(m) !== 'estimated';
      const p = paid[m.id] || null;
      const payment = p ? { amount: p.amount, date: dateOfIso(p.date) } : null;
      const amountDue = d.milestoneAmounts[i];
      const status = milestoneStatus(due, payment, amountDue, today);
      const delay = milestoneDelay(due, payment);
      row.getCell(1).value  = { formula: `'${SH_COLL}'!B${rc}`, result: c.name };
      row.getCell(2).value  = { formula: `'${SH_COLL}'!L${rc}&"-"&'${SH_COLL}'!M${rc}`, result: `${link.tower ? link.tower.name : c.wing}-${c.flat}` };
      row.getCell(3).value  = link.project ? link.project.name : '';
      row.getCell(4).value  = { formula: `'${SH_COLL}'!L${rc}`, result: link.tower ? link.tower.name : (c.wing || '') };
      row.getCell(5).value  = m.label;
      row.getCell(6).value  = m.pct;
      row.getCell(7).value  = { formula: `ROUND('${SH_COLL}'!AC${rc}*F${tr},0)`, result: amountDue };
      // a tower-level stage date is a hard fact, not something to re-derive per customer
      row.getCell(8).value  = !due ? null
        : fromStage ? due
        : { formula: `'${SH_COLL}'!J${rc}+ROUND(('${SH_COLL}'!I${rc}-'${SH_COLL}'!J${rc})*${cum[i]}/100,0)`, result: due };
      row.getCell(9).value  = status;
      row.getCell(10).value = payment ? payment.amount : null;
      row.getCell(11).value = payment ? payment.date : null;
      row.getCell(12).value = (payment && delay != null) ? { formula: `K${tr}-H${tr}`, result: delay } : null;
      row.getCell(13).value = (status === 'Partially Paid' && p) ? (p.reason || '') : '';
      row.commit();
      tr++;
    });
  });
}

if (typeof module !== 'undefined') {
  module.exports = { parseWorkbookIntoState, writeStateToWorkbook, colLetterToNum, cellVal, asNum, asDate, isoOf, dateOfIso,
    MILESTONE_COLS, TOTAL_SUM_COLS, SH_PROJECTS, SH_COLL, SH_REC, SH_TL, SH_NOTES };
}
