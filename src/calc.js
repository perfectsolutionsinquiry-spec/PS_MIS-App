/* ================= Shared calc engine =================
   Pure functions mirroring every formula column in the MIS workbook.
   Used both by the Node verification prototype (module.exports) and inlined
   verbatim into the browser tool (same source, two runtimes).
*/

// Structural limits requested for a single builder file.
const MAX_PROJECTS = 10;
const MAX_TOWERS_PER_PROJECT = 30;

// Seed schedule offered when a new tower is created (standard Maharashtra
// construction-linked demand schedule). Each TOWER owns its own copy from then
// on, because towers in the same project can be delivered on different timelines.
const DEFAULT_SCHEDULE = [
  { id: 'm1',  label: 'On or before Agreement',        pct: 0.10 },
  { id: 'm2',  label: 'Initiation of Excavation',      pct: 0.10 },
  { id: 'm3',  label: 'Plinth',                        pct: 0.15 },
  { id: 'm4',  label: '1st Slab',                      pct: 0.10 },
  { id: 'm5',  label: '3rd Slab',                      pct: 0.10 },
  { id: 'm6',  label: '5th Slab',                      pct: 0.10 },
  { id: 'm7',  label: '7th Slab',                      pct: 0.10 },
  { id: 'm8',  label: 'Brickwork / Internal Plaster',  pct: 0.10 },
  { id: 'm9',  label: 'Electrical & Flooring work',    pct: 0.10 },
  { id: 'm10', label: 'Possession',                    pct: 0.05 },
];

function round0(x) { return Math.round((x || 0) + Number.EPSILON); }
function round2(x) { return Math.round(((x || 0) + Number.EPSILON) * 100) / 100; }

function scheduleCumPct(schedule) {
  let running = 0;
  return (schedule || []).map(m => { running += (m.pct || 0) * 100; return Math.round(running * 100) / 100; });
}
function scheduleTotalPct(schedule) {
  return Math.round((schedule || []).reduce((s, m) => s + (m.pct || 0), 0) * 1000) / 10;
}
/* Rounding each stage independently left the schedule a rupee or two off the agreement
   value -- so the demands never quite tied back to the contract. The last stage now
   carries the residual, which is how a builder's own sheet does it. */
function milestoneAmountsFor(schedule, agreementValue) {
  const sch = schedule || [], AV = agreementValue || 0;
  const amts = sch.map(m => round0(AV * (m.pct || 0)));
  if (!amts.length) return amts;
  const totalPct = sch.reduce((a, m) => a + (m.pct || 0), 0);
  // only balance to AV when the plan actually claims to cover 100% of it
  if (Math.abs(totalPct - 1) < 0.0005) {
    const drift = round0(AV) - amts.reduce((a, b) => a + b, 0);
    amts[amts.length - 1] = round0(amts[amts.length - 1] + drift);
  }
  return amts;
}

/* ---- Collection MIS NEW: derive every formula column from a customer record `c`,
   the recovery-sheet aggregate for that customer, and their tower's schedule. ---- */
/* GST is 5% on under-construction property but 1% on affordable housing, and some
   builders quote a flat figure. One definition, used by BOTH the customer sheet and the
   cost-of-flat panel -- they used to disagree, the sheet hardcoding 5%. */
function gstRateOf(c) { return num(c.gstPct, FUNDING_DEFAULTS.gstPct) / 100; }
function gstFullOf(c) {
  if (c.gstAmt > 0) return c.gstAmt;                 // explicit override wins
  return round0((c.agreementValueIndex || 0) * gstRateOf(c));
}

