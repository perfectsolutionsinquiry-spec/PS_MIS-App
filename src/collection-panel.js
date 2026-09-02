/* ================= Per-customer collection panel =================
   Opening an action item should not dump you into a 60-field editor. This is the
   collector's view: what this customer owes, what is overdue, who is chasing them, and a
   one-click way to record money that has already landed.

   Every write goes through a confirm step and is reversible for the rest of the session,
   because the fastest way to lose trust in a tool is an accidental entry you cannot undo.
*/
let COLLECT_ID = null;      // customer being viewed
let COLLECT_MS = null;      // milestone the panel opened on
let COLLECT_UNDO = [];      // stack of reversible actions

function collectCustomer() { return STATE.customers.find(c => c.id === COLLECT_ID) || null; }

function openCollect(id, milestoneId) {
  const c = STATE.customers.find(x => x.id === id);
  if (!c) return;
  COLLECT_ID = id;
  COLLECT_MS = milestoneId || null;
  document.getElementById('collect-modal').classList.add('show');
  document.body.classList.add('no-scroll');
  renderCollect();
}
function closeCollect() {
  document.getElementById('collect-modal').classList.remove('show');
  document.body.classList.remove('no-scroll');
  COLLECT_ID = null; COLLECT_MS = null;
}

/* the demands behind this customer, newest obligation last */
function collectRows(c) {
  const l = towerOf(c);
  const sched = l.tower ? l.tower.schedule : [];
  if (!sched.length) return [];
  const cum = scheduleCumPct(sched);
  const d = derived(c);
  const prog = progOf(c);
  const gstRate = prog.gstPct / 100;
  const paid = STATE.milestonePaid[c.name] || {};
  const today = new Date();

  let avOpen = 0;
  sched.forEach((m, i) => {
    const p = paid[m.id], amt = d.milestoneAmounts[i];
    if (!(p && p.amount >= amt - 1)) avOpen += Math.max(0, amt - (p ? p.amount : 0));
  });
  const ratio = avOpen > 0 ? Math.max(0, Math.min(1, prog.bankPending / avOpen)) : 0;

  let bankLeft = prog.bankPending;
  return sched.map((m, i) => {
    const amount = d.milestoneAmounts[i];
    const p = paid[m.id] || null;
    const already = p ? (p.amount || 0) : 0;
    const outstanding = Math.max(0, amount - already);
    const due = stageDueDate(m, c.bookingDate, c.possessionDate, cum[i]);
    const settled = outstanding <= 1;
    const bankShare = settled ? 0 : Math.min(round0(outstanding * ratio), bankLeft);
    bankLeft = Math.max(0, bankLeft - bankShare);
    const gst = settled ? 0 : round0(outstanding * gstRate);
    const ownShare = settled ? 0 : (outstanding - bankShare) + gst;
    const daysToDue = due ? daysBetween(startOfDay(today), startOfDay(due)) : null;
    return { id: m.id, label: m.label, pct: m.pct, amount, already, outstanding, due, daysToDue,
             settled, bankShare, gst, ownShare, partial: already > 0 && !settled,
             reason: p ? (p.reason || '') : '',
             state: settled ? 'paid' : (daysToDue == null ? 'undated'
                    : daysToDue < 0 ? 'overdue' : daysToDue <= ACT.horizon ? 'soon' : 'later') };
  });
}

