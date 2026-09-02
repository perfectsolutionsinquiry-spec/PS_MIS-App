/* ================= Dashboard data adapter =================
   The dashboard renders from the SAME in-memory STATE the entry forms edit,
   filtered by the Project / Tower context bar. No second parse of the file.
*/
let DATA = null;
let OVERRIDES = {};
let CURRENT_CUSTOMER = null;
const CATS = ['--series-1','--series-2','--series-3','--series-4','--series-5','--series-6','--series-7','--series-8'];

function fmtCompact(n){
  const sign = n < 0 ? '-' : '';
  n = Math.abs(n);
  if (n >= 1e7) return sign + (n/1e7).toFixed(2).replace(/\.00$/,'') + 'Cr';
  if (n >= 1e5) return sign + (n/1e5).toFixed(2).replace(/\.00$/,'') + 'L';
  if (n >= 1e3) return sign + (n/1e3).toFixed(1).replace(/\.0$/,'') + 'K';
  return sign + n.toString();
}
function fmtINR(n){
  if (n == null || isNaN(n)) return '–';
  n = Math.round(n);
  const neg = n < 0; n = Math.abs(n);
  let s = n.toString(), last3 = s.slice(-3), rest = s.slice(0, -3);
  if (rest !== '') last3 = ',' + last3;
  rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (neg?'-':'') + '₹' + rest + last3;
}
function fmtDate(iso){
  if (!iso) return '–';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '–';
  return d.toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'});
}
function titleCase(s){ return (s||'').toString().toLowerCase().split(' ')
  .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); }

const tooltip = document.getElementById('tooltip');
function showTip(evt, html){ tooltip.innerHTML = html; tooltip.classList.add('show'); moveTip(evt); }
function moveTip(evt){ tooltip.style.left = evt.clientX + 'px'; tooltip.style.top = evt.clientY + 'px'; }
function hideTip(){ tooltip.classList.remove('show'); }

