/* ================= Action Items engine =================
   The happy path this models: a demand of, say, Rs 5,00,000 is not one payment.
   The customer settles their own share (whatever is not covered by the loan) and the
   bank disburses the rest: and the bank takes time. So every open demand is split into
   a customer-side chase and a bank-side chase, and the bank side has to be started
   EARLY by however long that particular bank actually takes.
*/
let ACT = { horizon: cfg('horizonDays'), type: 'all', bank: 'all', q: '' };

function bankOf(c) {
  const b = (c && c.bankOrOwn ? String(c.bankOrOwn) : '').trim();
  return b ? b.toUpperCase() : 'OWN FUNDS';
}
function isBankFunded(c) {
  return bankOf(c) !== 'OWN FUNDS' && ((c.loanAmount || 0) > 0 || (c.loanExpected || 0) > 0);
}
function progOf(c) { return fundingProgress(toCalcCustomer(c), STATE.collections); }

/* Agreement value still open across this customer's whole schedule. This is the
   denominator the bank's share of any one demand is measured against -- NOT
   (own + bank pending), which also carries stamp duty, registration and GST. */
function avOpenFor(c) {
  const l = towerOf(c);
  const sched = l.tower ? l.tower.schedule : [];
  if (!sched.length) return 0;
  const amounts = derived(c).milestoneAmounts;
  const paid = STATE.milestonePaid[c.name] || {};
  let open = 0;
  sched.forEach((m, i) => {
    const p = paid[m.id], amt = amounts[i];
    if (!(p && p.amount >= amt - 1)) open += Math.max(0, amt - (p ? p.amount : 0));
  });
  return open;
}
// share of each remaining demand the bank funds -- from live balances, so it self-corrects
function loanPctFor(c) { return bankShareRatio(progOf(c), avOpenFor(c)); }
function disbursedSoFar(name) {
  return STATE.collections.reduce((a, e) =>
    (e.customer === name && e.source === 'Bank') ? a + (e.flatCost || 0) : a, 0);
}
// own money in, on the same three-way basis fundingProgress uses -- an unmarked receipt
// is NOT own funds, and GST rides with the payment it came in on
function ownPaidSoFar(name) {
  return STATE.collections.reduce((a, e) => {
    if (e.customer !== name) return a;
    if (e.source === 'Own') return a + (e.flatCost || 0) + (e.gst || 0);
    if (e.source === 'Bank') return a + (e.gst || 0);   // no bank funds GST
    return a;
  }, 0);
}
function loanHeadroom(c) { return Math.max(0, (c.loanAmount || 0) - disbursedSoFar(c.name)); }

/* ---------- learn each bank's real disbursement turnaround ---------- */
/* Comparing a due date at local midnight against `new Date()` made a demand due TODAY
   flip from "due soon" to "overdue" at noon, because daysBetween rounds. Both sides are
   normalised to the start of their day so a day is a day. */