function deriveCustomer(c, recovery, schedule) {
  const O = c.carpetArea || 0, P = c.balconyArea || 0;
  const Q = O + P;                                    // Total Carpet Unit (sq.ft)
  const R = round2(Q * 0.092903);                     // Total Carpet Unit (sq.mt)
  const S = c.salableArea || 0, T = c.rate || 0;
  const U = S * T;                                    // Basic Value (calc)
  const W = c.basicValueManual || 0;
  const V = U - W;                                    // Diff
  const X = c.parkingAmt || 0, Z = c.infraCharges || 0;
  const AA = W + Z + X;                               // Agreement Value (calc)
  const AC = c.agreementValueIndex || 0;
  const AB = AA - AC;                                 // Diff
  const AD = gstFullOf(c);                            // GST Amt (100%) -- per-customer rate
  const AE = c.duePct || 0;                           // Due% (manual)
  const AF = (c.tdsDuePct != null ? c.tdsDuePct : 0.01);
  const AG = round0(AC * AF);                         // TDS Due
  const AH = c.tdsPaid || 0;
  const AI = round0(AC * AE);                         // Due amt (as per DL)
  const AL = round0(recovery.flatCost || 0);          // Amt Rec -- auto from Recovery Sheet
  const AJ = AL + AH;                                 // Total Rec Amt
  const AK = c.stampDutyReceived || 0;
  const AM = round0(AI - AJ);                         // Balance (current stage)
  const AN = AC - AJ;                                 // Balance (to possession)
  const milestoneAmounts = schedule ? milestoneAmountsFor(schedule, AC) : [];
  const AY = round0(AD * AE);                          // GST due at current stage (same rate as AD)
  const AZ = round0(recovery.gst || 0);               // GST received -- auto from Recovery Sheet
  const BA = round0(AY - AZ);                         // GST balance current stage
  const BB = AD - AZ;                                 // GST balance to possession
  const BE = AM + BA;                                 // Total balance incl. GST
  const BJ = c.ocrAmt || 0, BK = c.ocrPaid || 0;
  const BL = BJ - BK;                                 // OCR balance

  return { Q, R, U, V, AA, AB, AD, AG, AI, AJ, AL, AM, AN, AY, AZ, BA, BB, BE, BL, milestoneAmounts };
}

/* ---- Payment Timeline: due-date interpolation + status/delay/partial payments ---- */
function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
function milestoneDueDate(booking, possession, cumPct) {
  if (!booking || !possession) return null;
  const span = daysBetween(booking, possession);
  const offset = Math.round(span * cumPct / 100);
  return new Date(booking.getTime() + offset * 86400000);
}
/* The construction stage happens ONCE for the whole tower: the builder completes the
   plinth on one date and raises that demand to every buyer in the building on the same day.
   So a date set on the stage wins for everybody; the per-customer interpolation between
   booking and possession is only a fallback for stages with no date yet. */