function renderCollect() {
  const c = collectCustomer();
  if (!c) return;
  const l = towerOf(c);
  const prog = progOf(c);
  const rows = collectRows(c);
  const open = rows.filter(r => !r.settled);
  const overdue = open.filter(r => r.state === 'overdue');
  const soon = open.filter(r => r.state === 'soon');
  const sum = (a, k) => a.reduce((s, r) => s + r[k], 0);
  const lead = leadDaysFor(bankOf(c), bankLagStats());

  document.getElementById('collect-title').textContent = c.name || 'Customer';
  document.getElementById('collect-sub').innerHTML =
    `${esc(c.psNo || 'no client number')} &middot; ${esc(l.project ? l.project.name : '')}`
    + ` &middot; ${esc(l.tower ? l.tower.name : '')} &middot; ${esc(c.flat || '')}`
    + (c.contact ? ` &middot; <a href="tel:${esc(c.contact)}">${esc(c.contact)}</a>` : '');

  // ---------- what this customer owes right now ----------
  document.getElementById('collect-kpis').innerHTML = [
    { l: 'Overdue', v: fmtINR(sum(overdue, 'outstanding')), s: `${overdue.length} demand${overdue.length===1?'':'s'}`,
      bad: overdue.length > 0 },
    { l: `Due in ${ACT.horizon} days`, v: fmtINR(sum(soon, 'outstanding')), s: `${soon.length} demand${soon.length===1?'':'s'}` },
    { l: 'We are asking for', v: fmtINR(sum(open, 'ownShare')), s: 'customer’s own share, incl. GST' },
    { l: 'Bank has to disburse', v: fmtINR(sum(open, 'bankShare')),
      s: bankOf(c) === 'OWN FUNDS' ? 'self-funded' : `${esc(bankOf(c))}${lead != null ? `, raise ${lead}d ahead` : ''}` },
    { l: 'Own contribution still to arrange', v: fmtINR(prog.ownPending), s: `of ${fmtCompact(prog.ownRequired)} total` },
    { l: 'Received so far', v: fmtINR(prog.totalIn), s: `of ${fmtCompact(prog.totalCost)} total cost` },
  ].map(t => `<div class="stat-tile"><div class="label">${t.l}</div>
      <div class="value sm"${t.bad ? ' style="color:var(--status-critical)"' : ''}>${t.v}</div>
      <div class="sub">${t.s}</div></div>`).join('');

  // ---------- who is chasing ----------
  const owner = c.assignedTo
    ? `<b>${esc(c.assignedTo)}</b>`
      + (c.assignedPhone ? ` &middot; <a href="tel:${esc(c.assignedPhone)}">${esc(c.assignedPhone)}</a>` : '')
      + (c.assignedEmail ? ` &middot; <a href="mailto:${esc(c.assignedEmail)}">${esc(c.assignedEmail)}</a>` : '')
    : '<span class="muted">Nobody assigned yet</span>';
  document.getElementById('collect-owner').innerHTML =
    `<span class="own-label">Collection owner</span> ${owner}
     <button class="btn-tiny" id="btn-collect-assign" type="button">${c.assignedTo ? 'Change' : 'Assign'}</button>`;
  const ab = document.getElementById('btn-collect-assign');
  if (ab) ab.addEventListener('click', () => { closeCollect(); openEditor(c.id);
    document.querySelector('.mtab-btn[data-mtab="customers"]').click();
    setTimeout(() => { const el = document.getElementById('f_assignedTo');
      if (el) { el.scrollIntoView({ behavior:'smooth', block:'center' }); el.focus(); } }, 400); });

  // ---------- the demands ----------
  const STATE_PILL = { paid:['ok','Settled'], overdue:['crit','Overdue'], soon:['warn','Due soon'],
                       later:['unk','Later'], undated:['unk','No date'] };
  document.getElementById('collect-body').innerHTML = rows.map(r => {
    const [cls, lab] = STATE_PILL[r.state];
    // a settled demand is not overdue, however long ago its due date was
    const when = r.settled ? '<span class="muted">paid</span>'
               : r.daysToDue == null ? '' : r.daysToDue < 0 ? `<b class="crit-txt">${Math.abs(r.daysToDue)}d overdue</b>`
               : r.daysToDue === 0 ? '<b class="crit-txt">due today</b>' : `in ${r.daysToDue}d`;
    return `<tr class="${r.state === 'overdue' ? 'row-overdue' : ''}${r.settled ? ' stage-done' : ''}">
      <td><span class="pill ${cls}">${lab}</span></td>
      <td>${esc(r.label)}<div class="sub-line">${Math.round((r.pct||0)*1000)/10}% of agreement${
            r.partial ? ` &middot; <span class="warn-txt">part-paid ${fmtINR(r.already)}</span>` : ''}</div></td>
      <td>${r.due ? fmtDate(r.due) : NIL}<div class="sub-line">${when}</div></td>
      <td class="num">${fmtINR(r.amount)}</td>
      <td class="num"><b>${r.outstanding > 0 ? fmtINR(r.outstanding) : NIL}</b></td>
      <td class="num">${r.ownShare > 0 ? fmtINR(r.ownShare) : NIL}${
            r.gst > 0 ? `<div class="sub-line">incl. GST ${fmtINR(r.gst)}</div>` : ''}</td>
      <td class="num">${r.bankShare > 0 ? fmtINR(r.bankShare) : NIL}</td>
      <td class="nowrap">${r.settled ? '<span class="muted">nothing due</span>'
        : `<button class="btn-primary btn-tiny collect-go" data-ms="${esc(r.id)}">Record receipt</button>`}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="8" class="empty-row">This unit has no payment schedule yet. Add one on its tower.</td></tr>`;

  document.querySelectorAll('#collect-body .collect-go').forEach(b =>
    b.addEventListener('click', () => openReceipt(b.dataset.ms)));

  renderUndo();
  // when opened from a specific demand, take them straight to it
  if (COLLECT_MS) {
    const btn = document.querySelector(`#collect-body .collect-go[data-ms="${CSS.escape(COLLECT_MS)}"]`);
    if (btn) btn.closest('tr').classList.add('flash-row');
    COLLECT_MS = null;
  }
}

/* ---------------- recording a receipt ---------------- */
let RECEIPT = null;

/* Everything a receipt can be paid against: each demand that still has money open, plus
   the charges that sit outside the schedule entirely. Picking one re-targets the whole
   form, so the collector never has to work out which stage a payment belongs to. */
function receiptTargets(c) {
  const prog = progOf(c);
  const rows = collectRows(c).filter(r => !r.settled);
  const out = rows.map(r => ({
    kind: 'demand', id: r.id, row: r,
    label: r.label,
    due: r.due || null, daysToDue: r.daysToDue,
    note: `${fmtINR(r.outstanding)} outstanding` +
          (r.due ? `, due ${fmtDate(r.due)}` : '') +
          (r.daysToDue != null && r.daysToDue < 0 ? `, ${Math.abs(r.daysToDue)}d overdue` : '') +
          (r.already > 0 ? `, ${fmtINR(r.already)} already paid` : ''),
    amount: r.outstanding, gst: r.gst,
  }));
  const chargesLeft = Math.max(0, prog.nonLoanable - prog.stampPaid);
  if (chargesLeft > 0) out.push({
    kind: 'charges', id: '__charges__', row: null,
    label: 'Stamp duty, registration & other charges',
    note: `${fmtINR(chargesLeft)} outstanding, not part of any demand`,
    amount: chargesLeft, gst: 0 });
  const gstLeft = Math.max(0, round0(derived(c).AD) - round0(derived(c).AZ));
  if (gstLeft > 0) out.push({
    kind: 'gst', id: '__gst__', row: null,
    label: 'GST only',
    note: `${fmtINR(gstLeft)} of GST still to come in`,
    amount: 0, gst: gstLeft });
  out.push({ kind: 'other', id: '__other__', row: null,
    label: 'Something else (not against a demand)',
    note: 'logged to Collections without touching the payment schedule',
    amount: 0, gst: 0 });
  return out;
}

/* the one-line description of a target as it reads inside the dropdown */
function receiptOptionText(t) {
  if (t.kind !== 'demand') return t.label;
  const bits = [`outstanding ${fmtINR(t.amount)}`];
  if (t.due) bits.push(`due ${fmtDate(t.due)}`);
  const s = `${t.label} \u2014 ${bits[0]}` + (bits[1] ? ` (${bits[1]})` : '');
  return s + (t.daysToDue != null && t.daysToDue < 0 ? ` \u00b7 ${Math.abs(t.daysToDue)}d overdue` : '');
}

/* Fill the "money against" dropdown from the customer's own payment schedule: every stage
   that still has money open, in schedule order, then the things that sit outside the
   schedule. Grouped, so it is obvious which is which. */
function fillReceiptTargets(targets, pickId) {
  const sel = document.getElementById('rc-against');
  const demands = targets.filter(t => t.kind === 'demand');
  const extras = targets.filter(t => t.kind !== 'demand');
  const opt = t => `<option value="${esc(t.id)}">${esc(receiptOptionText(t))}</option>`;
  sel.innerHTML =
    (demands.length
      ? `<optgroup label="Pending demands on this payment schedule">${demands.map(opt).join('')}</optgroup>`
      : `<optgroup label="Payment schedule"><option value="" disabled>Every demand on this schedule is settled</option></optgroup>`)
    + (extras.length ? `<optgroup label="Outside the payment schedule">${extras.map(opt).join('')}</optgroup>` : '');
  const wanted = targets.find(t => t.id === pickId) || demands[0] || extras[0] || null;
  if (wanted) sel.value = wanted.id;
  return wanted;
}

function openReceipt(msId) {
  const c = collectCustomer();
  if (!c) { askTell({ title: 'No customer open', body: 'Open the customer from the action queue first.' }); return; }
  const targets = receiptTargets(c);
  if (!targets.length) {
    askTell({ title: 'Nothing to record against',
              body: 'This unit has no open demand and nothing outside the schedule left to collect.' });
    return;
  }
  const pick = targets.find(t => t.id === msId) || targets.find(t => t.kind === 'demand') || targets[0];
  RECEIPT = { targets, pick };
  fillReceiptTargets(targets, pick.id);
  document.getElementById('receipt-modal').classList.add('show');
  document.getElementById('rc-title').textContent = `Record a receipt: ${c.name}`;
  document.getElementById('rc-date').value = toISODate(new Date());
  document.getElementById('rc-full').checked = true;
  document.getElementById('rc-requested').value = '';
  document.getElementById('rc-reason').value = '';
  document.getElementById('rc-remark').value = '';
  receiptPick();
}
function closeReceipt() {
  document.getElementById('receipt-modal').classList.remove('show');
  RECEIPT = null;
}

/* the demand changed: re-point the form at it */
function receiptPick() {
  if (!RECEIPT) return;
  const id = document.getElementById('rc-against').value;
  RECEIPT.pick = RECEIPT.targets.find(t => t.id === id)
              || RECEIPT.targets.find(t => t.kind === 'demand')
              || RECEIPT.targets[0];
  const t = RECEIPT.pick;
  if (!t) return;
  document.getElementById('rc-against-hint').textContent = t.note;
  const src = document.getElementById('rc-source');
  // only an agreement-value demand can be met by the bank; charges and GST never are
  const bankable = t.kind === 'demand' && t.row && t.row.bankShare > 0;
  src.value = bankable && t.row.bankShare >= t.row.ownShare ? 'Bank' : 'Own';
  const fullWrap = document.getElementById('rc-full').closest('.fld');
  const canFull = (t.amount > 0 || t.gst > 0);
  fullWrap.style.display = canFull ? '' : 'none';
  if (!canFull) document.getElementById('rc-full').checked = false;
  document.getElementById('rc-remark').placeholder =
    t.kind === 'demand' ? 'cheque number, UTR, who handed it over' : 'what this payment was for';
  receiptRecalc();
}

function receiptRecalc() {
  if (!RECEIPT || !RECEIPT.pick) return;
  const t = RECEIPT.pick;
  if (t.kind === 'demand' && !t.row) return;
  const full = document.getElementById('rc-full').checked;
  const amtEl = document.getElementById('rc-amount');
  const gstEl = document.getElementById('rc-gst');
  amtEl.disabled = full;
  gstEl.disabled = full;
  if (full) { amtEl.value = t.amount || 0; gstEl.value = t.gst || 0; }
  const amount = full ? (t.amount || 0) : (parseFloat(amtEl.value) || 0);
  const gst = full ? (t.gst || 0) : (parseFloat(gstEl.value) || 0);
  const src = document.getElementById('rc-source').value;
  const isDemand = t.kind === 'demand';
  const short = isDemand && amount < t.amount - 1;
  document.getElementById('rc-reason-wrap').style.display = short ? 'block' : 'none';
  document.getElementById('rc-requested-wrap').style.display = (src === 'Bank') ? 'block' : 'none';
  const where = src === 'Bank' ? 'a bank disbursement' : 'the customer’s own funds';
  let msg;
  if (!isDemand) {
    msg = `Recording <b>${fmtINR(amount)}</b>${gst ? ` plus GST <b>${fmtINR(gst)}</b>` : ''} as ${where},`
        + ` against <b>${esc(t.label.toLowerCase())}</b>. The payment schedule is not changed.`;
  } else {
    msg = `Demand <b>${fmtINR(t.row.amount)}</b>, outstanding <b>${fmtINR(t.amount)}</b>.`
        + ` Recording <b>${fmtINR(amount)}</b>${gst ? ` plus GST <b>${fmtINR(gst)}</b>` : ''} as ${where}.`
        + (amount >= t.amount - 1 ? ' This settles the demand.'
           : ` <b class="warn-txt">${fmtINR(Math.max(0, t.amount - amount))} would still be outstanding</b> and the stage stays part-paid.`);
  }
  document.getElementById('rc-summary').innerHTML = msg;
}

/* The primary button. Every path out of here either records the receipt or tells the user
   why it did not: a silent return is what makes a button look broken. */
async function saveReceipt() {
  if (SAVING_RECEIPT) return;              // a double-click must not write the row twice
  SAVING_RECEIPT = true;
  try {
    await saveReceiptInner();
  } catch (err) {
    console.error('saveReceipt', err);
    await askTell({ title: 'Could not record this receipt',
                    body: 'Nothing was written. ' + (err && err.message ? err.message : String(err)) });
  } finally {
    SAVING_RECEIPT = false;
  }
}
let SAVING_RECEIPT = false;

async function saveReceiptInner() {
  const c = collectCustomer();
  if (!c) {
    await askTell({ title: 'No customer open',
                    body: 'The customer panel closed underneath this form. Open the unit again from the action queue.' });
    return;
  }
  // the form can outlive its state if the page re-rendered behind it: rebuild rather than die
  if (!RECEIPT || !RECEIPT.pick) {
    const targets = receiptTargets(c);
    const sel = document.getElementById('rc-against');
    const pick = targets.find(t => t.id === (sel && sel.value)) || targets.find(t => t.kind === 'demand') || targets[0];
    if (!pick) {
      await askTell({ title: 'Nothing to record against',
                      body: 'This unit has no open demand left. Close this form and reopen the unit.' });
      return;
    }
    RECEIPT = { targets, pick };
  }
  const t = RECEIPT.pick;
  const isDemand = t.kind === 'demand';
  if (isDemand && !t.row) {
    await askTell({ title: 'That demand is no longer open',
                    body: 'Its schedule changed while this form was open. Pick the demand again from the dropdown.' });
    return;
  }
  const full = document.getElementById('rc-full').checked;
  const amount = round0(full ? (t.amount || 0) : (parseFloat(document.getElementById('rc-amount').value) || 0));
  const gst = round0(full ? (t.gst || 0) : (parseFloat(document.getElementById('rc-gst').value) || 0));
  const date = document.getElementById('rc-date').value;
  const src = document.getElementById('rc-source').value;
  const note = document.getElementById('rc-remark').value.trim();
  const reason = document.getElementById('rc-reason').value.trim();
  const requested = document.getElementById('rc-requested').value;

  if (!(amount > 0 || gst > 0)) {
    await askTell({ title: 'Nothing to record', body: 'Enter the amount that was received.' }); return;
  }
  if (!date) {
    await askTell({ title: 'Date missing', body: 'Enter the date the money was received.' }); return;
  }
  if (isDemand && amount > t.amount + 1 &&
      !await askConfirm({ title: 'More than the demand',
        body: `${fmtINR(amount)} is more than the ${fmtINR(t.amount)} outstanding on this demand.`,
        note: 'The extra will sit as an advance against the flat.',
        confirmLabel: 'Record it anyway' })) return;

  const short = isDemand && amount < t.amount - 1;
  if (short && !reason &&
      !await askConfirm({ title: 'Part payment with no reason',
        body: 'A short payment with no explanation is exactly what the Watch flag is built on.',
        confirmLabel: 'Record without a reason' })) return;

  const remark = note || t.label;
  const ok = await askConfirm({
    title: 'Record this receipt?',
    body: `This adds a row to Collections${isDemand ? ' and updates the demand' : ''}. You can undo it straight after.`,
    rows: [
      ['Customer', c.name],
      ['Against', t.label],
      ['Amount', fmtINR(amount) + (gst ? `  (plus GST ${fmtINR(gst)})` : '')],
      ['Source', src === 'Bank' ? 'Bank disbursement' : 'Customer own funds'],
      ['Date received', fmtDate(parseDateInput(date))],
    ].concat(note ? [['Note', note]] : []),
    note: short ? `<b>This is a part payment.</b> ${fmtINR(t.amount - amount)} stays outstanding on this demand.` : '',
    confirmLabel: 'Yes, record it',
  });
  if (!ok) return;

  const entry = { id: uid('r'), date: parseDateInput(date), customer: c.name,
                  wing: c.wing || '', flat: c.flat || '', flatCost: amount, gst,
                  remark, source: src, requestedDate: src === 'Bank' ? parseDateInput(requested) : null,
                  _file: c._file };
  STATE.collections.push(entry);

  let before = null;
  if (isDemand) {
    if (!STATE.milestonePaid[c.name]) STATE.milestonePaid[c.name] = {};
    before = STATE.milestonePaid[c.name][t.id] ? { ...STATE.milestonePaid[c.name][t.id] } : null;
    const newAmt = (before ? (before.amount || 0) : 0) + amount;
    STATE.milestonePaid[c.name][t.id] = {
      amount: newAmt, date,
      reason: newAmt < t.row.amount - 1 ? (reason || (before && before.reason) || '') : '',
    };
  }
  // stamp duty has its own field on the customer record; keep the two in step
  if (t.kind === 'charges') c.stampDutyReceived = (c.stampDutyReceived || 0) + amount;

  COLLECT_UNDO.push({ what: `${fmtINR(amount)} from ${c.name} against ${t.label}`,
                      entryId: entry.id, customer: c.name, customerId: c.id,
                      msId: isDemand ? t.id : null, before,
                      stampAdded: t.kind === 'charges' ? amount : 0 });
  closeReceipt();
  markDirty(c);
  refreshAll();
  renderCollect();
}

/* ================= What this file is missing =================
   The same idea as the collection panel: click a file in the incomplete-data list and get
   that one customer's whole picture, with the issue you clicked highlighted. The difference
   is that every line here is meant to be closed, so where a single field fixes the gap the
   field is right there in the row. No hunting through the full record for the one empty box.
*/
let GAPS_ID = null, GAPS_FOCUS = null, GAPS_FIXED = 0, GAPS_LAST = null, GAPS_QUEUE = [];

function gapsCustomer() { return STATE.customers.find(c => c.id === GAPS_ID) || null; }

function openGaps(id, ruleId) {
  const c = STATE.customers.find(x => x.id === id);
  if (!c) return;
  GAPS_ID = id; GAPS_FOCUS = ruleId || null; GAPS_LAST = null;
  // the queue is snapshotted on open: a file you have just cleared must not vanish out from
  // under the Next button while you are standing on it
  GAPS_QUEUE = gapsQueue();
  if (GAPS_QUEUE.indexOf(id) < 0) GAPS_QUEUE = [id].concat(GAPS_QUEUE);
  document.getElementById('gaps-modal').classList.add('show');
  document.body.classList.add('no-scroll');
  renderGaps();
}
function closeGaps() {
  document.getElementById('gaps-modal').classList.remove('show');
  document.body.classList.remove('no-scroll');
  GAPS_ID = null; GAPS_FOCUS = null; GAPS_LAST = null;
}

/* the files still needing data, in the order the panel lists them -- so Next walks the
   same queue the user was looking at */
function gapsQueue() { return gapReport().map(r => r.c.id); }

function gapFixControl(c, g) {
  const fx = GAP_FIX[g.id];
  if (!fx) return '<span class="muted">Open the full record</span>';
  if (fx.goto) return `<button class="btn-secondary btn-tiny gap-goto" data-rule="${esc(g.id)}">${esc(fx.label)}</button>`;
  if (fx.psno) return `<button class="btn-primary btn-tiny gap-psno">Assign the next number</button>`;
  const v = c[fx.field];
  const idAttr = `data-rule="${esc(g.id)}"`;
  let input;
  if (fx.type === 'bank') {
    const cur = String(v || '').trim().toUpperCase();
    const list = bankList().slice();
    if (cur && list.indexOf(cur) < 0) list.push(cur);
    input = `<select class="gap-in" ${idAttr}><option value="">— not set —</option>` +
      list.map(b => `<option value="${esc(b)}"${b === cur ? ' selected' : ''}>${esc(b)}</option>`).join('') + '</select>';
  } else if (fx.type === 'dlstatus') {
    const src = document.getElementById('f_dlStatus');
    const opts = src ? [...src.options].map(o => o.value) : ['NOT STARTED', 'SANCTIONED', 'PARTLY DISBURSED', 'FULLY DISBURSED'];
    input = `<select class="gap-in" ${idAttr}>` + opts.map(o =>
      `<option value="${esc(o)}"${String(v || '') === o ? ' selected' : ''}>${esc(o || '— not set —')}</option>`).join('') + '</select>';
  } else if (fx.type === 'project') {
    input = `<select class="gap-in" ${idAttr}><option value="">— pick a project —</option>` +
      visibleProjects().map(p => `<option value="${esc(p.id)}"${c.projectId === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('') + '</select>';
  } else if (fx.type === 'tower') {
    input = `<select class="gap-in" ${idAttr}><option value="">— pick a tower —</option>` +
      allTowers().filter(t => !c.projectId || t.project.id === c.projectId)
        .map(t => `<option value="${esc(t.tower.id)}"${c.towerId === t.tower.id ? ' selected' : ''}>${esc(t.project.name)} · ${esc(t.tower.name)}</option>`).join('') + '</select>';
  } else if (fx.type === 'date') {
    input = `<input class="gap-in" type="date" ${idAttr} value="${esc(toISODate(v))}">`;
  } else if (fx.type === 'num') {
    // an empty box invites the figure; a prefilled 0 reads as if something is already there
    input = `<input class="gap-in" type="number" ${idAttr} placeholder="figure" value="${!v ? '' : esc(String(v))}">`;
  } else {
    input = `<input class="gap-in" type="text" ${idAttr} value="${esc(v == null ? '' : String(v))}">`;
  }
  return `<div class="gap-fix">${input}<button class="btn-primary btn-tiny gap-save" ${idAttr}>Save</button></div>
          <div class="gap-why">${esc(fx.label)}</div>`;
}

function renderGaps() {
  const c = gapsCustomer();
  if (!c) { closeGaps(); return; }
  const l = towerOf(c);
  document.getElementById('gaps-title').textContent = c.name || 'Unnamed unit';
  document.getElementById('gaps-sub').textContent =
    [c.psNo, l.project && l.project.name, l.tower && l.tower.name, c.flat].filter(Boolean).join(' · ') || 'No unit details yet';
  document.getElementById('gaps-owner').innerHTML = c.assignedTo
    ? `<span class="lbl">COLLECTION OWNER</span> <b>${esc(c.assignedTo)}</b>${c.assignedPhone ? ` · ${esc(c.assignedPhone)}` : ''}`
    : `<span class="lbl">COLLECTION OWNER</span> <span class="muted">nobody assigned to this unit</span>`;

  // blocking first: those are the ones stopping the file from being tracked at all
  const gaps = dataGaps(c).filter(g => g.sev !== 'info')
    .sort((a, b) => (a.sev === 'crit' ? 0 : 1) - (b.sev === 'crit' ? 0 : 1));
  const crit = gaps.filter(g => g.sev === 'crit').length;
  const warn = gaps.length - crit;
  document.getElementById('gaps-kpis').innerHTML = [
    { l: 'Blocking', v: crit, s: crit ? 'collection tracking is unreliable until these are in' : 'nothing is blocked on this unit', bad: crit > 0 },
    { l: 'Worth fixing', v: warn, s: warn ? 'will bite you later, not today' : 'no warnings left', bad: false },
    { l: 'Closed here', v: GAPS_FIXED, s: GAPS_FIXED ? 'fixed from this panel this session' : 'fix one below and it disappears', good: GAPS_FIXED > 0 },
  ].map(t => `<div class="stat-tile"><div class="label">${t.l}</div>
      <div class="value ${t.bad ? 'crit-txt' : t.good ? 'ok-txt' : ''}">${t.v}</div>
      <div class="sub">${t.s}</div></div>`).join('');

  const note = document.getElementById('gaps-note');
  if (GAPS_LAST) {
    note.style.display = 'flex';
    note.innerHTML = GAPS_LAST.cleared
      ? `<b>Saved.</b> ${esc(GAPS_LAST.what)} is no longer missing.`
      : `<b>Saved.</b> ${esc(GAPS_LAST.what)} still trips its check: ${esc(GAPS_LAST.still || 'the value entered does not clear it')}.`;
  } else note.style.display = 'none';

  document.getElementById('gaps-body').innerHTML = gaps.map(g => {
    const rule = GAP_RULE_BY_ID[g.id] || {};
    return `<tr data-rule="${esc(g.id)}" class="${g.id === GAPS_FOCUS ? 'flash-row' : ''}">
      <td><span class="pill ${g.sev === 'crit' ? 'crit' : 'warn'}">${g.sev === 'crit' ? 'Blocking' : 'Warning'}</span></td>
      <td><b>${esc(g.t)}</b>${rule.hint ? `<div class="sub-line">${esc(rule.hint)}</div>` : ''}</td>
      <td>${gapFixControl(c, g)}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="3" class="empty-row">Nothing missing on this unit. Every check it is subject to passes.</td></tr>`;

  document.querySelectorAll('#gaps-body .gap-save').forEach(b =>
    b.addEventListener('click', () => saveGapFix(b.dataset.rule)));
  document.querySelectorAll('#gaps-body .gap-in').forEach(el =>
    el.addEventListener('keydown', e => { if (e.key === 'Enter') saveGapFix(el.dataset.rule); }));
  document.querySelectorAll('#gaps-body .gap-goto').forEach(b =>
    b.addEventListener('click', () => gotoGapFix(b.dataset.rule)));
  document.querySelectorAll('#gaps-body .gap-psno').forEach(b =>
    b.addEventListener('click', assignGapPsNo));
  const prev = document.getElementById('btn-gaps-prev'), next = document.getElementById('btn-gaps-next');
  prev.disabled = nextGapId(-1) == null;
  next.disabled = nextGapId(1) == null;
  const many = GAPS_QUEUE.length > 1;
  prev.style.visibility = many ? '' : 'hidden';
  next.style.visibility = many ? '' : 'hidden';
  GAPS_FOCUS = null;   // the flash is a one-off
}

async function saveGapFix(ruleId) {
  const c = gapsCustomer(); const fx = GAP_FIX[ruleId];
  if (!c || !fx || !fx.field) return;
  const el = document.querySelector(`#gaps-body .gap-in[data-rule="${CSS.escape(ruleId)}"]`);
  if (!el) return;
  const raw = el.value;
  let v;
  if (fx.type === 'num') {
    if (String(raw).trim() === '') { await askTell({ title: 'Nothing entered', body: 'Type the figure first.' }); return; }
    v = parseFloat(raw);
    if (isNaN(v)) { await askTell({ title: 'Not a number', body: `"${raw}" is not a figure this can use.` }); return; }
  } else if (fx.type === 'date') {
    if (!raw) { await askTell({ title: 'Nothing entered', body: 'Pick the date first.' }); return; }
    v = parseDateInput(raw);
  } else if (fx.type === 'project' || fx.type === 'tower') {
    if (!raw) { await askTell({ title: 'Nothing picked', body: 'Choose one from the list first.' }); return; }
    v = raw;
  } else {
    v = String(raw).trim();
    if (!v && fx.type !== 'bank' && fx.type !== 'dlstatus') {
      await askTell({ title: 'Nothing entered', body: 'Fill the box before saving.' }); return;
    }
    if (fx.field === 'bankOrOwn') v = v.toUpperCase();
  }

  // a unit moving to another tower switches payment schedule: the recorded milestone
  // payments belong to the old stages and cannot follow it across
  if (fx.field === 'towerId' && c.towerId && c.towerId !== v) {
    const hist = STATE.milestonePaid[c.name];
    const n = hist ? Object.keys(hist).length : 0;
    if (n && !await askConfirm({ title: 'Moving this unit to another tower',
          body: 'It switches to that tower\u2019s payment schedule.',
          note: `The <b>${n}</b> recorded milestone payment${n > 1 ? 's' : ''} against the old schedule will be cleared. Collection rows are untouched.`,
          confirmLabel: 'Move it', danger: true })) return;
    if (n) delete STATE.milestonePaid[c.name];
  }

  const before = dataGaps(c).some(g => g.id === ruleId);
  const wasValue = c[fx.field];
  c[fx.field] = v;
  if (fx.field === 'towerId') {
    const t = allTowers().find(x => x.tower.id === v);
    if (t) { c.projectId = t.project.id; c.wing = t.tower.name; }
  }
  if (fx.field === 'projectId') {
    const stillValid = allTowers().some(x => x.tower.id === c.towerId && x.project.id === v);
    if (!stillValid) { c.towerId = null; c.wing = ''; }
  }
  const stillThere = dataGaps(c).find(g => g.id === ruleId);
  if (before && !stillThere) GAPS_FIXED++;
  addWorkNote(c.name, 'fix', 'Closed from the incomplete-data panel',
    `${fx.label}: ${trailValue(fx.field, fx.type === 'num' ? 'num' : fx.type === 'date' ? 'date' : 'text', wasValue)} → ${trailValue(fx.field, fx.type === 'num' ? 'num' : fx.type === 'date' ? 'date' : 'text', c[fx.field])}`);
  GAPS_LAST = { what: fx.label, cleared: !stillThere, still: stillThere ? stillThere.t : '' };
  markDirty(c);
  refreshAll();
  renderGaps();
}

async function assignGapPsNo() {
  const c = gapsCustomer(); if (!c) return;
  c.psNo = psNext(STATE.customers);
  GAPS_FIXED++;
  addWorkNote(c.name, 'fix', 'Client number issued from the incomplete-data panel', `PS client no.: (empty) → ${c.psNo}`);
  GAPS_LAST = { what: `Client number ${c.psNo}`, cleared: true };
  markDirty(c); refreshAll(); renderGaps();
}

/* gaps that need judgement, not a value: take the user to the screen where the judgement
   is made, with the thing to look at highlighted */
function gotoGapFix(ruleId) {
  const c = gapsCustomer(); const fx = GAP_FIX[ruleId];
  if (!c || !fx) return;
  const go = t => document.querySelector(`.mtab-btn[data-mtab="${t}"]`).click();
  closeGaps();
  if (fx.goto === 'record') { go('customers'); openEditor(c.id); if (fx.field) highlightField(fx.field); return; }
  if (fx.goto === 'tower') {
    const l = towerOf(c);
    openSettings('Projects & towers');
    if (l.project) { openProjectEditor(l.project.id); if (l.tower) openTowerEditor(l.tower.id); }
    return;
  }
  if (fx.goto === 'collections') {
    go('collections');
    const inp = document.getElementById('coll-search');
    if (inp) { inp.value = c.name || ''; FILT.coll = inp.value; }
    renderCollections();
    scrollToPanel('coll-body');
    return;
  }
  if (fx.goto === 'timeline') {
    go('customers');
    openEditor(c.id);
    showRecordTab('timeline');
    scrollToPanel('ms-body');
    return;
  }
}

/* draw the eye to the one box that matters once the full record is open */
function highlightField(key) {
  setTimeout(() => {
    const el = revealField(key) || document.getElementById('f_' + key);
    if (!el) return;
    const wrap = el.closest('.fld') || el;
    wrap.classList.remove('field-flash');
    void wrap.offsetWidth;
    wrap.classList.add('field-flash');
    wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
    try { el.focus(); } catch (e) {}
  }, 260);
}

/* the next file in the snapshot that still has something missing -- files cleared along the
   way are stepped over rather than shown as empty */
function nextGapId(dir) {
  let i = GAPS_QUEUE.indexOf(GAPS_ID);
  if (i < 0) i = dir > 0 ? -1 : GAPS_QUEUE.length;
  for (let j = i + dir; j >= 0 && j < GAPS_QUEUE.length; j += dir) {
    const c = STATE.customers.find(x => x.id === GAPS_QUEUE[j]);
    if (c && dataGaps(c).some(g => g.sev !== 'info')) return GAPS_QUEUE[j];
  }
  return null;
}
function stepGaps(dir) {
  const id = nextGapId(dir);
  if (id == null) return;
  GAPS_ID = id; GAPS_LAST = null; GAPS_FOCUS = null;
  renderGaps();
}

/* ---------------- undo ---------------- */
function renderUndo() {
  const el = document.getElementById('collect-undo');
  if (!el) return;
  if (!COLLECT_UNDO.length) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = 'flex';
  const last = COLLECT_UNDO[COLLECT_UNDO.length - 1];
  el.innerHTML = `<span>Added <b>${esc(last.what)}</b>.</span>
    <button class="btn-tiny danger" id="btn-collect-undo" type="button">Undo that</button>
    <span class="muted">${COLLECT_UNDO.length} entr${COLLECT_UNDO.length===1?'y':'ies'} added this session</span>`;
  document.getElementById('btn-collect-undo').addEventListener('click', undoLastReceipt);
}
async function undoLastReceipt() {
  const u = COLLECT_UNDO[COLLECT_UNDO.length - 1];
  if (!u) return;
  if (!await askConfirm({ title: 'Roll this back?',
        body: `<b>${esc(u.what)}</b> will be removed from Collections${u.msId ? ' and the demand goes back to exactly what it was.' : '.'}`,
        confirmLabel: 'Yes, roll it back', danger: true })) return;
  COLLECT_UNDO.pop();
  STATE.collections = STATE.collections.filter(e => e.id !== u.entryId);
  if (u.msId) {
    const m = STATE.milestonePaid[u.customer];
    if (m) {
      if (u.before) m[u.msId] = u.before; else delete m[u.msId];
      if (!Object.keys(m).length) delete STATE.milestonePaid[u.customer];
    }
  }
  const owner = STATE.customers.find(x => x.id === u.customerId);
  if (u.stampAdded && owner) owner.stampDutyReceived = Math.max(0, (owner.stampDutyReceived || 0) - u.stampAdded);
  markDirty(owner);
  refreshAll();
  if (COLLECT_ID) renderCollect();
}
