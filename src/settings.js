/* ================= Settings =================
   Everything the tool used to hardcode: which data checks run, how serious each one is,
   what it says, and the threshold numbers: lives here and is saved into the workbook,
   so the configuration travels with the builder file instead of one browser.
*/
const NUM_SETTINGS = [
  { k: 'watchThreshold', l: 'Flag "Watch" after this many partial payments', min: 1, max: 20, step: 1,
    hint: 'A single short payment happens; a pattern is what you want to see.' },
  { k: 'greenDays', l: 'Green: average delay up to (days)', min: 0, max: 120, step: 1,
    hint: 'Average across every payment the customer has made.' },
  { k: 'yellowDays', l: 'Yellow: average delay up to (days)', min: 1, max: 365, step: 1,
    hint: 'Anything beyond this is Red.' },
  { k: 'bankLeadPercentile', l: 'Plan bank lead time at this percentile', min: 50, max: 99, step: 1,
    hint: '75 means three demands in four should land on time. Raise it to be safer, lower it to chase less early.' },
  { k: 'bankLeadFloor', l: 'Never chase a bank less than (days) ahead', min: 0, max: 90, step: 1,
    hint: 'A floor for banks that look fast on thin history.' },
  { k: 'horizonDays', l: 'Default "coming up" window (days)', min: 7, max: 365, step: 1,
    hint: 'What Action Items opens on.' },
  { k: 'stampDutyPct', l: 'Default stamp duty %', min: 0, max: 20, step: 0.01,
    hint: 'Starting value for new customers: always overridable per unit.' },
  { k: 'registrationAmt', l: 'Default registration charges (₹)', min: 0, max: 1000000, step: 1000, hint: '' },
  { k: 'gstPct', l: 'Default GST %', min: 0, max: 30, step: 0.01, hint: '' },
  { k: 'editorCols', l: 'Columns on the customer form', min: 1, max: 5, step: 1,
    hint: 'How many fields sit side by side. Stepped down automatically on a narrow window.' },
  { k: 'rowsPerPage', l: 'Rows per page in every listing', min: 5, max: 200, step: 5,
    hint: 'What each table opens on. Every listing also has its own Rows selector.' },
];

/* ================= Settings sections =================
   Onboarding a builder partner and laying out a project's towers are once-in-a-while jobs:
   they used to be two of the seven things on the top bar, competing for attention with the
   work that happens every day. They live in here now, behind a section strip so the modal
   does not become one endless scroll. */
const SET_SECTION_ORDER = ['Builder partners', 'Projects & towers', 'MIS reports folder',
  'Data checks', 'Required fields', 'Banks & NBFCs', 'Thresholds & defaults'];
let SET_SECTION = null;

function setupSettingsSections() {
  const modal = document.querySelector('#settings-modal .card2');
  if (!modal || modal.dataset.sectioned) return;
  modal.dataset.sectioned = '1';

  const adopt = (panelId, title) => {
    const src = document.getElementById(panelId);
    if (!src) return;
    const sec = document.createElement('div');
    sec.className = 'set-section';
    const h = document.createElement('h4');
    h.textContent = title;
    sec.appendChild(h);
    while (src.firstChild) sec.appendChild(src.firstChild);
    src.remove();
    modal.appendChild(sec);
  };
  adopt('mtab-builders', 'Builder partners');
  adopt('mtab-projects', 'Projects & towers');

  const nav = document.getElementById('set-nav');
  const secs = [...modal.querySelectorAll('.set-section')];
  secs.forEach(sec => { sec.dataset.setSec = (sec.querySelector('h4') || {}).textContent || ''; });
  const ordered = SET_SECTION_ORDER.map(t => secs.find(s => s.dataset.setSec === t)).filter(Boolean)
    .concat(secs.filter(s => !SET_SECTION_ORDER.includes(s.dataset.setSec)));
  ordered.forEach(sec => {
    modal.appendChild(sec);
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = sec.dataset.setSec;
    b.dataset.setSec = sec.dataset.setSec;
    b.addEventListener('click', () => showSettingsSection(sec.dataset.setSec));
    nav.appendChild(b);
  });
  showSettingsSection(ordered.length ? ordered[0].dataset.setSec : null);
}

function showSettingsSection(title) {
  SET_SECTION = title;
  document.querySelectorAll('#settings-modal .set-section').forEach(s =>
    s.classList.toggle('set-hidden', s.dataset.setSec !== title));
  document.querySelectorAll('#set-nav button').forEach(b =>
    b.classList.toggle('active', b.dataset.setSec === title));
  const body = document.querySelector('#settings-modal .card2');
  if (body) body.scrollTop = 0;
  if (title === 'Builder partners') { try { renderBuilderList(); } catch (e) {} }
  if (title === 'Projects & towers') { try { renderProjectList(); } catch (e) {} }
}