function stageDueDate(stage, booking, possession, cumPct) {
  if (stage) {
    if (stage.completedDate) return asDateSafe(stage.completedDate);
    if (stage.plannedDate) return asDateSafe(stage.plannedDate);
  }
  return milestoneDueDate(booking, possession, cumPct);
}
function asDateSafe(v) {
  if (!v) return null;
  const d = (v instanceof Date) ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
// where a due date came from, so the UI can say so
function dueDateSource(stage) {
  if (stage && stage.completedDate) return 'completed';
  if (stage && stage.plannedDate) return 'planned';
  return 'estimated';
}
// how far the tower has actually been built
function towerProgress(schedule) {
  const done = (schedule || []).filter(m => m.completedDate);
  const pctDone = done.reduce((a, m) => a + (m.pct || 0), 0);
  return { stagesDone: done.length, total: (schedule || []).length,
           pctDone: Math.round(pctDone * 1000) / 10,
           lastDone: done.length ? done[done.length - 1] : null };
}

// `payment` is null, or {amount, date, reason?} recording what has been paid so far.
/* Money recorded against a stage settles it whether or not the payment date was captured.
   The old version keyed off the date, so a fully paid stage with a blank date came back
   as "Due - Pending" -- it showed as overdue on the ageing chart and got chased in the
   action queue while the money was already in. The date only affects punctuality. */
function milestoneStatus(dueDate, payment, amountDue, today) {
  const amt = payment ? (payment.amount || 0) : 0;
  if (amt > 0) {
    const paidEnough = amt >= (amountDue || 0) - 1;   // 1 rupee rounding tolerance
    return paidEnough ? 'Paid' : 'Partially Paid';
  }
  if (dueDate && today && dueDate.getTime() <= today.getTime()) return 'Due, pending';
  return 'Not Yet Due';
}
function milestoneDelay(dueDate, payment) {
  if (!payment || !payment.date || !dueDate) return null;
  return daysBetween(dueDate, payment.date);
}

/* ---- Reliability rating from a customer's paid (full or partial) milestones ---- */
function computeRating(paidDelays) {
  if (!paidDelays || paidDelays.length < 2) return { rating: 'unknown', avgDelay: null };
  const avg = paidDelays.reduce((a, b) => a + b, 0) / paidDelays.length;
  let rating;
  if (avg <= cfg('greenDays')) rating = 'green';
  else if (avg <= cfg('yellowDays')) rating = 'yellow';
  else rating = 'red';
  return { rating, avgDelay: avg };
}


/* ================= Cost of flat & funding plan =================
   The bank funds a share of the AGREEMENT VALUE only. Stamp duty, registration, GST and
   any other charges are the customer's own money on top: that is what balloons if nobody
   plans it. Every default here can be overridden per customer, because sheets differ
   (Kumar Prism rounds stamp duty to 14,39,200 against an exact 7% of 14,39,182).
*/
/* ---- every tunable number lives here, not scattered through the code ---- */
const CONFIG_DEFAULTS = {
  watchThreshold: 2,        // partial payments before a customer is flagged Watch
  greenDays: 7,             // avg delay up to this = green
  yellowDays: 21,           // avg delay up to this = yellow, beyond = red
  bankLeadPercentile: 75,   // which percentile of a bank's history to plan against
  recentWeight: 3,          // forecast: weight on the most recent milestone
  recentWindow: 3,          // forecast: how many recent milestones carry the heavy weight
  ageAmberDays: 30,         // forecast: outstanding beyond this drops one band
  ageRedDays: 60,           // forecast: outstanding beyond this is red regardless
  delayInterestPct: 18,     // per annum on a late demand, as the agreement usually says
  delayGraceDays: 15,       // days after the due date before interest starts running
  interestOn: true,         // some builders never charge it; the threat still does the work
  bankLeadFloor: 7,         // never recommend chasing a bank less than this many days ahead
  horizonDays: 30,          // default "coming up" window on Action Items
  editorCols: 3,            // columns on the customer form: 5 across reads as a wall of boxes
  rowsPerPage: 10,          // rows a listing opens on, everywhere
  misFolderPath: '',        // where the builder-partner folders live, for everyone's reference
  stampDutyPct: 7,
  registrationAmt: 30000,
  gstPct: 5,
  psPrefix: 'PSFA',         // Perfect Solutions Finance Advisory
  psDigits: 7,              // PSFA0000001 .. PSFA9999999
  gaps: {},                 // ruleId -> { on, sev, msg } overrides
  req: {},                  // requiredId -> { on } overrides -- which fields block a save
  // The lending panel. Edited from the gear icon and saved into the workbook, so every
  // customer file carries the same list and nobody types "HDFC LTD" on one row and
  // "hdfc" on the next -- bank-wise grouping and lead-time learning both key off this.
  banks: [
    'SBI', 'HDFC', 'ICICI', 'AXIS', 'KOTAK', 'BANK OF BARODA', 'PUNJAB NATIONAL BANK',
    'UNION BANK OF INDIA', 'CANARA BANK', 'BANK OF INDIA', 'CENTRAL BANK OF INDIA',
    'IDBI BANK', 'INDUSIND BANK', 'YES BANK', 'FEDERAL BANK', 'RBL BANK',
    'LIC HOUSING', 'BAJAJ HOUSING', 'PNB HOUSING', 'TATA CAPITAL HOUSING',
    'ADITYA BIRLA HOUSING', 'GODREJ HOUSING', 'L&T HOUSING', 'PIRAMAL CAPITAL',
    'INDIABULLS HOUSING', 'SHRIRAM HOUSING', 'HERO HOUSING', 'ICICI HOME FINANCE',
    'SUNDARAM HOME FINANCE', 'REPCO HOME FINANCE', 'CAN FIN HOMES', 'MOTILAL OSWAL HOME LOANS',
  ],
};
const OWN_FUNDS = 'OWN FUNDS';
// what an empty cell shows. One constant, so it is changed in one place.
const NIL = '\u2013';
let CONFIG = JSON.parse(JSON.stringify(CONFIG_DEFAULTS));
function cfg(k) { return CONFIG[k] != null ? CONFIG[k] : CONFIG_DEFAULTS[k]; }
function resetConfig() { CONFIG = JSON.parse(JSON.stringify(CONFIG_DEFAULTS)); }


/* ---- the lending panel ---- */
function bankList() {
  const raw = cfg('banks');
  const arr = Array.isArray(raw) ? raw.slice()
            : String(raw || '').split('|').map(x => x.trim()).filter(Boolean);
  const seen = {}, out = [];
  arr.forEach(b => { const k = String(b).trim().toUpperCase();
    if (k && k !== OWN_FUNDS && !seen[k]) { seen[k] = 1; out.push(k); } });
  out.sort();
  return [OWN_FUNDS].concat(out);
}
function addBank(name) {
  const k = String(name || '').trim().toUpperCase();
  if (!k || k === OWN_FUNDS) return false;
  const cur = bankList();
  if (cur.indexOf(k) >= 0) return false;
  CONFIG.banks = cur.filter(b => b !== OWN_FUNDS).concat([k]);
  return true;
}
function removeBank(name) {
  const k = String(name || '').trim().toUpperCase();
  CONFIG.banks = bankList().filter(b => b !== OWN_FUNDS && b !== k);
  return true;
}
function renameBank(from, to) {
  const a = String(from || '').trim().toUpperCase(), b = String(to || '').trim().toUpperCase();
  if (!a || !b || a === b || b === OWN_FUNDS) return false;
  CONFIG.banks = bankList().filter(x => x !== OWN_FUNDS).map(x => x === a ? b : x);
  return true;
}

const FUNDING_DEFAULTS = { get stampDutyPct() { return cfg('stampDutyPct'); },
                           get registrationAmt() { return cfg('registrationAmt'); },
                           get gstPct() { return cfg('gstPct'); } };

function num(v, fallback) { const n = parseFloat(v); return isNaN(n) ? fallback : n; }

/* ---- Perfect Solutions client number: PSFA + a zero-padded running sequence ----
   Deliberately a plain sequence rather than something derived from name or PAN: an
   identifier has to stay put. Correct a spelling or a wrong PAN and a derived code would
   change underneath every receipt already issued against it, and two customers sharing a
   surname could collide. A sequence never does either, and carries no personal data. */
function psFormat(n) {
  const d = cfg('psDigits');
  return cfg('psPrefix') + String(Math.max(0, Math.floor(n))).padStart(d, '0');
}
function psParse(v) {
  if (!v) return null;
  const m = String(v).trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  return { prefix: m[1], n: parseInt(m[2], 10) };
}
function psIsValid(v) {
  const p = psParse(v);
  return !!p && p.prefix === String(cfg('psPrefix')).toUpperCase();
}
// next free number, one past the highest already issued
function psNext(customers) {
  let max = 0;
  (customers || []).forEach(c => {
    const p = psParse(c.psNo);
    if (p && p.prefix === String(cfg('psPrefix')).toUpperCase() && p.n > max) max = p.n;
  });
  return psFormat(max + 1);
}

// what the flat actually costs the customer, all in
function costOfFlat(c) {
  const AV = c.agreementValueIndex || 0;
  const sdPct = num(c.stampDutyPct, FUNDING_DEFAULTS.stampDutyPct) / 100;
  const gstPct = num(c.gstPct, FUNDING_DEFAULTS.gstPct) / 100;
  /* Stamp duty is charged on whichever is higher, the agreed price or the ready
     reckoner value. Charging it on the agreement value alone understates the duty on
     every unit sold below the government rate, which is common in a slow market. */
  const dutyBase = Math.max(AV, c.marketValue || 0);
  const stampDuty = (c.stampDutyAmt > 0) ? c.stampDutyAmt : round0(dutyBase * sdPct);
  const gst = (c.gstAmt > 0) ? c.gstAmt : round0(AV * gstPct);
  const registration = num(c.registrationAmt, FUNDING_DEFAULTS.registrationAmt);
  const other = c.otherCharges || 0;
  return {
    AV, dutyBase, stampDuty, registration, gst, other,
    // round the percentages back out of float noise (7/100*100 -> 7.000000000000001)
    sdPct: Math.round(sdPct * 100 * 1000) / 1000, gstPct: Math.round(gstPct * 100 * 1000) / 1000,
    stampDutyOverridden: c.stampDutyAmt > 0, gstOverridden: c.gstAmt > 0,
    // everything the bank will never touch
    nonLoanable: stampDuty + registration + other,
    totalCost: AV + stampDuty + registration + gst + other,
  };
}

// how the flat is being paid for -- provisional until the sanction letter lands
function fundingPlan(c) {
  const k = costOfFlat(c);
  const sanctioned = c.loanAmount || 0;
  // "maximum the bank will give" is an open expectation, not a number -- whatever the bank
  // sanctions IS the maximum, so it can never come in short of what was asked for.
  const wantsMax = !!c.loanExpectedMax;
  const expected = wantsMax ? 0 : (c.loanExpected || 0);
  const loan = sanctioned > 0 ? sanctioned : expected;
  const status = sanctioned > 0 ? 'sanctioned' : (expected > 0 || wantsMax ? 'provisional' : 'none');
  const shortfall = (sanctioned > 0 && expected > 0) ? Math.max(0, expected - sanctioned) : 0;
  const ownRequired = Math.max(0, k.totalCost - loan);
  // A bank valuing above the agreement can sanction more than the flat costs. Clamping
  // ownRequired to zero hid that entirely; the excess has to be trimmed or repaid.
  const excessSanction = Math.max(0, loan - k.totalCost);
  return {
    ...k, loan, sanctioned, expected, status, shortfall, excessSanction,
    provisional: status === 'provisional',
    wantsMax,
    noLoan: status === 'none',
    ownRequired,
    ownPctOfCost: k.totalCost ? Math.round(ownRequired / k.totalCost * 1000) / 10 : 0,
    loanPctOfAV: k.AV ? Math.round(loan / k.AV * 1000) / 10 : 0,
  };
}

// what has actually moved, split by where it came from
function fundingProgress(c, collections) {
  let own = 0, bank = 0, unclassified = 0, bankGst = 0;
  (collections || []).forEach(e => {
    if (e.customer !== c.name) return;
    const fc = e.flatCost || 0, g = e.gst || 0;
    if (e.source === 'Bank') {
      bank += fc;
      // No bank funds GST. GST sitting on a bank row was the customer's money, so it
      // belongs on the own side -- it used to be dropped from the ledger entirely.
      bankGst += g; own += g;
    } else if (e.source === 'Own') { own += fc + g; }
    else unclassified += fc + g;
  });
  const stampPaid = stampPaidOf(c, collections);
  const plan = fundingPlan(c);
  const ownPaid = own + stampPaid;

  // An unmarked receipt is money that has genuinely arrived, so it has to reduce
  // somebody's pending figure or the customer gets chased for it twice. It goes against
  // the own side first (bank disbursements come with an advice and get marked; unmarked
  // rows are almost always customer payments), and only the excess against the bank.
  // Money a bank has actually paid out is bank money even when the sanction figure is
  // still blank -- which happens all the time between first disbursement and the letter
  // being filed. Without this the disbursed amount was charged back to the customer as
  // own contribution and the ledger stopped balancing.
  const undocumentedDisbursement = Math.max(0, bank - plan.loan);
  const loanEffective = Math.max(plan.loan, bank);
  const ownRequiredEff = Math.max(0, plan.totalCost - loanEffective);

  const ownGross = Math.max(0, ownRequiredEff - ownPaid);
  const unclassToOwn = Math.min(unclassified, ownGross);
  const unclassToBank = unclassified - unclassToOwn;
  const bankDisbursedEff = bank + unclassToBank;

  const ownPending = Math.max(0, ownGross - unclassToOwn);
  const bankPending = Math.max(0, loanEffective - bankDisbursedEff);
  const totalIn = ownPaid + bank + unclassified;
  return {
    ...plan,
    ownRequired: ownRequiredEff, ownRequiredPlanned: plan.ownRequired,
    loanEffective, undocumentedDisbursement,
    ownPaid, ownFromReceipts: own, stampPaid, unclassified, bankGst,
    unclassToOwn, unclassToBank,
    ownPending,
    bankDisbursed: bank,
    bankPending,
    totalIn,
    // the true figure, sign intact -- an over-collection is a refund liability, not a zero
    totalPendingRaw: plan.totalCost - totalIn,
    totalPending: Math.max(0, plan.totalCost - totalIn),
    overPaid: Math.max(0, totalIn - plan.totalCost),
  };
}

/* Stamp duty is captured in its own field AND is a perfectly natural thing to log as a
   receipt. Counting both doubled it. If a receipt is already tagged as stamp duty, the
   field is treated as a duplicate of it rather than money on top. */
function isStampRow(e, field) {
  if (!e || e.source === 'Bank') return false;
  if (/stamp\s*duty|\bsd\b/i.test(String(e.remark || ''))) return true;
  // no remark, but the exact amount of the declared stamp duty -- same money
  return field > 0 && Math.abs(((e.flatCost || 0) + (e.gst || 0)) - field) < 1;
}
function stampLoggedOf(c, collections) {
  const field = c.stampDutyReceived || 0;
  let logged = 0;
  (collections || []).forEach(e => {
    if (e.customer !== c.name) return;
    if (isStampRow(e, field)) logged += (e.flatCost || 0) + (e.gst || 0);
  });
  return logged;
}
/* The field and a logged receipt are two records of ONE payment, so the field only adds
   whatever the receipts have not already accounted for. Adding both doubled it. */
function stampPaidOf(c, collections) {
  const field = c.stampDutyReceived || 0;
  return Math.max(0, field - Math.min(field, stampLoggedOf(c, collections)));
}

// Share of each remaining demand the bank should fund. Self-correcting: a big booking
// token up front leaves less own money to come, so the bank naturally carries more of
// each later demand -- which is exactly the 10% token / 90%-of-each-demand pattern.
/* The bank funds a share of the remaining AGREEMENT-VALUE demands only. The old version
   divided by (ownPending + bankPending), but ownPending also carries stamp duty,
   registration and GST -- money no demand letter ever asks for -- so the denominator was
   too big, the bank's share came out too small, and every demand over-charged the
   customer while leaving part of the sanction unallocated at the end.
   `avRemaining` is the outstanding agreement value; pass it in and the ratio is exact. */
function bankShareRatio(prog, avRemaining) {
  const av = (avRemaining != null) ? avRemaining
                                   : (prog.ownPending + prog.bankPending);
  if (av <= 0) return 0;
  return Math.max(0, Math.min(1, prog.bankPending / av));
}

// Watch flag: this many partial payments in a customer's history (configurable).
function isWatched(partialCount) { return (partialCount || 0) >= cfg('watchThreshold'); }

if (typeof module !== 'undefined') {
  module.exports = { NIL, gstRateOf, gstFullOf, isStampRow, stampLoggedOf, stampPaidOf, OWN_FUNDS, bankList, addBank, removeBank, renameBank, psFormat, psParse, psIsValid, psNext, CONFIG, CONFIG_DEFAULTS, cfg, resetConfig, stageDueDate, dueDateSource, towerProgress, asDateSafe, FUNDING_DEFAULTS, costOfFlat, fundingPlan, fundingProgress, bankShareRatio, num, MAX_PROJECTS, MAX_TOWERS_PER_PROJECT, DEFAULT_SCHEDULE, round0, round2,
    scheduleCumPct, scheduleTotalPct, milestoneAmountsFor, deriveCustomer, daysBetween,
    milestoneDueDate, milestoneStatus, milestoneDelay, computeRating, isWatched };
}