function isoLocalDate(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function buildDashboardData(){
  const custs = visibleCustomers();
  const today = new Date();
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const customers = [], payment_timeline = [];
  custs.forEach(c0 => {
    const link = towerOf(c0);
    const schedule = link.tower ? link.tower.schedule : [];
    const cc = toCalcCustomer(c0);
    const d = deriveCustomer(cc, sumRecoveryFor(c0.name), schedule);
    customers.push({
      id: c0.id,
      name: c0.name,
      project: link.project ? link.project.name : '',
      tower: link.tower ? link.tower.name : (c0.wing || ''),
      wing: link.tower ? link.tower.name : (c0.wing || ''),
      flat: c0.flat || '', type_: c0.type || '',
      agreement_value: cc.agreementValueIndex || 0,
      due: d.AI, received: d.AJ, balance: d.AM,
      loan_amt: cc.loanAmount || 0,
      bank: (c0.bankOrOwn ? String(c0.bankOrOwn).trim().toUpperCase() : 'OWN FUNDS'),
      dl_status: (c0.dlStatus ? String(c0.dlStatus).trim().toUpperCase() : 'NOT STARTED'),
      gst_due: d.AD, gst_received: d.AZ, gst_balance: d.BA,
      ocr_amt: cc.ocrAmt || 0, ocr_paid: cc.ocrPaid || 0,
      file_no: c0.fileNo || '', bankers_no: c0.bankersNo || '',
    });

    const cum = scheduleCumPct(schedule);
    const paid = STATE.milestonePaid[c0.name] || {};
    schedule.forEach((m, i) => {
      const due = stageDueDate(m, cc.bookingDate, cc.possessionDate, cum[i]);
      const p = paid[m.id] || null;
      const payment = p ? { amount: p.amount, date: parseDateInput(p.date) } : null;
      const amountDue = d.milestoneAmounts[i];
      const status = milestoneStatus(due, payment, amountDue, today);
      const delay = milestoneDelay(due, payment);
      payment_timeline.push({
        customerId: c0.id, customer: c0.name, flat: c0.flat || '',
        unit: `${link.tower ? link.tower.name : c0.wing}-${c0.flat}`,
        project: link.project ? link.project.name : '', tower: link.tower ? link.tower.name : '',
        milestone: m.label, milestone_pct: m.pct, amount: amountDue,
        due_date: due ? due.toISOString() : null,
        status,
        amount_paid: payment ? payment.amount : null,
        paid_date: payment && payment.date ? payment.date.toISOString() : null,
        delay: delay,
        reason: p ? (p.reason || '') : '',
      });
    });
  });

  const sum = (k) => customers.reduce((s, c) => s + (c[k] || 0), 0);
  const total_agreement = sum('agreement_value'), total_due = sum('due');
  const total_received = sum('received'), total_loan = sum('loan_amt');
  // arrears only -- one buyer's advance must not net off another's arrears
  const total_balance = customers.reduce((s, c) => s + (c.balance > 0 ? c.balance : 0), 0);
  const total_advance = customers.reduce((s, c) => s + (c.balance < 0 ? -c.balance : 0), 0);
  const units = customers.length;
  const bankFiles = customers.filter(c => c.bank && c.bank !== 'OWN FUNDS').length;

  const statusMap = {};
  customers.forEach(c => {
    if (!statusMap[c.dl_status]) statusMap[c.dl_status] = { count: 0, value: 0 };
    statusMap[c.dl_status].count++;
    statusMap[c.dl_status].value += c.loan_amt;
  });
  const ORDER = ['SANCTIONED','PARTLY DISBURSED','FULLY DISBURSED','NOT STARTED'];
  const status_dist = [];
  ORDER.forEach(s => { if (statusMap[s]) status_dist.push({ status: s, count: statusMap[s].count, value: statusMap[s].value }); });
  Object.keys(statusMap).forEach(s => { if (!ORDER.includes(s)) status_dist.push({ status: s, count: statusMap[s].count, value: statusMap[s].value }); });

  const customer_balance = customers.map(c => ({ name: c.name, balance: c.balance })).sort((a, b) => b.balance - a.balance);
  const bankMap = {};
  customers.forEach(c => { bankMap[c.bank] = (bankMap[c.bank] || 0) + c.loan_amt; });
  const bank_loan = Object.keys(bankMap).map(k => ({ bank: k, amount: bankMap[k] })).sort((a, b) => b.amount - a.amount);

  const names = new Set(customers.map(c => c.name));
  const byDate = {}, order = [];
  STATE.collections.forEach(e => {
    if (!names.has(e.customer)) return;
    const dt = (e.date instanceof Date) ? e.date : new Date(e.date);
    if (isNaN(dt.getTime())) return;
    // LOCAL date, not UTC. toISOString() shifts every Indian date back one day
    // (IST is UTC+5:30), so receipts were bucketed into the wrong day -- and the
    // wrong week and month at every boundary -- while the bar label used getDate().
    const key = isoLocalDate(dt);
    if (!byDate[key]) { byDate[key] = { dt, flat_cost: 0, gst: 0 }; order.push(key); }
    byDate[key].flat_cost += (e.flatCost || 0);
    byDate[key].gst += (e.gst || 0);
  });
  order.sort();
  const daily = order.map(k => {
    const e = byDate[k];
    return { iso: k, day: monthNames[e.dt.getMonth()] + ' ' + e.dt.getDate(), flat_cost: e.flat_cost, gst: e.gst, total: e.flat_cost + e.gst };
  });

  return {
    generated: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    kpis: {
      total_agreement, total_received, total_balance, total_advance, total_loan, units, bankFiles,
      collection_pct: total_agreement ? Math.round(total_received / total_agreement * 1000) / 10 : 0,
      due_collection_pct: total_due ? Math.round(total_received / total_due * 1000) / 10 : 0,
      balance_pct_of_due: total_due ? Math.round(total_balance / total_due * 1000) / 10 : 0,
      total_due,
    },
    status_dist, customer_balance, bank_loan, daily, customers, payment_timeline,
  };
}