function openSettings(section) {
  setupSettingsSections();
  document.getElementById('settings-modal').classList.add('show');
  renderSettings();
  if (section) showSettingsSection(section);
}
function closeSettings() { document.getElementById('settings-modal').classList.remove('show'); }

function renderSettings() {
  renderFolderSetting();
  // ---- thresholds ----
  document.getElementById('set-nums').innerHTML = NUM_SETTINGS.map(n => `
    <div class="fld">
      <label>${esc(n.l)}</label>
      <input type="number" class="set-num" data-k="${n.k}" value="${cfg(n.k)}"
             min="${n.min}" max="${n.max}" step="${n.step}">
      ${n.hint ? `<div class="set-hint">${esc(n.hint)}</div>` : ''}
    </div>`).join('');

  // ---- data checks, with a live count of how many files each one is firing on ----
  const firing = {};
  visibleCustomers().forEach(c => dataGaps(c).forEach(g => { firing[g.id] = (firing[g.id] || 0) + 1; }));
  document.getElementById('set-rules').innerHTML = GAP_RULES.map(r => {
    const s = gapSetting(r);
    const n = firing[r.id] || 0;
    return `<tr class="${s.on ? '' : 'rule-off'}">
      <td><label class="chk"><input type="checkbox" class="rule-on" data-id="${r.id}" ${s.on ? 'checked' : ''}> on</label></td>
      <td>
        <select class="rule-sev" data-id="${r.id}">
          <option value="crit" ${s.sev === 'crit' ? 'selected' : ''}>Blocking</option>
          <option value="warn" ${s.sev === 'warn' ? 'selected' : ''}>Warning</option>
        </select>
      </td>
      <td><input class="rule-msg" data-id="${r.id}" value="${esc(s.msg)}">
        <div class="set-hint">${esc(r.hint || '')}${/\{\w+\}/.test(r.msg) ? ' <b>{…}</b> is filled in with the real figure.' : ''}</div></td>
      <td class="num">${n ? `<span class="pill ${s.sev === 'crit' ? 'crit' : 'warn'}">${n}</span>` : '<span class="muted">0</span>'}</td>
    </tr>`;
  }).join('');

  document.querySelectorAll('.rule-on').forEach(el => el.addEventListener('change', () => setRule(el.dataset.id, { on: el.checked })));
  document.querySelectorAll('.rule-sev').forEach(el => el.addEventListener('change', () => setRule(el.dataset.id, { sev: el.value })));
  document.querySelectorAll('.rule-msg').forEach(el => el.addEventListener('input', () => setRule(el.dataset.id, { msg: el.value }, true)));
  document.querySelectorAll('.set-num').forEach(el => el.addEventListener('change', () => {
    const v = parseFloat(el.value);
    if (!isNaN(v)) { CONFIG[el.dataset.k] = v; afterSettingsChange(); }
  }));

  renderRequiredSettings();
  renderBankSettings();
  applyFieldHelp(document.getElementById('settings-modal'));

  const off = GAP_RULES.filter(r => !gapSetting(r).on).length;
  document.getElementById('set-summary').innerHTML =
    `${GAP_RULES.length - off} of ${GAP_RULES.length} checks running · ` +
    `${Object.values(firing).reduce((a, b) => a + b, 0)} flags across ${visibleCustomers().length} units in view`;
}

function setRule(id, patch, quiet) {
  if (!CONFIG.gaps) CONFIG.gaps = {};
  CONFIG.gaps[id] = { ...gapSetting(GAP_RULE_BY_ID[id]), ...CONFIG.gaps[id], ...patch };
  afterSettingsChange(quiet);
}
function afterSettingsChange(quiet) {
  // settings are written into every workbook, so every open file has something new to save
  FILES.forEach(f => markDirty(f.id));
  applyEditorCols();
  resetAllPagers();
  try { refreshAll(); } catch (e) { console.error(e); }
  if (!quiet) renderSettings();
  else {
    // typing a message shouldn't yank focus, so just refresh the firing counts
    const firing = {};
    visibleCustomers().forEach(c => dataGaps(c).forEach(g => { firing[g.id] = (firing[g.id] || 0) + 1; }));
    document.getElementById('set-summary').innerHTML =
      `${GAP_RULES.filter(r => gapSetting(r).on).length} of ${GAP_RULES.length} checks running · ` +
      `${Object.values(firing).reduce((a, b) => a + b, 0)} flags across ${visibleCustomers().length} units in view`;
  }
}
async function resetSettings() {
  if (!await askConfirm({ title: 'Reset every setting?',
        body: 'Every check, message, threshold, required field and the lender list go back to the shipped defaults.',
        confirmLabel: 'Reset them', danger: true })) return;
  resetConfig();
  FILES.forEach(f => markDirty(f.id));
  refreshAll();
  renderSettings();
}

/* ---- required fields ---- */
const REQ_FORM_LABEL = { customer: 'Customer', project: 'Project', tower: 'Tower' };

