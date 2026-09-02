/* ================= Demand letters and receipts =================
   Modelled on a real demand letter cum tax invoice from a Pune developer: the same blocks
   in the same order, because a customer who has had ten of these should not have to learn
   to read an eleventh.

   Everything on the sheet is derived from the unit's own schedule and ledger and then
   written into an input, so the operator can correct anything the record has wrong
   without the correction leaking back into the books. The sheet is what goes out; the
   record is what we keep. */

const DOC = { kind: 'demand', name: '', demandId: '', logged: new Set() };

/* ---- rupees in words, the Indian way ---- */
const W_ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const W_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function words2(n) {
  if (n < 20) return W_ONES[n];
  return W_TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + W_ONES[n % 10] : '');
}
/* The crore group is itself decomposed, so a hundred crore reads "One Hundred Crore"
   instead of running off the end of the tens table. */
function wordsInt(n) {
  n = Math.round(n);
  if (n <= 0) return '';
  const parts = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh  = Math.floor(n / 100000);   n %= 100000;
  const thou  = Math.floor(n / 1000);     n %= 1000;
  const hund  = Math.floor(n / 100);      n %= 100;
  if (crore) parts.push(wordsInt(crore) + ' Crore');
  if (lakh)  parts.push(words2(lakh) + ' Lakh');
  if (thou)  parts.push(words2(thou) + ' Thousand');
  if (hund)  parts.push(W_ONES[hund] + ' Hundred');
  if (n)     parts.push((parts.length ? 'and ' : '') + words2(n));
  return parts.join(' ');
}
function inrWords(amount) {
  const n = Math.round(amount || 0);
  if (!n) return 'Rupees Zero Only';
  // a negative should never reach a letter, but printing its absolute value silently
  // would turn a credit into a demand
  return (n < 0 ? 'Minus Rupees ' : 'Rupees ') + wordsInt(Math.abs(n)) + ' Only';
}
const inr0 = n => Math.round(n || 0).toLocaleString('en-IN');
const dmy = d => { const x = asDateSafe(d); return x ? `${String(x.getDate()).padStart(2,'0')}.${String(x.getMonth()+1).padStart(2,'0')}.${x.getFullYear()}` : ''; };
const longDate = d => { const x = asDateSafe(d); return x ? x.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : ''; };
function financialYear(d) {
  const x = asDateSafe(d) || new Date();
  const y = x.getMonth() >= 3 ? x.getFullYear() : x.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

/* ---- who and where ---- */
function docCustomer() { return STATE.customers.find(c => c.name === DOC.name) || null; }
function docContext() {
  const c = docCustomer();
  if (!c) return null;
  const l = towerOf(c);
  const file = fileById(c._file);
  const builder = (file && STATE.builders[file.partner]) || builderOf(l.project ? l.project.builder : '') || {};
  return { c, project: l.project, tower: l.tower, builder,
           partner: file ? file.partner : (l.project ? l.project.builder : '') };
}

function fillDocCustomers() {
  const sel = document.getElementById('doc_customer');
  const list = visibleCustomers().filter(isLiveBooking)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  /* opening on the alphabetically first unit usually landed on one that had paid in full,
     so the first thing anyone saw was a letter demanding nothing */
  let cur = DOC.name && list.some(c => c.name === DOC.name) ? DOC.name : '';
  if (!cur) {
    const open = list.find(c => docDemands(c).some(r => !r.settled && r.due && r.due <= new Date()))
              || list.find(c => docDemands(c).some(r => !r.settled));
    cur = (open || list[0] || {}).name || '';
  }
  DOC.name = cur;
  sel.innerHTML = list.map(c => {
    const l = towerOf(c);
    return `<option value="${esc(c.name)}"${c.name === cur ? ' selected' : ''}>${esc(c.name)} &middot; ${
      esc(l.tower ? l.tower.name : c.wing)}-${esc(c.flat)}</option>`;
  }).join('') || '<option value="">No units in this selection</option>';
  return list;
}

/* every stage of the schedule, so a letter can be reissued for one already settled */
function docDemands(c) {
  const l = towerOf(c);
  const sched = l.tower ? l.tower.schedule : [];
  if (!sched.length) return [];
  const cum = scheduleCumPct(sched);
  const d = derived(c);
  const paid = STATE.milestonePaid[c.name] || {};
  const today = new Date();
  return sched.map((m, i) => {
    const amount = d.milestoneAmounts[i];
    const p = paid[m.id] || null;
    const already = p ? (p.amount || 0) : 0;
    const due = stageDueDate(m, c.bookingDate, c.possessionDate, cum[i]);
    const settled = amount - already <= 1;
    const status = milestoneStatus(due, p ? { amount: already, date: dateOfIso(p.date) } : null, amount, today);
    return { i, id: m.id, label: m.label, pct: (m.pct || 0) * 100, cum: cum[i],
             amount, already, outstanding: Math.max(0, amount - already), due, settled, status };
  });
}

function fillDocDemands() {
  const c = docCustomer();
  const sel = document.getElementById('doc_demand');
  const hint = document.getElementById('doc-demand-hint');
  if (!c) { sel.innerHTML = ''; hint.textContent = ''; return []; }
  const rows = docDemands(c);
  if (!rows.length) {
    sel.innerHTML = '<option value="">This tower has no payment schedule</option>';
    hint.textContent = 'Set one up under the gear icon → Projects & towers.';
    return rows;
  }
  // default to the first stage that still has money open
  const open = rows.find(r => !r.settled);
  const pick = rows.some(r => r.id === DOC.demandId) ? DOC.demandId : (open ? open.id : rows[rows.length - 1].id);
  DOC.demandId = pick;
  sel.innerHTML = rows.map(r =>
    `<option value="${r.id}"${r.id === pick ? ' selected' : ''}>${esc(r.label)} &middot; ${
      Math.round(r.pct * 100) / 100}% &middot; ${fmtINR(r.amount)}${r.settled ? ' (paid)' : ''}</option>`).join('');
  const cur = rows.find(r => r.id === pick);
  hint.textContent = cur
    ? (cur.settled ? 'Already settled: this reissues the letter for the record.'
       : `${fmtINR(cur.outstanding)} still open` + (cur.due ? `, due ${fmtDate(cur.due)}` : '') +
         (cur.status === 'Due, pending' ? ' — overdue' : ''))
    : '';
  return rows;
}

function fillDocAccounts() {
  const x = docContext();
  const accs = x ? accountsFor(x.partner, x.project ? x.project.name : '') : [];
  const opt = (a) => `<option value="${a.id}">${esc(a.label || a.type)}${a.bank ? ' · ' + esc(a.bank) : ''}</option>`;
  const guessAv = accs.find(a => /RERA|Master|collection/i.test(a.type || '')) || accs[0];
  const guessGst = accs.find(a => /GST/i.test(a.type || '')) || guessAv;
  ['doc_acc_av', 'doc_acc_gst'].forEach((id, n) => {
    const sel = document.getElementById(id);
    const keep = sel.value;
    sel.innerHTML = `<option value="">— not shown on the letter —</option>` + accs.map(opt).join('');
    const want = accs.some(a => a.id === keep) ? keep : ((n === 0 ? guessAv : guessGst) || {}).id || '';
    sel.value = want;
  });
}
function docAccount(id) {
  const x = docContext();
  if (!x || !id) return null;
  return accountsFor(x.partner, x.project ? x.project.name : '').find(a => a.id === id) || null;
}

/* ---- fill the form from the record ---- */
function docFillDefaults() {
  const x = docContext();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  if (!x) { document.getElementById('doc-paper').innerHTML = ''; return; }
  const { c, project, tower, builder } = x;
  const rows = docDemands(c);
  const cur = rows.find(r => r.id === DOC.demandId) || rows[0] || null;
  const d = derived(c);
  const prog = progOf(c);

  document.getElementById('doc-where').textContent =
    [project ? project.name : '', tower ? 'Tower ' + tower.name : '', c.flat ? 'Flat ' + c.flat : '',
     c.psNo || ''].filter(Boolean).join(' · ');

  const today = new Date();
  const isReceipt = DOC.kind === 'receipt';
  const ps = psParse(c.psNo);
  const seq = String((ps && ps.n) || (STATE.customers.indexOf(c) + 1)).padStart(4, '0');
  const proj = String((project && project.name) || 'PS').replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase();
  set('doc_date', toISODate(today));
  if (isReceipt) {
    const n = STATE.collections.filter(e => e.customer === c.name).length + 1;
    set('doc_no', `RC/${proj}/${financialYear(today)}/${seq}-${n}`);
  } else {
    set('doc_no', `DL/${proj}/${financialYear(today)}/${seq}-${cur ? cur.i + 1 : 1}`);
    const dd = new Date(today.getTime()); dd.setDate(dd.getDate() + 7);
    set('doc_duedate', toISODate(cur && cur.due && cur.due > today ? cur.due : dd));
  }

  // amounts
  const av = round0(c.agreementValueIndex);
  set('doc_av', av);
  set('doc_stage_label', cur ? `Current Due - ${cur.label}` : '');
  set('doc_curpct', cur ? Math.round(cur.pct * 100) / 100 : 0);
  set('doc_curdue', cur ? round0(cur.outstanding || cur.amount) : 0);
  /* Raised to date = everything up to and including this stage. "Received" has to be
     measured over the SAME set of stages: taking the whole ledger instead meant a customer
     who had paid ahead produced a letter demanding a negative amount, because money
     against later stages was being netted off an earlier stage's demand. Each stage is
     also capped at its own value, so an over-payment on one stage cannot mask a shortfall
     on another. */
  const upto = cur ? rows.filter(r => r.i <= cur.i) : rows;
  const uptoDue = round0(upto.reduce((s, r) => s + r.amount, 0));
  const uptoRec = round0(upto.reduce((s, r) => s + Math.min(r.already, r.amount), 0));
  set('doc_totpct', cur ? Math.round(cur.cum * 100) / 100 : 100);
  set('doc_totdue', uptoDue);
  set('doc_totrec', Math.min(uptoRec, uptoDue));
  set('doc_gstpct', prog.gstPct);
  set('doc_gstrec', Math.min(round0(d.AZ), round0(uptoDue * prog.gstPct / 100)));

  // receipt side
  set('doc_rc_towards', cur ? cur.label : 'On account');
  set('doc_rc_amount', cur ? round0(cur.outstanding) : 0);
  set('doc_rc_gst', cur ? round0(cur.outstanding * prog.gstPct / 100) : 0);
  set('doc_rc_refdate', toISODate(today));
  set('doc_rc_drawn', c.bankOrOwn && c.bankOrOwn.toUpperCase() !== 'SELF' ? c.bankOrOwn : '');

  // company / project
  set('doc_co_name', builder.legalName || builder.name || (project ? project.builder : ''));
  set('doc_co_addr', [builder.address, builder.city].filter(Boolean).join(', '));
  set('doc_co_pan', builder.pan || '');
  set('doc_co_gstin', builder.gstin || '');
  set('doc_pr_name', project ? project.name : '');
  set('doc_pr_rera', (project && project.rera) || builder.rera || '');
  set('doc_pr_sub', tower ? `Tower ${tower.name}` : '');
  set('doc_pr_addr', [project ? project.address : '', project ? project.survey : '', project ? project.city : '']
      .filter(Boolean).join(', '));
  const rm = (project && primaryContacts(project)[0]) || ((project && project.contacts) || [])[0] || null;
  set('doc_rm_name', c.assignedTo || (rm ? rm.name : '') || builder.contactPerson || '');
  set('doc_rm_phone', c.assignedPhone || (rm ? rm.phone : '') || builder.phone || '');
  set('doc_rm_email', c.assignedEmail || (rm ? rm.email : '') || builder.email || '');
  set('doc_jur', (project && project.city) || builder.city || 'Pune');

  fillDocAccounts();
}

/* ---- read the form back ---- */
function docForm() {
  const g = id => (document.getElementById(id) || {}).value || '';
  const n = id => { const v = parseFloat(g(id)); return isNaN(v) ? 0 : v; };
  return {
    kind: DOC.kind,
    no: g('doc_no'), date: parseDateInput(g('doc_date')), dueDate: parseDateInput(g('doc_duedate')),
    hsn: g('doc_hsn'),
    av: n('doc_av'), stageLabel: g('doc_stage_label'),
    curPct: n('doc_curpct'), curDue: n('doc_curdue'),
    totPct: n('doc_totpct'), totDue: n('doc_totdue'), totRec: n('doc_totrec'),
    gstPct: n('doc_gstpct'), land: document.getElementById('doc_land').checked,
    gstRec: n('doc_gstrec'),
    rcTowards: g('doc_rc_towards'), rcAmount: n('doc_rc_amount'), rcGst: n('doc_rc_gst'),
    rcMode: g('doc_rc_mode'), rcRef: g('doc_rc_ref'), rcRefDate: parseDateInput(g('doc_rc_refdate')),
    rcDrawn: g('doc_rc_drawn'),
    coName: g('doc_co_name'), coAddr: g('doc_co_addr'), coPan: g('doc_co_pan'), coGstin: g('doc_co_gstin'),
    prName: g('doc_pr_name'), prRera: g('doc_pr_rera'), prSub: g('doc_pr_sub'), prAddr: g('doc_pr_addr'),
    rmName: g('doc_rm_name'), rmPhone: g('doc_rm_phone'), rmEmail: g('doc_rm_email'),
    sign: g('doc_sign'), jur: g('doc_jur'),
    accAv: docAccount(g('doc_acc_av')), accGst: docAccount(g('doc_acc_gst')),
  };
}

/* CGST and SGST are half the GST each. With the standard one-third abatement for the land
   the flat sits on, only two-thirds of the demand is taxable, so the rate written on the
   invoice is one and a half times half the headline rate -- 3.75% each at 5% GST, which is
   exactly what a real letter shows. */
function docGstSplit(f) {
  const taxableRatio = f.land ? 2 / 3 : 1;
  const halfRate = (f.gstPct / 2) / taxableRatio;      // the rate printed against CGST / SGST
  return { taxableRatio, halfRate: Math.round(halfRate * 10000) / 10000 };
}

function accountLine(a) {
  if (!a) return '<span>—</span>';
  return [`Account Name: ${esc(a.label || a.type)}`, a.bank ? `Bank: ${esc(a.bank)}` : '',
          a.branch ? `Branch: ${esc(a.branch)}` : '', a.accountNo ? `A/C No.: ${esc(a.accountNo)}` : '',
          a.ifsc ? `IFSC: ${esc(a.ifsc)}` : ''].filter(Boolean).join(', ');
}

function docCustomerBlock(c) {
  const names = [c.name].concat(coApplicantsOf(c).map(x => x.name).filter(Boolean));
  return `${names.map(n => `<div class="b">${esc(n)}</div>`).join('')}
    ${c.address ? `<div style="margin-top:2mm;">${esc(c.address)}</div>` : ''}
    <div style="margin-top:2mm;"><span class="b">PAN</span> : ${esc(c.pan || '')}</div>
    ${coApplicantsOf(c).filter(x => x.pan).map(x =>
      `<div><span class="b">PAN</span> (${esc(x.name || 'co-applicant')}) : ${esc(x.pan)}</div>`).join('')}
    <div><span class="b">Contact</span> : ${esc(c.contact || '')}</div>`;
}

function renderDemandLetter(x, f) {
  const { c, tower } = x;
  const g = docGstSplit(f);
  const curTax = round0(f.curDue * g.taxableRatio * g.halfRate / 100);
  const totTax = round0(f.totDue * g.taxableRatio * g.halfRate / 100);
  const recTax = round0((f.gstRec || 0) / 2);
  /* A letter never asks for less than nothing. If the overrides say more has come in than
     was raised, the balance is nil and the sheet says so rather than printing a negative
     into a remittance table. */
  const rawAv  = round0(f.totDue - f.totRec);
  const balAv  = Math.max(0, rawAv);
  const balTax = Math.max(0, round0(totTax - recTax));
  const totalDues = balAv + balTax * 2;
  const credit = Math.max(0, -rawAv) + Math.max(0, round0(recTax - totTax)) * 2;
  const d = derived(c);
  const carpetSqmt = d.R;

  return `
  <div class="dl-brand">
    <div class="mark">${esc(f.coName || '')}<small>${esc(String(f.coAddr || '').split(',').slice(-1)[0].trim())}</small></div>
    <div class="proj">${esc(f.prName || '')}<br><span style="font-weight:400;">${esc(f.prSub || '')}</span></div>
  </div>

  <table>
    <tr><td colspan="2" class="dl-title">DEMAND LETTER CUM TAX INVOICE</td></tr>
    <tr><td class="b">Invoice No : ${esc(f.no)}</td><td class="b rt">Invoice Date : ${dmy(f.date)}</td></tr>
  </table>

  <table style="border-top:none;">
    <tr class="hdr"><th style="width:34%">Customer Details</th><th style="width:33%">Company Details</th><th>Project Details</th></tr>
    <tr>
      <td>${docCustomerBlock(c)}
        <div style="margin-top:2mm;"><span class="b">Tower</span> : ${esc(tower ? tower.name : c.wing)}</div>
        <div><span class="b">Unit No</span> : ${esc(c.flat)}</div>
        <div><span class="b">RERA Carpet</span> : ${carpetSqmt} Sq Mt.</div>
      </td>
      <td><div class="b">${esc(f.coName)}</div>
        <div style="margin-top:2mm;">${esc(f.coAddr)}</div>
        <div style="margin-top:2mm;"><span class="b">PAN</span> : ${esc(f.coPan)}</div>
        <div><span class="b">GSTIN</span> : ${esc(f.coGstin)}</div>
      </td>
      <td><div class="b">${esc(f.prName)}</div>
        <div style="margin-top:2mm;">MahaRERA : ${esc(f.prRera)}</div>
        <div>Subproject : ${esc(f.prSub)}</div>
        <div style="margin-top:2mm;">${esc(f.prAddr)}</div>
        <div style="margin-top:2mm;"><span class="b">RM Mobile No:</span> ${esc(f.rmPhone)}</div>
        <div><span class="b">RM E-mail:</span> ${esc(f.rmEmail)}</div>
      </td>
    </tr>
  </table>

  <div class="rt" style="font-size:9pt;margin:1.5mm 0;">(Amount in Rs.)</div>

  <table>
    <tr class="hdr">
      <th style="width:34%">Description</th>
      <th class="rt">Current Due&nbsp; ${Math.round(f.curPct * 100) / 100}%</th>
      <th class="rt">Total Due&nbsp; ${Math.round(f.totPct * 100) / 100}%</th>
      <th class="rt">Total Received</th><th class="rt">Balance</th>
    </tr>
    <tr><td colspan="5">HSN/SAC Code :- ${esc(f.hsn)}</td></tr>
    <tr><td class="b">AGREEMENT VALUE (AV)</td><td></td><td class="rt b">${inr0(f.av)}</td><td></td><td></td></tr>
    <tr>
      <td>${esc(f.stageLabel)}</td>
      <td class="rt">${inr0(f.curDue)}</td><td class="rt">${inr0(f.totDue)}</td>
      <td class="rt">${inr0(f.totRec)}</td><td class="rt">${inr0(balAv)}</td>
    </tr>
    <tr><td>Current CGST ${g.halfRate}%*</td><td class="rt">${inr0(curTax)}</td><td class="rt">${inr0(totTax)}</td>
        <td class="rt">${inr0(recTax)}</td><td class="rt">${inr0(balTax)}</td></tr>
    <tr><td>Current SGST ${g.halfRate}%*</td><td class="rt">${inr0(curTax)}</td><td class="rt">${inr0(totTax)}</td>
        <td class="rt">${inr0(recTax)}</td><td class="rt">${inr0(balTax)}</td></tr>
    <tr><td colspan="4" class="b">Total dues to be paid</td><td class="rt b">${inr0(totalDues)}</td></tr>
    <tr><td colspan="5" class="amt-note b">(Invoice value in words: ${esc(inrWords(totalDues))})</td></tr>
    ${credit ? `<tr><td colspan="5" class="amt-note">Payments of Rs. ${inr0(credit)}/- received in excess of
      this stage are held to your credit and adjusted against the next demand.</td></tr>` : ''}
  </table>

  <table style="margin-top:4mm;">
    <tr><td colspan="3" class="ctr b">PAYMENT DETAILS</td></tr>
    <tr class="hdr"><th style="width:26%">CHARGE TYPES</th><th style="width:16%">AMOUNT IN RS.</th><th>BANK DETAILS</th></tr>
    <tr><td>PART OF AGREEMENT VALUE</td><td class="rt">${inr0(balAv)}</td><td>${accountLine(f.accAv)}</td></tr>
    <tr><td>TAXES</td><td class="rt">${inr0(balTax * 2)}</td><td>${accountLine(f.accGst)}</td></tr>
  </table>

  ${f.land ? `<div class="muted-note">(* CGST and SGST at ${g.halfRate}% has been computed on taxable value of
    Rs. ${inr0(f.curDue * g.taxableRatio)}/- which has been arrived after reducing 1/3rd towards land deduction
    from demand to be raised.)</div>` : ''}

  <div class="pg-break"></div>
  <table><tr><td class="ctr b">TERMS AND CONDITIONS</td></tr></table>
  <div class="foot terms">
    <ol style="padding-left:5mm;">
      <li>Please pay the above mentioned Total Due on or before <b>${longDate(f.dueDate) || longDate(f.date)}</b>.
          Kindly deduct TDS if any &amp; provide a copy of the challan (ignore if already deducted).</li>
      <li>Please mention the name and the unit details behind the cheque. If funds are transferred by RTGS / NEFT,
          please send the transaction details by e-mail on the same day.</li>
      <li>Cheque payment shall be subject to realisation, and the date of realisation will be considered as the
          date of payment.</li>
      <li>If payment is received after the due date, you are liable to pay interest.</li>
      <li>TDS is required to be paid by the purchaser soon after registration of the agreement. TDS is part of the
          agreement value. This clause applies only to units whose agreement value is Rs. 50 lakh and above.</li>
      <li>All applicable government charges and taxes will be charged at the prevailing rates and paid by the
          purchaser from time to time. Tax is not payable on a reverse charge basis.</li>
      <li>For any clarification on this demand, please call ${esc(f.rmPhone)} on any working day,
          or e-mail ${esc(f.rmEmail)}.</li>
      <li>Disputes, if any, subject to ${esc(f.jur || 'Pune')} jurisdiction.</li>
    </ol>
    <div class="sig">E. &amp; O. E. Thanking you,<br>Yours Sincerely,<br>
      <b>For ${esc(f.coName)}</b><br><br><br>${esc(f.sign)}</div>
  </div>`;
}

function renderReceipt(x, f) {
  const { c, tower } = x;
  const total = round0(f.rcAmount + f.rcGst);
  const d = derived(c);
  /* Once this receipt has been written into Collections the ledger already carries it, so
     adding it again here would show the customer a balance short by the amount they just
     paid. */
  const inLedger = DOC.logged.has(f.no);
  const recAfter = round0(d.AL + (inLedger ? 0 : f.rcAmount));
  return `
  <div class="dl-brand">
    <div class="mark">${esc(f.coName || '')}<small>${esc(String(f.coAddr || '').split(',').slice(-1)[0].trim())}</small></div>
    <div class="proj">${esc(f.prName || '')}<br><span style="font-weight:400;">${esc(f.prSub || '')}</span></div>
  </div>

  <table>
    <tr><td colspan="2" class="dl-title">PAYMENT RECEIPT</td></tr>
    <tr><td class="b">Receipt No : ${esc(f.no)}</td><td class="b rt">Receipt Date : ${dmy(f.date)}</td></tr>
  </table>

  <table style="border-top:none;">
    <tr class="hdr"><th style="width:50%">Received from</th><th>Unit</th></tr>
    <tr>
      <td>${docCustomerBlock(c)}</td>
      <td><div><span class="b">Project</span> : ${esc(f.prName)}</div>
        <div><span class="b">Tower / wing</span> : ${esc(tower ? tower.name : c.wing)}</div>
        <div><span class="b">Unit No</span> : ${esc(c.flat)}</div>
        <div><span class="b">Type</span> : ${esc(c.type || '')}</div>
        <div><span class="b">Client no.</span> : ${esc(c.psNo || '')}</div>
        <div style="margin-top:2mm;">MahaRERA : ${esc(f.prRera)}</div>
      </td>
    </tr>
  </table>

  <table style="margin-top:4mm;">
    <tr class="hdr"><th>Particulars</th><th class="rt" style="width:26%">Amount in Rs.</th></tr>
    <tr><td>Towards: ${esc(f.rcTowards)}</td><td class="rt">${inr0(f.rcAmount)}</td></tr>
    <tr><td>GST @ ${f.gstPct}%</td><td class="rt">${inr0(f.rcGst)}</td></tr>
    <tr><td class="b">Total received</td><td class="rt b rc-big">${inr0(total)}</td></tr>
    <tr><td colspan="2" class="amt-note b">(Amount in words: ${esc(inrWords(total))})</td></tr>
  </table>

  <table style="margin-top:4mm;">
    <tr class="hdr"><th colspan="4">How it was paid</th></tr>
    <tr><td class="b" style="width:22%">Mode</td><td style="width:28%">${esc(f.rcMode)}</td>
        <td class="b" style="width:22%">Instrument / UTR</td><td>${esc(f.rcRef)}</td></tr>
    <tr><td class="b">Instrument date</td><td>${dmy(f.rcRefDate)}</td>
        <td class="b">Drawn on</td><td>${esc(f.rcDrawn)}</td></tr>
    <tr><td class="b">Credited to</td><td colspan="3">${accountLine(f.accAv)}</td></tr>
  </table>

  <table style="margin-top:4mm;">
    <tr class="hdr"><th colspan="2">Where this leaves the account</th></tr>
    <tr><td style="width:60%">Agreement value</td><td class="rt">${inr0(f.av)}</td></tr>
    <tr><td>Received to date, including this receipt</td><td class="rt">${inr0(recAfter)}</td></tr>
    <tr><td class="b">Balance on agreement value</td><td class="rt b">${inr0(Math.max(0, f.av - recAfter))}</td></tr>
  </table>

  <div class="foot">
    <div class="muted-note">Cheque and instrument payments are subject to realisation. This receipt is valid
      only on realisation of the instrument named above.</div>
    <div class="sig">For <b>${esc(f.coName)}</b><br><br><br>${esc(f.sign)}</div>
    <div class="muted-note" style="margin-top:6mm;">Any query: ${esc(f.rmName)} &middot; ${esc(f.rmPhone)}
      &middot; ${esc(f.rmEmail)}</div>
  </div>`;
}

function renderDocPaper() {
  const paper = document.getElementById('doc-paper');
  const x = docContext();
  if (!paper) return;
  if (!x) { paper.innerHTML = `<div style="padding:20mm;text-align:center;">Pick a customer to build a document.</div>`;
            document.getElementById('doc-status').textContent = ''; return; }
  const f = docForm();
  paper.innerHTML = f.kind === 'receipt' ? renderReceipt(x, f) : renderDemandLetter(x, f);
  const bal = round0(f.totDue - f.totRec);
  const el = document.getElementById('doc_calc_bal');
  if (el) el.textContent = fmtINR(bal);
  const hint = document.getElementById('doc-gst-hint');
  if (hint) {
    const g = docGstSplit(f);
    hint.textContent = `CGST and SGST print at ${g.halfRate}% each` +
      (f.land ? `, on two-thirds of the demand` : `, on the whole demand`) + `, which comes to ${f.gstPct}% overall.`;
  }
  document.getElementById('doc-status').textContent =
    `${x.c.name} · ${f.kind === 'receipt' ? 'receipt' : 'demand letter'} ${f.no}` +
    (f.kind === 'receipt' && DOC.logged.has(f.no) ? ' · in the ledger' : '');
  const logBtn = document.getElementById('btn-doc-log');
  if (logBtn) logBtn.disabled = DOC.logged.has(f.no);
}

function renderDocs() {
  const note = document.getElementById('doc-ctx-note');
  if (note) note.textContent = ctxLabel();
  const list = fillDocCustomers();
  const isReceipt = DOC.kind === 'receipt';
  document.getElementById('doc-amounts-demand').style.display = isReceipt ? 'none' : '';
  document.getElementById('doc-amounts-receipt').style.display = isReceipt ? '' : 'none';
  document.getElementById('doc_duedate_wrap').style.display = isReceipt ? 'none' : '';
  document.getElementById('doc_no_label').textContent = isReceipt ? 'Receipt no.' : 'Invoice no.';
  document.getElementById('doc_date_label').textContent = isReceipt ? 'Receipt date' : 'Invoice date';
  if (!list.length) { document.getElementById('doc-paper').innerHTML =
      `<div style="padding:20mm;text-align:center;">No units in this selection.</div>`; return; }
  fillDocDemands();
  docFillDefaults();
  renderDocPaper();
}

/* ---- getting it out of the building ---- */
function docStyles() {
  // the sheet's own rules, lifted out of the stylesheet so the exported file stands alone
  return [...document.styleSheets].flatMap(ss => { try { return [...ss.cssRules]; } catch (e) { return []; } })
    .filter(r => r.selectorText && /\.a4/.test(r.selectorText))
    .map(r => r.cssText).join('\n');
}
function docFileName(ext) {
  const x = docContext(); const f = docForm();
  const base = `${f.kind === 'receipt' ? 'Receipt' : 'Demand_Letter'}_${
    (x ? x.c.flat : '').toString().replace(/[^A-Za-z0-9]+/g, '') || 'unit'}_${
    String(f.no).replace(/[^A-Za-z0-9]+/g, '_')}`;
  return `${base}.${ext}`;
}
function docPrint() {
  const paper = document.getElementById('doc-paper');
  const host = document.getElementById('print-host');
  if (!paper || !host) return;
  host.innerHTML = `<div class="a4">${paper.innerHTML}</div>`;
  const done = () => { host.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}
function docWord() {
  const paper = document.getElementById('doc-paper');
  if (!paper) return;
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"><title>${esc(docForm().no)}</title>
    <style>@page { size:A4; margin:12mm; } body { font-family:'Times New Roman',Times,serif; font-size:10.5pt; }
    ${docStyles()}
    .a4 { width:auto; min-height:0; padding:0; box-shadow:none; }</style></head>
    <body><div class="a4">${paper.innerHTML}</div></body></html>`;
  downloadBlob(new Blob(['﻿', html], { type: 'application/msword' }), docFileName('doc'));
}
