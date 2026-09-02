/* ================= Mandatory fields =================
   Which fields a record cannot be saved without. Same shape as the data checks: a
   declarative list, every entry switchable from the gear icon, and the whole thing
   saved into the workbook so the rule set travels with the builder file.

   The line between this and a data check: a data CHECK flags a file you can still work
   with. A REQUIRED field is one where the record is not usable at all without it -- every
   downstream number, report and demand letter depends on it -- so the save is refused.
*/
const REQ_RULES = [
  /* ---- customer ---- */
  { id: 'c.projectId', form: 'customer', field: 'projectId', el: 'f_projectId',
    label: 'Project', def: true,
    why: 'Nothing can be grouped, filtered or reported without it.' },
  { id: 'c.towerId', form: 'customer', field: 'towerId', el: 'f_towerId',
    label: 'Tower / wing', def: true,
    why: 'The tower carries the payment schedule this unit is billed against.' },
  { id: 'c.psNo', form: 'customer', field: 'psNo', el: 'f_psNo',
    label: 'PS client no.', def: true,
    why: 'The Perfect Solutions reference this client is known by everywhere.' },
  { id: 'c.name', form: 'customer', field: 'name', el: 'f_name',
    label: 'Customer name', def: true,
    why: 'Collections and the payment timeline are matched to a customer by name.' },
  { id: 'c.flat', form: 'customer', field: 'flat', el: 'f_flat',
    label: 'Flat no.', def: true,
    why: 'Identifies the unit inside the tower.' },
  { id: 'c.contact', form: 'customer', field: 'contact', el: 'f_contact',
    label: 'Contact number', def: false,
    why: 'You cannot chase a payment you have no number for.' },
  { id: 'c.salableArea', form: 'customer', field: 'salableArea', el: 'f_salableArea',
    label: 'Total salable area', def: true, numeric: true,
    why: 'Area drives the rate-based value of the unit.' },
  { id: 'c.agreementValueIndex', form: 'customer', field: 'agreementValueIndex', el: 'f_agreementValueIndex',
    label: 'Agreement value', def: true, numeric: true,
    why: 'Every demand, every percentage and every balance is a share of this figure.' },
  { id: 'c.bookingDate', form: 'customer', field: 'bookingDate', el: 'f_bookingDate',
    label: 'Booking date', def: false,
    why: 'Start of the schedule when a stage carries no date of its own.' },
  { id: 'c.dlStatus', form: 'customer', field: 'dlStatus', el: 'f_dlStatus',
    label: 'Loan status', def: true,
    why: 'Decides whether a demand waits on the bank or on the customer.' },
  { id: 'c.bankOrOwn', form: 'customer', field: 'bankOrOwn', el: 'f_bankOrOwn',
    label: 'Bank / own funds', def: true,
    why: 'Bank-wise grouping and disbursement lead times are keyed to it.' },
  { id: 'c.assignedTo', form: 'customer', field: 'assignedTo', el: 'f_assignedTo',
    label: 'Assigned to', def: false,
    why: 'A file nobody owns is a file nobody chases.' },
  { id: 'c.pan', form: 'customer', field: 'pan', el: 'f_pan',
    label: 'PAN number', def: false,
    why: 'Needed for TDS and for the loan file.' },

  /* ---- project ---- */
  { id: 'p.name', form: 'project', field: 'name', el: 'pf_name',
    label: 'Project name', def: true, why: 'The project has to be nameable to be reported on.' },
  { id: 'p.builder', form: 'project', field: 'builder', el: 'pf_builder',
    label: 'Builder name', def: true, why: 'Whose business this project is.' },
  { id: 'p.address', form: 'project', field: 'address', el: 'pf_address',
    label: 'Project address', def: false, why: 'Goes onto demand letters and notices.' },

  /* ---- tower ---- */
  { id: 't.name', form: 'tower', field: 'name', el: 'tf_name',
    label: 'Tower / wing name', def: true, why: 'Units are grouped and delivered by tower.' },
  { id: 't.possession', form: 'tower', field: 'possession', el: 'tf_possession',
    label: 'Possession target', def: true,
    why: 'The end of the schedule: undated stages are interpolated up to it.' },
  { id: 't.schedule', form: 'tower', field: 'schedule', el: null,
    label: 'Payment schedule', def: true, special: 'schedule',
    why: 'Without stages there is nothing to bill and nothing to chase.' },
  { id: 't.schedule100', form: 'tower', field: 'schedule', el: null,
    label: 'Schedule totalling 100%', def: false, special: 'schedule100',
    why: 'Stages that do not add to 100% either under-bill or over-bill every unit in the tower.' },
];
const REQ_BY_ID = {};
REQ_RULES.forEach(r => { REQ_BY_ID[r.id] = r; });