function renderRequiredSettings() {
  const cust = visibleCustomers();
  const towers = [];
  STATE.projects.forEach(p => (p.towers || []).forEach(t => towers.push(t)));
  const missCount = r => {
    if (r.form === 'customer') return cust.filter(c => reqIsEmpty(r, c)).length;
    if (r.form === 'project') return STATE.projects.filter(p => reqIsEmpty(r, p)).length;
    return towers.filter(t => reqIsEmpty(r, { name: t.name, possession: t.possessionTarget, schedule: t.schedule })).length;
  };
  let totalMissing = 0;
  document.getElementById('set-req').innerHTML = REQ_RULES.map(r => {
    const on = reqOn(r);
    const n = missCount(r);
    if (on) totalMissing += n;
    return `<tr class="${on ? '' : 'rule-off'}">
      <td><label class="chk"><input type="checkbox" class="req-on" data-id="${r.id}" ${on ? 'checked' : ''}> required</label></td>
      <td>${REQ_FORM_LABEL[r.form]}</td>
      <td><b>${esc(r.label)}</b></td>
      <td><div class="set-hint" style="margin:0;">${esc(r.why)}</div></td>
      <td class="num">${n ? `<span class="pill ${on ? 'crit' : 'warn'}">${n}</span>` : '<span class="muted">0</span>'}</td>
    </tr>`;
  }).join('');
  document.querySelectorAll('.req-on').forEach(el =>
    el.addEventListener('change', () => { setReq(el.dataset.id, el.checked); renderSettings(); }));
  const on = REQ_RULES.filter(reqOn).length;
  document.getElementById('set-req-summary').innerHTML =
    `${on} of ${REQ_RULES.length} fields are mandatory · ` +
    (totalMissing
      ? `<b>${totalMissing}</b> existing record${totalMissing > 1 ? 's are' : ' is'} missing one: they stay saved, but the next edit will ask for it`
      : 'every existing record satisfies them');
}

/* ---- banks & NBFCs ---- */
function bankUsage() {
  const u = {};
  STATE.customers.forEach(c => {
    const k = String(c.bankOrOwn || '').trim().toUpperCase();
    if (k) u[k] = (u[k] || 0) + 1;
  });
  return u;
}

function renderBankSettings() {
  const use = bankUsage();
  const list = bankList();
  // a lender typed into an older file that never made it onto the list
  const orphan = Object.keys(use).filter(k => list.indexOf(k) < 0);
  document.getElementById('set-banks').innerHTML =
    list.concat(orphan).map(b => {
      const n = use[b] || 0;
      const fixed = (b === OWN_FUNDS);
      const isOrphan = orphan.indexOf(b) >= 0;
      return `<span class="bank-chip${n || fixed ? ' in-use' : ''}" title="${isOrphan ? 'On a customer file but not on the list' : ''}">
        <span class="n" data-bank="${esc(b)}">${esc(b)}</span>
        ${n ? `<span class="u">${n}</span>` : ''}
        ${isOrphan ? '<span class="u">add</span>' : ''}
        ${fixed || n ? '' : `<button class="bank-del" data-bank="${esc(b)}" title="Remove">&times;</button>`}
      </span>`;
    }).join('') || '<span class="set-hint">No lenders yet.</span>';

  document.querySelectorAll('.bank-del').forEach(el => el.addEventListener('click', () => {
    removeBank(el.dataset.bank); afterSettingsChange();
  }));
  document.querySelectorAll('.bank-chip .n').forEach(el => el.addEventListener('click', async () => {
    const from = el.dataset.bank;
    if (from === OWN_FUNDS) return;
    if (bankList().indexOf(from) < 0) { addBank(from); afterSettingsChange(); return; }
    const inUse = bankUsage()[from] || 0;
    const to = await askInput({ title: 'Rename this lender', label: 'New name',
      value: from, confirmLabel: 'Rename it',
      note: inUse ? `<b>${inUse}</b> customer file${inUse===1?'':'s'} currently on <b>${esc(from)}</b> will be renamed too.` : '' });
    if (!to || !to.trim()) return;
    const k = to.trim().toUpperCase();
    renameBank(from, k);
    STATE.customers.forEach(c => {
      if (String(c.bankOrOwn || '').trim().toUpperCase() === from) c.bankOrOwn = k;
    });
    afterSettingsChange();
  }));

  const inUse = Object.keys(use).filter(k => k !== OWN_FUNDS).length;
  document.getElementById('set-bank-note').textContent =
    `${bankList().length - 1} lenders on the list · ${inUse} in use here` +
    (orphan.length ? ` · ${orphan.length} used but not listed: click to add` : '');
}

function addBankFromInput() {
  const el = document.getElementById('set-bank-new');
  const v = (el.value || '').trim();
  if (!v) return;
  if (!addBank(v)) { notify(`"${v.toUpperCase()}" is already on the list.`); return; }
  el.value = '';
  afterSettingsChange();
}