function startOfDay(d) {
  const x = asDateSafe(d); if (!x) return null;
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}
function daysOverdue(due) {
  const a = startOfDay(due), b = startOfDay(new Date());
  if (!a) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

const AMOUNT_BANDS = [
  { label: 'under ₹5L',  lo: 0,        hi: 500000 },
  { label: '₹5L – ₹15L', lo: 500000,   hi: 1500000 },
  { label: 'over ₹15L',  lo: 1500000,  hi: Infinity },
];
function bankLagStats() {
  const by = {};
  STATE.collections.forEach(e => {
    const lag = bankLagOf(e);
    if (lag == null) return;
    const c = STATE.customers.find(x => x.name === e.customer);
    if (!c) return;
    const b = bankOf(c);
    (by[b] = by[b] || []).push({ lag, amount: e.flatCost || 0 });
  });
  const out = {};
  Object.keys(by).forEach(b => {
    const arr = by[b];
    const lags = arr.map(x => x.lag).sort((a, z) => a - z);
    // nearest-rank: the p-th percentile is the ceil(p*n)-th smallest. The old
    // floor(p*n) was one order statistic high whenever p*n landed on an integer, which
    // turned p75 into the maximum on any 4-case history and made "median" not the median.
    const q = (p) => lags[Math.min(lags.length - 1, Math.max(0, Math.ceil(lags.length * p) - 1))];
    const avg = lags.reduce((a, z) => a + z, 0) / lags.length;
    const bands = AMOUNT_BANDS.map(bd => {
      const sel = arr.filter(x => x.amount >= bd.lo && x.amount < bd.hi);
      return { label: bd.label, n: sel.length,
               avg: sel.length ? Math.round(sel.reduce((a, x) => a + x.lag, 0) / sel.length) : null };
    });
    // recommend the 75th percentile so three out of four demands land on time, floor of 7 days
    const pctile = cfg('bankLeadPercentile') / 100;
    out[b] = { n: lags.length, avg: Math.round(avg), median: q(0.5), p75: q(pctile),
               min: lags[0], max: lags[lags.length - 1],
               lead: Math.max(cfg('bankLeadFloor'), q(pctile)), bands,
               confidence: lags.length >= 8 ? 'good' : lags.length >= 3 ? 'fair' : 'thin' };
  });
  return out;
}
function leadDaysFor(bank, stats) { return stats[bank] ? stats[bank].lead : null; }

/* ---------- every open demand, split customer-side vs bank-side ---------- */
function buildActionQueue() {
  const today = new Date();
  const stats = bankLagStats();
  const out = [];
  visibleCustomers().forEach(c => {
    const l = towerOf(c);
    const sched = l.tower ? l.tower.schedule : [];
    if (!sched.length) return;
    const cum = scheduleCumPct(sched);
    const paid = STATE.milestonePaid[c.name] || {};
    const d = derived(c);
    const prog = progOf(c);
    const gstRate = prog.gstPct / 100;
    const bank = bankOf(c);
    const lead = leadDaysFor(bank, stats);
    let bankLeft = prog.bankPending, ownLeft = prog.ownPending;
    const avOpen = avOpenFor(c);
    sched.forEach((m, i) => {
      const due = stageDueDate(m, c.bookingDate, c.possessionDate, cum[i]);
      if (!due) return;
      const amountDue = d.milestoneAmounts[i];
      const p = paid[m.id] || null;
      const payment = p ? { amount: p.amount, date: parseDateInput(p.date) } : null;
      const status = milestoneStatus(due, payment, amountDue, today);
      if (status === 'Paid') return;
      const outstanding = Math.max(0, amountDue - (p ? p.amount : 0));
      if (outstanding <= 1) return;
      // the bank only funds its slice of the remaining AGREEMENT VALUE; GST always rides
      // on the customer. avOpen is precomputed for this customer, so the split stays flat
      // across the schedule instead of drifting stage by stage.
      const ratio = avOpen > 0 ? Math.max(0, Math.min(1, prog.bankPending / avOpen)) : 0;
      const bankShare = Math.min(round0(outstanding * ratio), bankLeft);
      const gstOnDemand = round0(outstanding * gstRate);
      const ownShare = (outstanding - bankShare) + gstOnDemand;
      bankLeft = Math.max(0, bankLeft - bankShare);
      const daysToDue = daysBetween(startOfDay(today), startOfDay(due));
      const chaseBy = (lead != null && bankShare > 0) ? new Date(due.getTime() - lead * 86400000) : null;
      let type;
      if (daysToDue < 0) type = 'overdue';
      else if (chaseBy && chaseBy <= today) type = 'chase-bank';
      else if (daysToDue <= ACT.horizon) type = 'due-soon';
      else return;
      out.push({
        customer: c.name, customerId: c.id, psNo: c.psNo || '', milestoneId: m.id,
        assignedTo: c.assignedTo || '', assignedPhone: c.assignedPhone || '', assignedEmail: c.assignedEmail || '',
        project: l.project ? l.project.name : '', tower: l.tower ? l.tower.name : '', flat: c.flat,
        milestone: m.label, pct: m.pct, due, daysToDue,
        amountDue, alreadyPaid: p ? p.amount : 0, outstanding,
        ownShare, bankShare, gstOnDemand, bank, lead, chaseBy, type, status,
        contact: c.contact || '', headroomLeft: bankLeft,
        partial: status === 'Partially Paid',
        provisional: prog.provisional, noLoan: prog.noLoan && bankOf(c) !== 'OWN FUNDS',
      });
    });
  });
  const rank = { overdue: 0, 'chase-bank': 1, 'due-soon': 2 };
  return out.sort((a, b) => (rank[a.type] - rank[b.type]) || (a.due - b.due) || (b.outstanding - a.outstanding));
}

/* ---------- bank-wise collection groups ---------- */
function bankGroups(queue) {
  const stats = bankLagStats();
  const g = {};
  visibleCustomers().forEach(c => {
    const b = bankOf(c);
    if (!g[b]) g[b] = { bank: b, units: 0, sanctioned: 0, disbursed: 0, headroom: 0, provisional: 0,
                        pendingBank: 0, pendingOwn: 0, items: 0, overdue: 0, stats: stats[b] || null };
    g[b].units++;
    const pr = progOf(c);
    g[b].sanctioned += pr.loan;
    g[b].disbursed += pr.bankDisbursed;
    g[b].headroom += pr.bankPending;
    if (pr.provisional) g[b].provisional++;
  });
  queue.forEach(q => {
    const e = g[q.bank];
    if (!e) return;
    e.items++;
    e.pendingBank += q.bankShare;
    e.pendingOwn += q.ownShare;
    if (q.type === 'overdue') e.overdue++;
  });
  return Object.values(g).sort((a, b) => b.pendingBank - a.pendingBank || b.sanctioned - a.sanctioned);
}

/* ---------- incomplete data ---------- */
/* ---------- data-completeness rules ----------
   Declarative, not a hardcoded if-chain: each rule carries an id, a default severity and
   message, and a predicate. Whether a rule is on, how serious it is and what it says are
   all overridable from Settings and saved into the workbook. A rule's test returns falsy
   for "no problem", or true / a token object used to fill {placeholders} in the message.
*/
const GAP_RULES = [
  { id:'psNo',           sev:'warn', msg:'No PS client number',
    hint:'Your own reference for this customer. Onboarding assigns the next one automatically.',
    test:(c) => !c.psNo },
  { id:'psNoFormat',     sev:'warn', msg:'Client number {no} is not in the {fmt} format',
    hint:'Numbers issued by hand can drift from the standard shape.',
    test:(c) => (c.psNo && !psIsValid(c.psNo))
                ? { no: c.psNo, fmt: cfg('psPrefix') + '+' + cfg('psDigits') + ' digits' } : false },
  { id:'psNoDuplicate',  sev:'crit', msg:'Client number {no} is also on {other}',
    hint:'Two customers sharing a reference makes receipts ambiguous.',
    test:(c) => { if (!c.psNo) return false;
                  const o = STATE.customers.find(x => x !== c && (x.psNo||'').toUpperCase() === String(c.psNo).toUpperCase());
                  return o ? { no: c.psNo, other: o.name } : false; } },
  { id:'project',        sev:'crit', msg:'No project assigned',
    hint:'Without a project the unit cannot be grouped or reported on.',
    test:(c,x) => !x.link.project },
  { id:'tower',          sev:'crit', msg:'No tower assigned',
    hint:'The payment schedule lives on the tower, so nothing can be billed without one.',
    test:(c,x) => x.link.project && !x.link.tower },
  { id:'schedule',       sev:'crit', msg:'Tower has no payment schedule',
    hint:'No stages means no demands can be raised.',
    test:(c,x) => x.link.tower && !x.link.tower.schedule.length },
  { id:'schedulePct',    sev:'warn', msg:'Tower schedule adds up to {pct}%, not 100%',
    hint:'The stage percentages should total 100% of the agreement value.',
    test:(c,x) => { if (!x.link.tower || !x.link.tower.schedule.length) return false;
                    const t = scheduleTotalPct(x.link.tower.schedule);
                    return Math.abs(t - 100) > 0.05 ? { pct: t } : false; } },
  { id:'agreementValue', sev:'crit', msg:'Agreement value missing',
    hint:'Every milestone amount is a percentage of this figure.',
    test:(c) => !c.agreementValueIndex },
  { id:'bookingDate',    sev:'crit', msg:'Booking date missing: no due dates can be worked out',
    hint:'Only needed for stages that have no date of their own.',
    test:(c) => !c.bookingDate },
  { id:'possessionDate', sev:'crit', msg:'Possession date missing: no due dates can be worked out',
    hint:'Only needed for stages that have no date of their own.',
    test:(c) => !c.possessionDate },
  { id:'flat',           sev:'crit', msg:'Flat number missing',
    hint:'Used to identify the unit on receipts and demands.',
    test:(c) => !c.flat },
  { id:'contact',        sev:'warn', msg:'No contact number',
    hint:'You cannot chase a customer you cannot call.',
    test:(c) => !c.contact },
  { id:'pan',            sev:'warn', msg:'PAN not on file',
    hint:'Needed for TDS deduction and the bank file.',
    test:(c) => !c.pan },
  { id:'aadhar',         sev:'warn', msg:'Aadhar not on file', on:false,
    hint:'Off by default: switch on if your lenders insist on it.',
    test:(c) => !c.aadhar },
  { id:'email',          sev:'warn', msg:'Email not on file', on:false,
    hint:'Off by default: switch on if you send demand letters by email.',
    test:(c) => !c.email },
  { id:'agreementDate',  sev:'warn', msg:'Agreement date missing',
    hint:'Registration and stamp duty hang off this date.',
    test:(c) => !c.agreementDate },
  { id:'bankSet',        sev:'warn', msg:'Bank / own funds not set',
    hint:'Decides whether this unit has a bank side to chase at all.',
    test:(c) => !c.bankOrOwn },
  { id:'noLoan',         sev:'crit', msg:'Loan neither expected nor sanctioned: the split cannot be worked out',
    hint:'Without a loan figure the own-contribution split is unknown.',
    test:(c,x) => x.hasBank && x.pr.noLoan },
  { id:'provisional',    sev:'warn', msg:'Sanction awaited: figures are provisional',
    hint:'Fires from onboarding until the sanction letter is entered.',
    test:(c,x) => x.hasBank && x.pr.provisional },
  { id:'shortfall',      sev:'crit', msg:'Sanctioned {amount} below expectation: customer must fund the gap',
    hint:'The bank approved less than was expected at onboarding.',
    test:(c,x) => x.hasBank && x.pr.shortfall > 0 ? { amount: fmtINR(x.pr.shortfall) } : false },
  { id:'fileNo',         sev:'warn', msg:'Loan file number missing',
    hint:'Needed to follow up a disbursement with the bank.',
    test:(c,x) => x.hasBank && !c.fileNo },
  { id:'bankersNo',      sev:'warn', msg:"Banker's contact number missing",
    hint:'Needed to chase the disbursement.',
    test:(c,x) => x.hasBank && !c.bankersNo },
  { id:'notApplied',     sev:'warn', msg:'Bank named but loan not applied for',
    hint:'The loan is sitting idle before the process has started.',
    test:(c,x) => x.hasBank && c.dlStatus === 'NOT STARTED' },
  { id:'unclassified',   sev:'warn', msg:'{amount} of receipts not marked own funds or bank',
    hint:'Unmarked receipts break the own-contribution ledger and the bank lead-time learning.',
    test:(c,x) => x.pr.unclassified > 0 ? { amount: fmtINR(x.pr.unclassified) } : false },
  { id:'loanCoversAll',  sev:'warn', msg:'Loan covers the entire cost: check the figures',
    hint:'No bank funds stamp duty and registration, so this usually means a wrong number.',
    test:(c,x) => x.pr.totalCost > 0 && x.pr.ownRequired <= 0 },
  { id:'duplicateName',  sev:'crit', msg:'Another unit is filed under this exact name: the two share one ledger',
    hint:'Receipts and milestones are matched to a customer by name. Two rows with the same name means one customer\'s payments show against both.',
    test:(c) => STATE.customers.filter(x => String(x.name||'').trim().toLowerCase() === String(c.name||'').trim().toLowerCase()).length > 1 },
  { id:'negativeValue',  sev:'crit', msg:'Agreement value is not a positive figure',
    hint:'Every demand, percentage and balance is a share of it: a zero or negative value makes the whole file meaningless.',
    test:(c) => !(num(c.agreementValueIndex, 0) > 0) },
  { id:'paidNoDate',     sev:'warn', msg:'{n} recorded payment(s) have no date',
    hint:'The money counts either way, but punctuality cannot be scored without a date, so the reliability rating ignores them.',
    test:(c) => { const p = STATE.milestonePaid[c.name] || {};
                  const n = Object.values(p).filter(x => x && (x.amount||0) > 0 && !x.date).length;
                  return n ? { n } : false; } },
  { id:'disbursedNoLoan', sev:'crit', msg:'{amount} disbursed by the bank but no sanctioned amount on file',
    hint:'The money has arrived, so the loan exists: enter the sanctioned figure or every split on this file is guesswork.',
    test:(c,x) => x.pr.undocumentedDisbursement > 0 ? { amount: fmtINR(x.pr.undocumentedDisbursement) } : false },
  { id:'bankGstRow',     sev:'warn', msg:'{amount} of GST is logged on a bank receipt',
    hint:'No bank funds GST. Credited to the customer\'s own contribution, but it is worth re-tagging the row as own funds.',
    test:(c,x) => x.pr.bankGst > 0 ? { amount: fmtINR(x.pr.bankGst) } : false },
  { id:'excessSanction', sev:'warn', msg:'Sanction exceeds the total cost by {amount}',
    hint:'The bank has approved more than the flat costs: the excess has to be trimmed or it comes back as a repayment.',
    test:(c,x) => x.pr.excessSanction > 0 ? { amount: fmtINR(x.pr.excessSanction) } : false },
  { id:'overPaid',       sev:'warn', msg:'{amount} received above the total cost',
    hint:'Either a figure is wrong or there is a refund due. Worth reconciling before the next demand.',
    test:(c,x) => x.pr.overPaid > 0 ? { amount: fmtINR(x.pr.overPaid) } : false },
  { id:'unassigned',     sev:'warn', msg:'Nobody is assigned to collect on this file',
    hint:'Off by default. Switch it on once you are allocating units to collection partners.',
    on:false,
    test:(c) => !String(c.assignedTo || '').trim() },
  { id:'bankOffPanel',   sev:'warn', msg:'Lender "{bank}" is not on the panel list',
    hint:'A lender typed outside the master list splits bank-wise grouping and lead-time learning in two. Add it under the gear icon.',
    test:(c) => { const b = String(c.bankOrOwn || '').trim().toUpperCase();
                  return (b && bankList().indexOf(b) < 0) ? { bank: b } : false; } },
  { id:'loanExpectMissing', sev:'warn', msg:'No idea what loan the customer is expecting',
    hint:'Ask at onboarding: it is what you check the sanction against, and it sets their own-contribution expectation.',
    test:(c,x) => x.hasBank && !c.loanExpectedMax && !num(c.loanExpected, 0) && !num(c.loanAmount, 0) },
];
const GAP_RULE_BY_ID = Object.fromEntries(GAP_RULES.map(r => [r.id, r]));

/* ---------- how each gap gets closed ----------
   A check that only tells you something is missing is half a tool. Every rule here names
   the one field that fixes it, so the gap can be closed on the spot instead of hunting
   through the full record. Rules that need judgement (a rename, a receipt to re-tag, a
   tower schedule to build) point at the right screen instead of pretending to be a
   one-field fix. */
const GAP_FIX = {
  psNo:            { psno:true, label:'Client number' },
  psNoFormat:      { goto:'record', field:'psNo', label:'Correct it in the full record' },
  psNoDuplicate:   { goto:'record', field:'psNo', label:'Correct it in the full record' },
  project:         { field:'projectId', type:'project', label:'Project' },
  tower:           { field:'towerId',   type:'tower',   label:'Tower / wing' },
  schedule:        { goto:'tower',      label:'Build the schedule' },
  schedulePct:     { goto:'tower',      label:'Fix the percentages' },
  agreementValue:  { field:'agreementValueIndex', type:'num', label:'Agreement value' },
  negativeValue:   { field:'agreementValueIndex', type:'num', label:'Agreement value' },
  bookingDate:     { field:'bookingDate',    type:'date', label:'Booking date' },
  possessionDate:  { field:'possessionDate', type:'date', label:'Possession date' },
  agreementDate:   { field:'agreementDate',  type:'date', label:'Agreement date' },
  flat:            { field:'flat',      type:'text', label:'Flat number' },
  contact:         { field:'contact',   type:'text', label:'Contact number' },
  email:           { field:'email',     type:'text', label:'Email' },
  pan:             { field:'pan',       type:'text', label:'PAN' },
  aadhar:          { field:'aadhar',    type:'text', label:'Aadhar' },
  bankSet:         { field:'bankOrOwn', type:'bank', label:'Lender' },
  bankOffPanel:    { field:'bankOrOwn', type:'bank', label:'Lender' },
  noLoan:          { field:'loanAmount', type:'num', label:'Sanctioned loan' },
  provisional:     { field:'loanAmount', type:'num', label:'Sanctioned loan' },
  shortfall:       { field:'loanAmount', type:'num', label:'Sanctioned loan' },
  disbursedNoLoan: { field:'loanAmount', type:'num', label:'Sanctioned loan' },
  excessSanction:  { field:'loanAmount', type:'num', label:'Sanctioned loan' },
  loanCoversAll:   { field:'loanAmount', type:'num', label:'Sanctioned loan' },
  loanExpectMissing:{ field:'loanExpected', type:'num', label:'Loan expected' },
  fileNo:          { field:'fileNo',    type:'text', label:'Loan file number' },
  bankersNo:       { field:'bankersNo', type:'text', label:'Banker\u2019s number' },
  notApplied:      { field:'dlStatus',  type:'dlstatus', label:'Loan status' },
  unassigned:      { field:'assignedTo', type:'text', label:'Assigned to' },
  unclassified:    { goto:'collections', label:'Tag those receipts' },
  bankGstRow:      { goto:'collections', label:'Re-tag that receipt' },
  overPaid:        { goto:'collections', label:'Check the receipts' },
  paidNoDate:      { goto:'timeline',    label:'Add the payment dates' },
  duplicateName:   { goto:'record', field:'name', label:'Rename in the full record' },
};

// resolved settings for a rule: defaults, then whatever Settings overrides
function gapSetting(rule) {
  const o = (CONFIG.gaps && CONFIG.gaps[rule.id]) || {};
  return {
    on:  o.on  != null ? !!o.on : (rule.on !== false),
    sev: o.sev || rule.sev,
    msg: o.msg || rule.msg,
  };
}
function fillTokens(msg, tokens) {
  if (!tokens || tokens === true) return msg;
  return msg.replace(/\{(\w+)\}/g, (m, k) => (tokens[k] != null ? tokens[k] : m));
}

function dataGaps(c) {
  const ctx = { link: towerOf(c), pr: progOf(c) };
  ctx.hasBank = bankOf(c) !== 'OWN FUNDS';
  const out = [];
  GAP_RULES.forEach(rule => {
    const set = gapSetting(rule);
    if (!set.on) return;
    let hit;
    try { hit = rule.test(c, ctx); } catch (e) { hit = false; }
    if (!hit) return;
    out.push({ id: rule.id, sev: set.sev, t: fillTokens(set.msg, hit) });
  });
  return out;
}

function gapReport() {
  return visibleCustomers().map(c => ({ c, gaps: dataGaps(c) }))
    .filter(r => r.gaps.some(x => x.sev !== 'info'))
    .sort((a, b) => {
      const s = r => r.gaps.filter(x => x.sev === 'crit').length * 10 + r.gaps.length;
      return s(b) - s(a);
    });
}

/* ---------- OCR tracker ---------- */
/* Report rows for the OCR tiles. Built from ocrReport itself rather than re-derived, so a
   tile and the drawer it opens can never disagree: same rows, same arithmetic, one source. */
function ocrReportRows() {
  const o = ocrReport(buildActionQueue());
  return o.rows.map(r => {
    const l = towerOf(r.c);
    return {
      id: r.c.id, psNo: r.c.psNo || '', name: r.c.name,
      project: l.project ? l.project.name : '', tower: l.tower ? l.tower.name : '', flat: r.c.flat || '',
      totalCost: r.pr.totalCost, loan: r.pr.loan,
      ownReq: r.amt, ownPaid: r.paid, ownPending: r.pending,
      soon: r.soon, nonLoanable: r.pr.nonLoanable,
    };
  });
}
const OCR_COLS = () => [...WHO, money('totalCost','Total cost'), money('loan','Loan'),
  money('ownReq','Own contribution'), money('ownPaid','Received'),
  money('ownPending','Still to arrange'), money('soon','Needed soon'),
  money('nonLoanable','Never loanable')];

/* ---------- own contribution (OCR) ledger, plus what falls inside the horizon ---------- */
function ocrReport(queue) {
  const today = new Date();
  const horizonEnd = new Date(today.getTime() + ACT.horizon * 86400000);
  const rows = visibleCustomers().map(c => {
    const pr = progOf(c);
    // own money needed for demands landing inside the horizon -- the balloon early-warning
    const soon = (queue || []).filter(q => q.customer === c.name && q.due <= horizonEnd)
                              .reduce((a, q) => a + q.ownShare, 0);
    return { c, pr, amt: pr.ownRequired, paid: pr.ownPaid, pending: pr.ownPending, soon,
             state: pr.ownRequired <= 0 ? 'notset'
                  : pr.ownPending <= 1 ? 'done'
                  : pr.ownPaid > 0 ? 'part' : 'pending' };
  });
  return {
    rows: rows.sort((a, b) => b.soon - a.soon || b.pending - a.pending),
    total: rows.reduce((a, r) => a + r.amt, 0),
    collected: rows.reduce((a, r) => a + r.paid, 0),
    pending: rows.reduce((a, r) => a + r.pending, 0),
    soon: rows.reduce((a, r) => a + r.soon, 0),
    nonLoanable: rows.reduce((a, r) => a + r.pr.nonLoanable, 0),
    provisional: rows.filter(r => r.pr.provisional).length,
    done: rows.filter(r => r.state === 'done').length,
  };
}