function reqOn(r) {
  const o = (CONFIG.req || {})[r.id];
  return (o && typeof o.on === 'boolean') ? o.on : r.def;
}
function setReq(id, on) {
  if (!CONFIG.req) CONFIG.req = {};
  CONFIG.req[id] = { on: !!on };
  FILES.forEach(f => markDirty(f.id));
  try { refreshAll(); } catch (e) { console.error(e); }
}

function reqIsEmpty(r, obj) {
  if (r.special === 'schedule') return !(obj.schedule && obj.schedule.length);
  if (r.special === 'schedule100') {
    const t = (obj.schedule || []).reduce((a, s) => a + (parseFloat(s.pct) || 0), 0);
    return Math.abs(t * 100 - 100) > 0.5;
  }
  const v = obj[r.field];
  if (r.numeric) return !(parseFloat(v) > 0);
  return v == null || String(v).trim() === '';
}

/* returns [{ rule, msg }] for everything missing on this record */
function requiredMissing(form, obj) {
  return REQ_RULES.filter(r => r.form === form && reqOn(r) && reqIsEmpty(r, obj))
    .map(r => ({ rule: r, msg: r.special === 'schedule100'
      ? `${r.label}: the stages do not add up to 100%`
      : `${r.label} is required` }));
}

/* paints the offending fields red, scrolls to the first one, returns true if it blocked */
function enforceRequired(form, obj, scopeId) {
  const scope = document.getElementById(scopeId) || document;
  // only this form's own fields -- the tower editor lives INSIDE the project editor, so a
  // blanket clear would wipe the other one's markers on every save.
  clearFormMarks(form);
  const miss = requiredMissing(form, obj);
  if (!miss.length) return false;
  let first = null;
  miss.forEach(({ rule, msg }) => {
    if (!rule.el) return;
    const input = document.getElementById(rule.el);
    const fld = input && input.closest('.fld');
    if (!fld) return;
    // the box may be behind a tab or a collapsed section: no point marking what cannot be seen
    if (scopeId === 'cust-editor') { const sec = fld.closest('.form-section');
      if (sec) { sec.classList.remove('collapsed'); } }
    fld.classList.add('missing');
    const e = document.createElement('div');
    e.className = 'fld-err';
    e.textContent = msg.replace(rule.label, '').trim().replace(/^, \s*/, '') || 'required';
    fld.appendChild(e);
    if (!first) first = input;
  });
  const banner = scope.querySelector(':scope > .req-banner') || scope.querySelector('.req-banner');
  const text = `Cannot save: ${miss.length} required field${miss.length > 1 ? 's are' : ' is'} still empty: `
             + miss.map(m => m.rule.label).join(', ') + '.';
  if (banner) { banner.textContent = text; banner.style.display = 'block'; }
  else notify(text);
  if (first) {
    if (scopeId === 'cust-editor') revealField(first.id.replace(/^f_/, ''));
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    try { first.focus(); } catch (e) {}
  }
  return true;
}

function clearFormMarks(form) {
  REQ_RULES.filter(r => !form || r.form === form).forEach(r => {
    if (!r.el) return;
    const input = document.getElementById(r.el);
    const fld = input && input.closest('.fld');
    if (!fld) return;
    fld.classList.remove('missing');
    const m = fld.querySelector('.fld-err'); if (m) m.remove();
  });
}
function clearRequiredBanner(scopeId) {
  const scope = document.getElementById(scopeId);
  if (!scope) return;
  const b = scope.querySelector(':scope > .req-banner') || scope.querySelector('.req-banner');
  if (b) b.style.display = 'none';
  clearFormMarks(null);
}

/* marks every mandatory field's label with the required styling, live from the config */
function paintRequiredMarks() {
  REQ_RULES.forEach(r => {
    if (!r.el) return;
    const input = document.getElementById(r.el);
    const fld = input && input.closest('.fld');
    if (!fld) return;
    fld.classList.toggle('req', reqOn(r));
  });
}
