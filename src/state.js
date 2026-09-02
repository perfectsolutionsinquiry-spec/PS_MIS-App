/* ================= App state =================
   ONE file per builder:  projects[] -> towers[] -> customers, collections, milestone payments.
   The dashboard renders from this same STATE, filtered by the Project / Tower context bar.
*/
let STATE = { projects: [], customers: [], collections: [], milestonePaid: {}, workNotes: {},
              builders: {} };   // builders[partnerName] = that builder partner's own record
// milestonePaid[customerName][milestoneId] = {amount, date:'YYYY-MM-DD', reason}
let CTX = { projectId: 'all', towerId: 'all', partner: 'all' };   // global Project / Tower selection
let BASE_WORKBOOK_BYTES = null;
let SOURCE_LABEL = 'Nothing loaded yet';
let DIRTY = false;

let EDIT_BUFFER = null;          // customer being edited
let CURRENT_CUSTOMER_ID = null;
let PROJ_BUF = null;             // project being edited
let CURRENT_PROJECT_ID = null;
let TOWER_BUF = null;            // tower being edited (inside PROJ_BUF)
let CURRENT_TOWER_ID = null;

let _seq = 0;
function uid(prefix) { return (prefix || 'x') + (++_seq) + '_' + Date.now().toString(36); }

/* ---------------- formatting ---------------- */
function toISODate(d) {
  if (!d) return '';
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function parseDateInput(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const d = new Date(v + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}
function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ---------------- lookups ---------------- */
function projectById(id) { return STATE.projects.find(p => p.id === id) || null; }
function towerOf(c) {
  const p = c && c.projectId ? projectById(c.projectId) : null;
  if (!p) return { project: null, tower: null };
  return { project: p, tower: (c.towerId ? p.towers.find(t => t.id === c.towerId) : null) || null };
}
function scheduleForCustomer(c) { const l = towerOf(c); return l.tower ? l.tower.schedule : []; }
function allTowers(includeHidden) {
  const out = [];
  (includeHidden ? STATE.projects : visibleProjects())
    .forEach(p => p.towers.forEach(t => out.push({ project: p, tower: t })));
  return out;
}
function customersOfTower(towerId) { return STATE.customers.filter(c => c.towerId === towerId); }
function customersOfProject(projectId) { return STATE.customers.filter(c => c.projectId === projectId); }

/* ---------------- context filter ---------------- */
function visibleCustomers() {
  return STATE.customers.filter(c => {
    if (!fileSelected(c._file)) return false;
    if (CTX.projectId !== 'all' && c.projectId !== CTX.projectId) return false;
    if (CTX.towerId !== 'all' && c.towerId !== CTX.towerId) return false;
    return true;
  });
}
function ctxProject() { return CTX.projectId === 'all' ? null : projectById(CTX.projectId); }
function ctxTower() {
  const p = ctxProject();
  if (!p || CTX.towerId === 'all') return null;
  return p.towers.find(t => t.id === CTX.towerId) || null;
}
function ctxLabel() {
  const p = ctxProject(), t = ctxTower();
  if (!p) return 'All projects';
  return p.name + (t ? ' · Tower ' + t.name : ' · all towers');
}

/* the projects you can pick from: only those in the files currently selected */
function visibleProjects() { return STATE.projects.filter(p => fileSelected(p._file)); }
/* Every builder partner we know of, whether or not they have a project yet. A partner
   onboarded this morning has nothing under them, and must still be pickable -- otherwise
   there is no way to give them their first project. */
function partnersList() {
  const out = [];
  FILES.forEach(f => { if (f.partner && out.indexOf(f.partner) < 0) out.push(f.partner); });
  Object.keys(STATE.builders || {}).forEach(n => { if (n && out.indexOf(n) < 0) out.push(n); });
  return out.sort();
}

function renderContextBar() {
  renderFileBar();
  const ps = document.getElementById('ctx_project');
  const ts = document.getElementById('ctx_tower');
  const vis = visibleProjects();
  ps.innerHTML = '<option value="all">All projects</option>' +
    vis.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  if (CTX.projectId !== 'all' && !vis.some(p => p.id === CTX.projectId)) CTX.projectId = 'all';
  if (CTX.projectId !== 'all' && !projectById(CTX.projectId)) CTX.projectId = 'all';
  ps.value = CTX.projectId;

  const p = ctxProject();
  if (!p) {
    ts.innerHTML = '<option value="all">All towers</option>';
    CTX.towerId = 'all';
    ts.value = 'all';
    ts.disabled = true;
  } else {
    ts.disabled = false;
    ts.innerHTML = '<option value="all">All towers</option>' +
      p.towers.map(t => `<option value="${t.id}">Tower ${esc(t.name)}</option>`).join('');
    if (CTX.towerId !== 'all' && !p.towers.some(t => t.id === CTX.towerId)) CTX.towerId = 'all';
    ts.value = CTX.towerId;
  }
  const n = visibleCustomers().length;
  const scope = !FILES.length ? 'Nothing loaded yet'
    : SEL.files === 'all' ? `all ${FILES.length} project${FILES.length === 1 ? '' : 's'}`
    : `${selectedFileIds().length} of ${FILES.length} projects`;
  document.getElementById('ctx_summary').textContent =
    FILES.length ? `${scope} · ${n} unit${n === 1 ? '' : 's'} in view` : scope;
}

/* ---------- the project picker inside the context box ---------- */
/* what the workspace calls this record: the project inside it, not the workbook */
function projectNameOf(fileId) {
  const p = STATE.projects.find(x => x._file === fileId);
  return p && p.name ? p.name : fileLabel(fileId);
}

function renderFileBar() {
  const btn = document.getElementById('ctx_files_btn');
  const menu = document.getElementById('ctx_files_menu');
  const psel = document.getElementById('ctx_partner');
  if (!btn || !menu || !psel) return;

  const partners = partnersList();
  psel.innerHTML = '<option value="all">All builder partners</option>' +
    partners.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
  psel.value = CTX.partner && partners.indexOf(CTX.partner) >= 0 ? CTX.partner : 'all';
  psel.disabled = !FILES.length;

  const shown = FILES.filter(f => CTX.partner === 'all' || !CTX.partner || f.partner === CTX.partner);
  const chosen = selectedFileIds();
  btn.disabled = !FILES.length;
  btn.textContent = !FILES.length ? 'Nothing loaded'
    : SEL.files === 'all' ? `All projects (${FILES.length})`
    : chosen.length === 1 ? projectNameOf(chosen[0])
    : `${chosen.length} projects selected`;

  const groups = {};
  shown.forEach(f => { (groups[f.partner] = groups[f.partner] || []).push(f); });
  menu.innerHTML = Object.keys(groups).sort().map(partner =>
    `<div class="grp">${esc(partner)}</div>` + groups[partner].map(f =>
      `<label><input type="checkbox" class="fpick" value="${esc(f.id)}"${fileSelected(f.id) ? ' checked' : ''}>
         <span>${esc(projectNameOf(f.id))}</span>${f.dirty ? '<span class="dot" title="not saved yet"></span>' : ''}</label>`
    ).join('')).join('')
    + `<div class="acts">
         <button class="btn-tiny" id="fp-all" type="button">Select all</button>
         <button class="btn-tiny" id="fp-none" type="button">Clear</button>
         <button class="btn-tiny danger" id="fp-close" type="button">Close selected</button>
       </div>`;

  menu.querySelectorAll('.fpick').forEach(cb => cb.addEventListener('change', () => {
    const ids = [...menu.querySelectorAll('.fpick')].filter(x => x.checked).map(x => x.value);
    const hidden = FILES.filter(f => !shown.some(x => x.id === f.id) && fileSelected(f.id)).map(f => f.id);
    SEL.files = (ids.length + hidden.length === FILES.length) ? 'all' : ids.concat(hidden);
    applyFileSelection();
  }));
  const b1 = menu.querySelector('#fp-all'), b0 = menu.querySelector('#fp-none'), bx = menu.querySelector('#fp-close');
  if (b1) b1.addEventListener('click', () => { SEL.files = 'all'; applyFileSelection(); });
  if (b0) b0.addEventListener('click', () => { SEL.files = shown.length ? [shown[0].id] : 'all'; applyFileSelection(); });
  if (bx) bx.addEventListener('click', async () => {
    menu.classList.remove('show');
    for (const id of selectedFileIds().slice()) await closeFile(id);
  });
}

function applyFileSelection() {
  closeEditor();
  // Narrowing to a single project is how the Tower / Wing list gets something to offer,
  // so picking one project here selects it as the context too.
  const ids = selectedFileIds();
  const sole = ids.length === 1 ? STATE.projects.find(p => p._file === ids[0]) : null;
  CTX.projectId = sole ? sole.id : 'all';
  CTX.towerId = 'all';
  Object.keys(PAGERS).forEach(k => { PAGERS[k].page = 1; });
  renderContextBar(); renderProjectList(); refreshAll(); updateStatusLine();
}
function onContextChange() {
  const ps = document.getElementById('ctx_project');
  if (ps && ps.offsetParent) CTX.projectId = ps.value;
  CTX.towerId = document.getElementById('ctx_tower').value;
  closeEditor();
  renderContextBar();
  refreshAll();
}

/* ================= Projects & Towers ================= */
function newProject() { return { id: uid('p'), name: '', builder: '', address: '', rera: '', survey: '', city: '', accountId: '', towers: [] }; }
function newTower() {
  return { id: uid('t'), name: '', possessionTarget: null,
           schedule: DEFAULT_SCHEDULE.map(m => ({ ...m, id: uid('m'), plannedDate: null, completedDate: null })),
           unitTypes: [], units: [] };
}

/* ================= Tower inventory =================
   Until now the tool only knew about units somebody had already bought, which meant it
   could report what was collected but never what was left to sell. The builder's own
   inventory sheet is a grid -- the same handful of positions repeated on every floor, each
   position one unit type -- so that is the shape the editor takes.

   Flat numbers are written differently in every report ("101", "A 101", "A-101", "E3-201"),
   so matching inventory to a customer is done on a normalised key rather than the string. */
function newUnitType(seed) {
  return Object.assign({ id: uid('ut'), name: '', config: '2 BHK', carpet: 0, balcony: 0,
                         sellable: 0, rate: 0, parking: '' }, seed || {});
}
function newInvUnit(seed) {
  return Object.assign({ id: uid('iu'), flat: '', floor: 0, typeId: '', note: '' }, seed || {});
}
function towerUnitTypes(t) { if (t && !Array.isArray(t.unitTypes)) t.unitTypes = []; return t ? t.unitTypes : []; }
function towerUnits(t)     { if (t && !Array.isArray(t.units)) t.units = []; return t ? t.units : []; }
function unitTypeName(t, id) {
  const ut = towerUnitTypes(t).find(x => x.id === id);
  return ut ? (ut.name || ut.config || 'Unnamed type') : '';
}
function unitTotalCarpet(ut) { return round2((ut.carpet || 0) + (ut.balcony || 0)); }
function unitCarpetSqmt(ut)  { return round2(unitTotalCarpet(ut) * 0.092903); }

/* "A-101" in tower A, "A 101" in wing A and "101" on the inventory sheet are one flat */
function flatKey(towerName, flat) {
  let s = String(flat == null ? '' : flat).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const w = String(towerName == null ? '' : towerName).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (w && s.startsWith(w) && s.length > w.length) s = s.slice(w.length);
  return s;
}
/* what has actually happened to each unit, read off the customer records */
function inventoryStatus(tower) {
  const map = {};
  customersOfTower(tower.id).forEach(c => {
    const k = flatKey(tower.name, c.flat);
    if (!k) return;
    const st = String(c.bookingStatus || 'BOOKED').toUpperCase();
    map[k] = { customer: c, status: st === 'CANCELLED' ? 'cancelled' : st === 'HOLD' ? 'hold' : 'sold' };
  });
  return map;
}
function inventoryCounts(tower) {
  const t = tower;
  const units = towerUnits(t);
  const seen = inventoryStatus(t);
  const out = { total: units.length, sold: 0, hold: 0, cancelled: 0, unsold: 0, unlisted: 0, sellable: 0 };
  const inList = {};
  units.forEach(u => {
    const k = flatKey(t.name, u.flat);
    inList[k] = true;
    const s = seen[k];
    if (!s) out.unsold++;
    else if (s.status === 'sold') out.sold++;
    else if (s.status === 'hold') out.hold++;
    else { out.cancelled++; out.unsold++; }   // a cancelled unit is back on the market
    const ut = towerUnitTypes(t).find(x => x.id === u.typeId);
    if (ut) out.sellable += (ut.sellable || 0);
  });
  // units somebody sold that were never entered into the inventory
  Object.keys(seen).forEach(k => { if (!inList[k]) out.unlisted++; });
  return out;
}
/* Every tower in view, whether or not it has an inventory yet. "In view" has to mean the
   same thing here as it does for every other figure on the screen: narrowing to one project
   or one wing must narrow this too, or a screen scoped to one builder ends up showing
   another builder's stock. */
function inventoryOverview() {
  return allTowers()
    .filter(({ project, tower }) =>
      (CTX.projectId === 'all' || project.id === CTX.projectId) &&
      (CTX.towerId === 'all' || tower.id === CTX.towerId))
    .map(({ project, tower }) => {
      const counts = inventoryCounts(tower);
      return { project, tower, counts, hasInventory: counts.total > 0 };
    });
}

function renderProjectList() {
  const tb = document.getElementById('proj-list-body');
  tb.innerHTML = visibleProjects().map(p => {
    const units = customersOfProject(p.id).length;
    const bad = p.towers.filter(t => Math.abs(scheduleTotalPct(t.schedule) - 100) > 0.05).length;
    return `<tr class="row-click" data-id="${p.id}">
      <td class="cn">${esc(p.name) || '<span class="muted">Unnamed</span>'}</td>
      <td>${esc(p.builder)}</td>
      <td class="num">${p.towers.length}</td>
      <td class="num">${units}</td>
      <td>${bad ? `<span class="pill warn">${bad} tower${bad>1?'s':''} ≠ 100%</span>` : '<span class="pill ok">schedules OK</span>'}</td>
      <td><button class="btn-tiny danger del-proj" data-id="${p.id}">Remove</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="6" class="empty-row">No projects yet: click “+ Add project” to set up your first one.</td></tr>`;

  tb.querySelectorAll('.row-click td:not(:last-child)').forEach(td =>
    td.addEventListener('click', () => openProjectEditor(td.closest('tr').dataset.id)));
  tb.querySelectorAll('.del-proj').forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation();
    const id = b.dataset.id, p = projectById(id);
    const units = customersOfProject(id);
    if (!await askConfirm({ title: `Remove ${p.name}?`,
          body: units.length
            ? `This project has <b>${units.length}</b> customer${units.length===1?'':'s'} across its towers.`
            : `The project and its <b>${p.towers.length}</b> tower${p.towers.length===1?'':'s'} will be removed.`,
          note: units.length ? 'Those customers and their milestone history go with it.' : '',
          confirmLabel: 'Remove it', danger: true })) return;
    const owner = p._file;
    units.forEach(c => { delete STATE.milestonePaid[c.name]; });
    STATE.customers = STATE.customers.filter(c => c.projectId !== id);
    STATE.projects = STATE.projects.filter(x => x.id !== id);
    if (CURRENT_PROJECT_ID === id) closeProjectEditor();
    if (CTX.projectId === id) { CTX.projectId = 'all'; CTX.towerId = 'all'; }
    renderContextBar(); renderProjectList(); refreshAll(); markDirty(owner);
  }));
  document.getElementById('proj-count').textContent = visibleProjects().length;
  document.getElementById('btn-add-proj').disabled = STATE.projects.length >= MAX_PROJECTS;
  document.getElementById('proj-limit-note').textContent =
    `${STATE.projects.length} of ${MAX_PROJECTS} projects used`;
}

function openProjectEditor(id) {
  CURRENT_PROJECT_ID = id;
  PROJ_BUF = JSON.parse(JSON.stringify(projectById(id)), (k, v) =>
    (k === 'possessionTarget' && v) ? new Date(v) : v);
  if (!PROJ_BUF.contacts) PROJ_BUF.contacts = [];
  closeTowerEditor();
  document.getElementById('proj-editor').classList.add('show');
  document.getElementById('proj-editor-title').textContent = PROJ_BUF.name ? `Editing: ${PROJ_BUF.name}` : 'New project';
  document.getElementById('pf_name').value = PROJ_BUF.name || '';
  document.getElementById('pf_builder').value = PROJ_BUF.builder || '';
  document.getElementById('pf_address').value = PROJ_BUF.address || '';
  document.getElementById('pf_rera').value = PROJ_BUF.rera || '';
  document.getElementById('pf_survey').value = PROJ_BUF.survey || '';
  document.getElementById('pf_city').value = PROJ_BUF.city || '';
  renderProjectAccounts();
  renderProjectContacts();
  renderTowerList();
  document.getElementById('proj-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* The builder partner's accounts, with the one this project collects into picked out.
   Entered once on the partner, chosen here, so nobody retypes an account number. */
function renderProjectAccounts() {
  if (!PROJ_BUF) return;
  const partner = (fileById(PROJ_BUF._file) || {}).partner || PROJ_BUF.builder || '';
  const b = builderOf(partner);
  const all = b.accounts || [];
  const mine = all.filter(a => !a.project || a.project === PROJ_BUF.name);
  const sel = document.getElementById('pf_account');
  sel.innerHTML = '<option value="">— not set —</option>' + mine.map(a =>
    `<option value="${esc(a.id)}"${PROJ_BUF.accountId === a.id ? ' selected' : ''}>${esc(a.label || a.accountNo)} · ${esc(a.type)}</option>`).join('');
  document.getElementById('pf_account_hint').innerHTML = all.length
    ? `From <b>${esc(partner)}</b>'s accounts. Add or change them on the Builder Partners tab.`
    : `<b>${esc(partner || 'This builder partner')}</b> has no accounts on record yet. Add them on the Builder Partners tab and they appear here.`;
  document.getElementById('pf-acc-body').innerHTML = mine.map(a => `
    <tr><td class="cn">${esc(a.label || '—')}</td><td>${esc(a.type)}</td><td>${esc(a.bank)}</td>
    <td>${esc(a.accountNo)}</td><td>${esc(a.ifsc)}</td></tr>`).join('')
    || `<tr><td colspan="5" class="empty-row">No accounts on record for this builder partner yet.</td></tr>`;
}
function renderProjectContacts() {
  if (!PROJ_BUF) return;
  if (!PROJ_BUF.contacts) PROJ_BUF.contacts = [];
  const body = document.getElementById('pf-contact-body');
  if (!body) return;
  body.innerHTML = PROJ_BUF.contacts.length ? PROJ_BUF.contacts.map((ct, i) => `
    <tr>
      <td><input class="ct-in" data-i="${i}" data-k="name" value="${esc(ct.name || '')}" placeholder="Name"></td>
      <td><select class="ct-in" data-i="${i}" data-k="role">${CONTACT_ROLES.map(r =>
            `<option${ct.role === r ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select></td>
      <td><input class="ct-in" data-i="${i}" data-k="email" value="${esc(ct.email || '')}" placeholder="name@builder.com"></td>
      <td><input class="ct-in" data-i="${i}" data-k="phone" value="${esc(ct.phone || '')}"></td>
      <td style="text-align:center"><input type="checkbox" class="ct-in" data-i="${i}" data-k="primary"${ct.primary ? ' checked' : ''}></td>
      <td><button class="btn-tiny ct-del" data-i="${i}" type="button">Remove</button></td>
    </tr>`).join('')
    : `<tr><td colspan="6" class="empty-row">Nobody on record for this project yet.</td></tr>`;
  body.querySelectorAll('.ct-in').forEach(el => {
    el.addEventListener('change', () => {
      const c = PROJ_BUF.contacts[+el.dataset.i]; if (!c) return;
      c[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value.trim();
      updateContactHint();
    });
  });
  body.querySelectorAll('.ct-del').forEach(btn => {
    btn.addEventListener('click', () => { PROJ_BUF.contacts.splice(+btn.dataset.i, 1); renderProjectContacts(); });
  });
  updateContactHint();
}
function updateContactHint() {
  const el = document.getElementById('pf-contact-hint');
  if (!el || !PROJ_BUF) return;
  const prim = primaryContacts(PROJ_BUF);
  el.innerHTML = prim.length
    ? `The daily brief will go to <b>${prim.map(c => esc(c.email)).join('</b>, <b>')}</b>.`
    : 'Nobody is ticked for the daily brief yet, so there is nowhere to send it.';
}
function closeProjectEditor() {
  CURRENT_PROJECT_ID = null; PROJ_BUF = null;
  document.getElementById('proj-editor').classList.remove('show');
  closeTowerEditor();
}
function readProjectForm() {
  if (!PROJ_BUF) return;
  PROJ_BUF.name = document.getElementById('pf_name').value.trim();
  PROJ_BUF.builder = document.getElementById('pf_builder').value.trim();
  PROJ_BUF.address = document.getElementById('pf_address').value.trim();
  PROJ_BUF.rera = document.getElementById('pf_rera').value.trim();
  PROJ_BUF.survey = document.getElementById('pf_survey').value.trim();
  PROJ_BUF.city = document.getElementById('pf_city').value.trim();
  PROJ_BUF.accountId = document.getElementById('pf_account').value;
}
async function saveProjectEditor() {
  readProjectForm();
  if (TOWER_BUF) { notify('Finish saving (or cancel) the tower you are editing first.'); return; }
  if (enforceRequired('project', PROJ_BUF, 'proj-editor')) return;
  const dup = STATE.projects.find(p => p.id !== PROJ_BUF.id && p.name.toLowerCase() === PROJ_BUF.name.toLowerCase());
  if (dup) { notify('Another project already has this name. Project names must be unique.'); return; }
  if (!PROJ_BUF.towers.length && !await askConfirm({ title: 'No towers yet',
        body: 'You will need at least one tower before you can add customers to this project.',
        confirmLabel: 'Save it anyway' })) return;
  const oldName = (projectById(PROJ_BUF.id) || {}).name;
  const idx = STATE.projects.findIndex(p => p.id === PROJ_BUF.id);
  if (idx >= 0) STATE.projects[idx] = PROJ_BUF; else STATE.projects.push(PROJ_BUF);
  // keep each customer's cached wing text in sync with its tower name
  syncCustomerWings();
  closeProjectEditor();
  const owner = PROJ_BUF && PROJ_BUF._file;
  renderContextBar(); renderProjectList(); refreshAll(); markDirty(owner);
  // saving here saves the project itself, quietly, wherever it lives
  if (owner) saveScope({ file: owner, quiet: true });
}
function syncCustomerWings() {
  STATE.customers.forEach(c => { const l = towerOf(c); if (l.tower) c.wing = l.tower.name; });
  STATE.collections.forEach(e => {
    const c = STATE.customers.find(x => x.name === e.customer);
    if (c) { e.wing = c.wing; e.flat = c.flat; }
  });
}

/* ---- towers within the open project ---- */
function renderTowerList() {
  const tb = document.getElementById('tower-list-body');
  tb.innerHTML = PROJ_BUF.towers.map(t => {
    const units = customersOfTower(t.id).length;
    const tot = scheduleTotalPct(t.schedule);
    const ok = Math.abs(tot - 100) < 0.05;
    const prog = towerProgress(t.schedule);
    const dated = t.schedule.filter(m => m.plannedDate || m.completedDate).length;
    return `<tr class="row-click" data-id="${t.id}">
      <td class="cn">${esc(t.name) || '<span class="muted">Unnamed</span>'}
        ${prog.lastDone ? `<div class="sub-line">built to: ${esc(prog.lastDone.label)} · ${prog.pctDone}%</div>` : ''}</td>
      <td>${t.possessionTarget ? fmtDate(t.possessionTarget) : '<span class="muted">not set</span>'}
        ${dated ? `<div class="sub-line">${dated} of ${t.schedule.length} stages dated</div>`
                : '<div class="sub-line muted">no stage dates: due dates estimated</div>'}</td>
      <td class="num">${t.schedule.length}</td>
      <td><span class="pill ${ok ? 'ok' : 'warn'}">${tot}%</span></td>
      <td class="num">${units}</td>
      <td><button class="btn-tiny danger del-tower" data-id="${t.id}">Remove</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="6" class="empty-row">No towers yet: add one to define its payment schedule.</td></tr>`;

  tb.querySelectorAll('.row-click td:not(:last-child)').forEach(td =>
    td.addEventListener('click', () => openTowerEditor(td.closest('tr').dataset.id)));
  tb.querySelectorAll('.del-tower').forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation();
    const id = b.dataset.id, t = PROJ_BUF.towers.find(x => x.id === id);
    const units = customersOfTower(id);
    if (units.length && !await askConfirm({ title: `Remove Tower ${t.name}?`,
          body: `It has <b>${units.length}</b> customer${units.length===1?'':'s'}.`,
          note: 'Those customers and their milestone history go with it.',
          confirmLabel: 'Remove it', danger: true })) return;
    units.forEach(c => { delete STATE.milestonePaid[c.name]; });
    STATE.customers = STATE.customers.filter(c => c.towerId !== id);
    PROJ_BUF.towers = PROJ_BUF.towers.filter(x => x.id !== id);
    if (CURRENT_TOWER_ID === id) closeTowerEditor();
    renderTowerList();
  }));
  document.getElementById('tower-count').textContent = PROJ_BUF.towers.length;
  document.getElementById('btn-add-tower').disabled = PROJ_BUF.towers.length >= MAX_TOWERS_PER_PROJECT;
  document.getElementById('tower-limit-note').textContent =
    `${PROJ_BUF.towers.length} of ${MAX_TOWERS_PER_PROJECT} towers used in this project`;
}
function addTower() {
  if (PROJ_BUF.towers.length >= MAX_TOWERS_PER_PROJECT) { notify(`A project can hold at most ${MAX_TOWERS_PER_PROJECT} towers.`); return; }
  const t = newTower();
  PROJ_BUF.towers.push(t);
  renderTowerList();
  openTowerEditor(t.id);
}
function openTowerEditor(id) {
  CURRENT_TOWER_ID = id;
  const src = PROJ_BUF.towers.find(t => t.id === id);
  TOWER_BUF = JSON.parse(JSON.stringify(src), (k, v) => (k === 'possessionTarget' && v) ? new Date(v) : v);
  document.getElementById('tower-editor').classList.add('show');
  document.getElementById('tower-editor-title').textContent = TOWER_BUF.name ? `Tower ${TOWER_BUF.name}: payment schedule` : 'New tower';
  document.getElementById('tf_name').value = TOWER_BUF.name || '';
  document.getElementById('tf_possession').value = toISODate(TOWER_BUF.possessionTarget);
  renderScheduleEditor();
  // the position list is remembered per tower so re-opening it does not start blank
  const units = towerUnits(TOWER_BUF);
  const posEl = document.getElementById('inv_positions');
  if (posEl) posEl.value = TOWER_BUF._positions || derivePositions(units);
  const patEl = document.getElementById('inv_pattern');
  if (patEl) patEl.value = TOWER_BUF._pattern || derivePattern(TOWER_BUF.name, units);
  const floors = towerUnits(TOWER_BUF).map(u => u.floor).filter(f => f > 0);
  if (floors.length) {
    document.getElementById('inv_from').value = Math.min(...floors);
    document.getElementById('inv_to').value = Math.max(...floors);
  }
  pagerReset('inventory');
  renderInventoryEditor();
  document.getElementById('tower-editor').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function closeTowerEditor() {
  CURRENT_TOWER_ID = null; TOWER_BUF = null;
  const el = document.getElementById('tower-editor');
  if (el) el.classList.remove('show');
}
function cancelTowerEditor() {
  if (TOWER_BUF && !TOWER_BUF.name && PROJ_BUF) {
    PROJ_BUF.towers = PROJ_BUF.towers.filter(t => t.id !== TOWER_BUF.id);
  }
  closeTowerEditor();
  renderTowerList();
}
async function saveTowerEditor() {
  TOWER_BUF.name = document.getElementById('tf_name').value.trim();
  TOWER_BUF.possessionTarget = parseDateInput(document.getElementById('tf_possession').value);
  // the required check reads plain field names, so hand it the shape it expects
  if (enforceRequired('tower', { name: TOWER_BUF.name, possession: TOWER_BUF.possessionTarget,
                                 schedule: TOWER_BUF.schedule }, 'tower-editor')) return;
  if (PROJ_BUF.towers.some(t => t.id !== TOWER_BUF.id && t.name.toLowerCase() === TOWER_BUF.name.toLowerCase())) {
    notify('Another tower in this project already uses that name.'); return;
  }
  if (TOWER_BUF.schedule.some(m => !m.label)) { notify('Every payment-schedule stage needs a name.'); return; }
  TOWER_BUF._positions = document.getElementById('inv_positions').value || '';
  TOWER_BUF._pattern = document.getElementById('inv_pattern').value || 'FP';
  // two units cannot share a flat number
  const keys = {}, clash = [];
  towerUnits(TOWER_BUF).forEach(u => {
    const k = flatKey(TOWER_BUF.name, u.flat);
    if (!k) return;
    if (keys[k]) clash.push(u.flat); else keys[k] = true;
  });
  if (clash.length) { notify(`The inventory lists ${clash.length === 1 ? 'flat' : 'flats'} ${clash.slice(0, 5).join(', ')} more than once. Flat numbers have to be unique inside a tower.`); return; }
  const tot = scheduleTotalPct(TOWER_BUF.schedule);
  if (!reqOn(REQ_BY_ID['t.schedule100']) && Math.abs(tot - 100) > 0.05
      && !await askConfirm({ title: 'The schedule does not add up',
            body: `These stages total <b>${tot}%</b>, not 100%.`,
            note: 'Every unit in this tower would be under-billed or over-billed by the difference.',
            confirmLabel: 'Save it anyway' })) return;
  const i = PROJ_BUF.towers.findIndex(t => t.id === TOWER_BUF.id);
  if (i >= 0) PROJ_BUF.towers[i] = TOWER_BUF; else PROJ_BUF.towers.push(TOWER_BUF);
  closeTowerEditor();
  renderTowerList();
}

/* ---------------- the inventory editor, inside the tower ---------------- */
const INV_FILT = { mode: 'all', q: '' };

function renderInventoryEditor() {
  if (!TOWER_BUF) return;
  renderUnitTypeTable();
  renderPositionPickers();
  renderInventoryUnits();
}

function renderUnitTypeTable() {
  const types = towerUnitTypes(TOWER_BUF);
  const units = towerUnits(TOWER_BUF);
  const body = document.getElementById('inv-type-body');
  body.innerHTML = types.map((ut, i) => {
    const n = units.filter(u => u.typeId === ut.id).length;
    return `<tr>
      <td><input class="ut-f" data-i="${i}" data-k="name" value="${esc(ut.name)}" placeholder="e.g. 3 BHK large"></td>
      <td><input class="ut-f" data-i="${i}" data-k="config" value="${esc(ut.config)}" placeholder="2 BHK"></td>
      <td><input class="ut-f num" type="number" step="0.01" data-i="${i}" data-k="carpet" value="${ut.carpet || ''}"></td>
      <td><input class="ut-f num" type="number" step="0.01" data-i="${i}" data-k="balcony" value="${ut.balcony || ''}"></td>
      <td class="num">${unitTotalCarpet(ut).toLocaleString('en-IN')}</td>
      <td class="num">${unitCarpetSqmt(ut).toLocaleString('en-IN')}</td>
      <td><input class="ut-f num" type="number" step="0.01" data-i="${i}" data-k="sellable" value="${ut.sellable || ''}"></td>
      <td><input class="ut-f num" type="number" data-i="${i}" data-k="rate" value="${ut.rate || ''}"></td>
      <td><input class="ut-f" data-i="${i}" data-k="parking" value="${esc(ut.parking)}" placeholder="1 covered"></td>
      <td class="num">${n}</td>
      <td><button class="btn-tiny danger ut-del" data-i="${i}">Remove</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="11" class="empty-row">No unit types yet. Add one for each size the tower sells.</td></tr>`;

  document.getElementById('inv-type-count').textContent = types.length;
  body.querySelectorAll('.ut-f').forEach(el => el.addEventListener('input', () => {
    const ut = types[+el.dataset.i], k = el.dataset.k;
    ut[k] = ['carpet', 'balcony', 'sellable', 'rate'].includes(k)
      ? (el.value === '' ? 0 : parseFloat(el.value) || 0) : el.value;
    if (k === 'carpet' || k === 'balcony') renderUnitTypeTable();
  }));
  body.querySelectorAll('.ut-del').forEach(b => b.addEventListener('click', async () => {
    const ut = types[+b.dataset.i];
    const n = units.filter(u => u.typeId === ut.id).length;
    if (n && !await askConfirm({ title: 'Remove this unit type?',
          body: `<b>${n}</b> unit${n === 1 ? '' : 's'} in this tower use it.`,
          note: 'Those units stay in the list but lose their areas until another type is picked.',
          confirmLabel: 'Remove it', danger: true })) return;
    units.forEach(u => { if (u.typeId === ut.id) u.typeId = ''; });
    types.splice(+b.dataset.i, 1);
    renderInventoryEditor();
  }));
}

function invPositions() {
  return String(document.getElementById('inv_positions').value || '')
    .split(',').map(s => s.trim()).filter(Boolean);
}
function renderPositionPickers() {
  const host = document.getElementById('inv-pos-types');
  const types = towerUnitTypes(TOWER_BUF);
  const pos = invPositions();
  if (!pos.length) {
    host.innerHTML = `<div class="set-hint" style="margin-top:8px;">List the positions above and each one gets a unit type here.</div>`;
    return;
  }
  if (!types.length) {
    host.innerHTML = `<div class="set-hint" style="margin-top:8px;">Add at least one unit type first.</div>`;
    return;
  }
  const prev = TOWER_BUF._posTypes || {};
  host.innerHTML = pos.map(p => `
    <div class="inv-pos-row">
      <span class="pos">${esc(p)}</span>
      <select class="inv-pos" data-p="${esc(p)}">
        ${types.map(t => `<option value="${t.id}"${prev[p] === t.id ? ' selected' : ''}>${
            esc(t.name || t.config)} &middot; ${unitTotalCarpet(t)} sq.ft carpet</option>`).join('')}
      </select>
    </div>`).join('');
  host.querySelectorAll('.inv-pos').forEach(sel => {
    TOWER_BUF._posTypes = TOWER_BUF._posTypes || {};
    TOWER_BUF._posTypes[sel.dataset.p] = sel.value;
    sel.addEventListener('change', () => { TOWER_BUF._posTypes[sel.dataset.p] = sel.value; });
  });
}

/* An inventory read back from the workbook has no memory of how it was laid out, so the
   layout is recovered from the flat numbers themselves. */
function derivePositions(units) {
  const seen = [];
  (units || []).forEach(u => {
    const d = String(u.flat || '').replace(/\D/g, '');
    if (d.length < 3) return;
    const p = d.slice(-2);
    if (!seen.includes(p)) seen.push(p);
  });
  return seen.sort().join(', ');
}
function derivePattern(wing, units) {
  const s = String((units && units[0] && units[0].flat) || '');
  if (/^[A-Za-z0-9]+\s+\d+$/.test(s)) return 'WFP';
  if (/^[A-Za-z0-9]+-\d+$/.test(s)) return 'W-FP';
  return 'FP';
}
function invFlatNumber(pattern, wing, floor, pos) {
  const fp = `${floor}${pos}`;
  if (pattern === 'WFP') return `${wing} ${fp}`.trim();
  if (pattern === 'W-FP') return `${wing}-${fp}`.replace(/^-/, '');
  return fp;
}

async function generateInventory() {
  if (!TOWER_BUF) return;
  const from = Math.round(parseFloat(document.getElementById('inv_from').value) || 0);
  const to   = Math.round(parseFloat(document.getElementById('inv_to').value) || 0);
  const pos  = invPositions();
  const pat  = document.getElementById('inv_pattern').value;
  const wing = document.getElementById('tf_name').value.trim() || TOWER_BUF.name || '';
  const types = towerUnitTypes(TOWER_BUF);
  if (!types.length) { notify('Add at least one unit type first: the grid needs to know what sits at each position.'); return; }
  if (!pos.length) { notify('List the positions on a floor, for example 01, 02, 03, 04.'); return; }
  if (to < from) { notify('The last floor cannot be below the first.'); return; }
  const n = (to - from + 1) * pos.length;
  if (n > 2000) { notify(`That is ${n} units. Split the tower or check the floor numbers.`); return; }
  const existing = towerUnits(TOWER_BUF);
  if (existing.length && !await askConfirm({ title: 'Replace the unit list?',
        body: `This tower already lists <b>${existing.length}</b> unit${existing.length === 1 ? '' : 's'}.`,
        note: `Building the grid replaces them with ${n} units. Anything typed into the notes column is lost.`,
        confirmLabel: 'Replace them', danger: true })) return;

  const map = TOWER_BUF._posTypes || {};
  const units = [];
  for (let f = from; f <= to; f++) {
    pos.forEach(p => units.push(newInvUnit({
      flat: invFlatNumber(pat, wing, f, p), floor: f, typeId: map[p] || types[0].id })));
  }
  TOWER_BUF.units = units;
  pagerReset('inventory');
  renderInventoryEditor();
  document.getElementById('inv-gen-note').textContent =
    `${units.length} units built: floors ${from}–${to} × ${pos.length} per floor.`;
}

/* A tower that has been selling for two years already describes its own layout: the flats
   people bought are the flats that exist. This turns that into a starting inventory. */
function inventoryFromSales() {
  if (!TOWER_BUF) return;
  const cs = customersOfTower(TOWER_BUF.id);
  if (!cs.length) { notify('No units have been sold in this tower yet, so there is nothing to read a layout from.'); return; }
  const types = towerUnitTypes(TOWER_BUF);
  const byConfig = {};
  types.forEach(t => { byConfig[String(t.config || t.name).toUpperCase().replace(/\s+/g, '')] = t; });
  cs.forEach(c => {
    const key = String(c.type || '').toUpperCase().replace(/\s+/g, '');
    if (key && !byConfig[key]) {
      const ut = newUnitType({ name: c.type, config: c.type, carpet: c.carpetArea || 0,
                               balcony: c.balconyArea || 0, sellable: c.salableArea || 0,
                               rate: c.rate || 0, parking: c.parkingType || '' });
      types.push(ut); byConfig[key] = ut;
    }
  });
  const seen = {};
  const units = [];
  cs.forEach(c => {
    const k = flatKey(TOWER_BUF.name, c.flat);
    if (!k || seen[k]) return;
    seen[k] = true;
    const digits = k.replace(/\D/g, '');
    const floor = digits.length > 2 ? parseInt(digits.slice(0, digits.length - 2), 10) : 0;
    const ut = byConfig[String(c.type || '').toUpperCase().replace(/\s+/g, '')];
    units.push(newInvUnit({ flat: c.flat, floor: floor || 0, typeId: ut ? ut.id : (types[0] ? types[0].id : '') }));
  });
  units.sort((a, b) => (a.floor - b.floor) || String(a.flat).localeCompare(String(b.flat)));
  TOWER_BUF.units = units;
  pagerReset('inventory');
  renderInventoryEditor();
  document.getElementById('inv-gen-note').textContent =
    `${units.length} units read off the sold list, and ${types.length} unit type${types.length === 1 ? '' : 's'}. ` +
    `Add whatever is still unsold on top.`;
}

function renderInventoryUnits() {
  const t = TOWER_BUF;
  const units = towerUnits(t);
  const types = towerUnitTypes(t);
  const seen = inventoryStatus({ id: t.id, name: document.getElementById('tf_name').value.trim() || t.name });
  const counts = inventoryCounts({ id: t.id, name: document.getElementById('tf_name').value.trim() || t.name,
                                   units, unitTypes: types });

  document.getElementById('inv-unit-count').textContent = units.length;
  document.getElementById('inv-summary').innerHTML = units.length ? `
    <span class="inv-pill">Total <b>${counts.total}</b></span>
    <span class="inv-pill">Sold / booked <b>${counts.sold}</b></span>
    <span class="inv-pill">On hold <b>${counts.hold}</b></span>
    <span class="inv-pill free">Unsold <b>${counts.unsold}</b></span>
    ${counts.unlisted ? `<span class="inv-pill" title="Sold units whose flat number is not in this list">Sold but not listed <b>${counts.unlisted}</b></span>` : ''}
    ${counts.sellable ? `<span class="inv-pill">Sellable area <b>${Math.round(counts.sellable).toLocaleString('en-IN')}</b> sq.ft</span>` : ''}`
    : `<span class="inv-pill">Nothing listed yet</span>`;

  const q = INV_FILT.q.trim().toLowerCase();
  const rows = units.map((u, i) => ({ u, i })).filter(({ u }) => {
    const s = seen[flatKey(t.name, u.flat)];
    const state = !s ? 'unsold' : s.status === 'sold' ? 'sold' : s.status === 'hold' ? 'hold' : 'unsold';
    if (INV_FILT.mode !== 'all' && INV_FILT.mode !== state) return false;
    if (!q) return true;
    return String(u.flat).toLowerCase().includes(q) || unitTypeName(t, u.typeId).toLowerCase().includes(q);
  });
  const page = pageSlice('inventory', rows);
  renderPager('inv-pager', 'inventory', rows.length, renderInventoryUnits);
  document.getElementById('inv-shown').textContent = rows.length === units.length
    ? `${units.length} unit${units.length === 1 ? '' : 's'}` : `showing ${rows.length} of ${units.length}`;

  const body = document.getElementById('inv-unit-body');
  body.innerHTML = page.map(({ u, i }) => {
    const ut = types.find(x => x.id === u.typeId);
    const s = seen[flatKey(t.name, u.flat)];
    const label = !s ? '<span class="inv-status free">Unsold</span>'
      : s.status === 'sold' ? `<span class="inv-status sold">${esc(s.customer.name)}</span>`
      : s.status === 'hold' ? `<span class="inv-status hold">Held &middot; ${esc(s.customer.name)}</span>`
      : `<span class="inv-status gone">Cancelled &middot; back on the market</span>`;
    return `<tr>
      <td><input class="iu-f num" type="number" data-i="${i}" data-k="floor" value="${u.floor || ''}"></td>
      <td><input class="iu-f" data-i="${i}" data-k="flat" value="${esc(u.flat)}"></td>
      <td><select class="iu-f" data-i="${i}" data-k="typeId">
            <option value=""></option>
            ${types.map(x => `<option value="${x.id}"${x.id === u.typeId ? ' selected' : ''}>${esc(x.name || x.config)}</option>`).join('')}
          </select></td>
      <td class="num">${ut && ut.sellable ? Math.round(ut.sellable).toLocaleString('en-IN') : '<span class="muted">–</span>'}</td>
      <td>${label}</td>
      <td><input class="iu-f" data-i="${i}" data-k="note" value="${esc(u.note)}"></td>
      <td><button class="btn-tiny danger iu-del" data-i="${i}">Remove</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="7" class="empty-row">${units.length ? 'Nothing matches this filter.' : 'No units listed yet. Build the floors above, or read the layout off what has already sold.'}</td></tr>`;

  body.querySelectorAll('.iu-f').forEach(el => el.addEventListener('change', () => {
    const u = units[+el.dataset.i], k = el.dataset.k;
    u[k] = k === 'floor' ? (parseInt(el.value, 10) || 0) : el.value;
    renderInventoryUnits();
  }));
  body.querySelectorAll('.iu-del').forEach(b => b.addEventListener('click', () => {
    units.splice(+b.dataset.i, 1);
    renderInventoryUnits();
  }));
}

function milestoneHasPayments(mid) {
  return Object.values(STATE.milestonePaid).some(m => m && m[mid]);
}
function renderScheduleEditor() {
  const body = document.getElementById('schedule-body');
  body.innerHTML = TOWER_BUF.schedule.map((m, i) => `
    <tr class="${m.completedDate ? 'stage-done' : ''}">
      <td class="num muted">${i + 1}</td>
      <td><input class="s-label" data-i="${i}" value="${esc(m.label)}" placeholder="e.g. Plinth"></td>
      <td><input class="s-pct" type="number" step="0.5" min="0" data-i="${i}" value="${Math.round((m.pct||0)*1000)/10}"></td>
      <td><input class="s-plan" type="date" data-i="${i}" value="${toISODate(m.plannedDate)}"></td>
      <td><input class="s-done" type="date" data-i="${i}" value="${toISODate(m.completedDate)}"></td>
      <td class="nowrap">
        <button class="btn-tiny s-up" data-i="${i}" ${i===0?'disabled':''} title="Move up">&uarr;</button>
        <button class="btn-tiny s-dn" data-i="${i}" ${i===TOWER_BUF.schedule.length-1?'disabled':''} title="Move down">&darr;</button>
        <button class="btn-tiny danger s-del" data-i="${i}">Remove</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="6" class="empty-row">No stages: add at least one.</td></tr>`;

  const tot = scheduleTotalPct(TOWER_BUF.schedule);
  const el = document.getElementById('schedule-total');
  el.textContent = tot + '%';
  el.className = 'pill ' + (Math.abs(tot - 100) < 0.05 ? 'ok' : 'warn');

  body.querySelectorAll('.s-label').forEach(el2 => el2.addEventListener('input', () => {
    TOWER_BUF.schedule[+el2.dataset.i].label = el2.value;
  }));
  body.querySelectorAll('.s-plan').forEach(el2 => el2.addEventListener('change', () => {
    TOWER_BUF.schedule[+el2.dataset.i].plannedDate = parseDateInput(el2.value);
  }));
  body.querySelectorAll('.s-done').forEach(el2 => el2.addEventListener('change', () => {
    const st = TOWER_BUF.schedule[+el2.dataset.i];
    st.completedDate = parseDateInput(el2.value);
    // completing a stage makes the demand live for every buyer in the tower
    if (st.completedDate && !st.plannedDate) st.plannedDate = st.completedDate;
    renderScheduleEditor();
  }));
  body.querySelectorAll('.s-pct').forEach(el2 => el2.addEventListener('input', () => {
    TOWER_BUF.schedule[+el2.dataset.i].pct = (parseFloat(el2.value) || 0) / 100;
    const t2 = scheduleTotalPct(TOWER_BUF.schedule);
    const te = document.getElementById('schedule-total');
    te.textContent = t2 + '%';
    te.className = 'pill ' + (Math.abs(t2 - 100) < 0.05 ? 'ok' : 'warn');
  }));
  const swap = (i, j) => { const s = TOWER_BUF.schedule; [s[i], s[j]] = [s[j], s[i]]; renderScheduleEditor(); };
  body.querySelectorAll('.s-up').forEach(b => b.addEventListener('click', () => swap(+b.dataset.i, +b.dataset.i - 1)));
  body.querySelectorAll('.s-dn').forEach(b => b.addEventListener('click', () => swap(+b.dataset.i, +b.dataset.i + 1)));
  body.querySelectorAll('.s-del').forEach(b => b.addEventListener('click', async () => {
    const i = +b.dataset.i, m = TOWER_BUF.schedule[i];
    if (milestoneHasPayments(m.id) && !await askConfirm({ title: 'This stage has payments against it',
          body: `<b>${esc(m.label)}</b> already has recorded payments for one or more customers.`,
          note: 'Removing the stage hides that payment history.',
          confirmLabel: 'Remove it anyway', danger: true })) return;
    TOWER_BUF.schedule.splice(i, 1);
    renderScheduleEditor();
  }));
}
function addScheduleStage() {
  TOWER_BUF.schedule.push({ id: uid('m'), label: '', pct: 0, plannedDate: null, completedDate: null });
  renderScheduleEditor();
}
async function resetScheduleToDefault() {
  if (!await askConfirm({ title: 'Replace the whole schedule?',
        body: 'This tower gets the standard 10-stage construction-linked schedule.',
        note: 'Recorded payments on any stage that disappears would be hidden.',
        confirmLabel: 'Replace it', danger: true })) return;
  TOWER_BUF.schedule = DEFAULT_SCHEDULE.map(m => ({ ...m, id: uid('m'), plannedDate: null, completedDate: null }));
  renderScheduleEditor();
}

/* ================= derived helpers ================= */
function sumRecoveryFor(name) {
  let flatCost = 0, gst = 0;
  STATE.collections.forEach(e => { if (e.customer === name) { flatCost += (e.flatCost || 0); gst += (e.gst || 0); } });
  return { flatCost, gst };
}
function toCalcCustomer(c) {
  return { ...c, duePct: (c.duePctPercent || 0) / 100,
           tdsDuePct: (c.tdsDuePctPercent != null ? c.tdsDuePctPercent : 1) / 100 };
}
function derived(c) { return deriveCustomer(toCalcCustomer(c), sumRecoveryFor(c.name), scheduleForCustomer(c)); }
/* A short payment counts whether or not a reason was captured at the time. The old
   version counted reasons only, so a stage that became partial LATER -- because the
   agreement value was corrected upward, say -- showed as "Partially Paid" in the timeline
   and still contributed nothing to the Watch flag. */
function partialCountFor(name) {
  const paid = STATE.milestonePaid[name] || {};
  const c = STATE.customers.find(x => x.name === name);
  if (!c) return Object.values(paid).filter(p => p && p.reason).length;
  const sched = scheduleForCustomer(c);
  const amounts = milestoneAmountsFor(sched, toCalcCustomer(c).agreementValueIndex || 0);
  let n = 0;
  sched.forEach((m, i) => {
    const p = paid[m.id];
    if (!p) return;
    const short = (p.amount || 0) > 0 && (p.amount || 0) < amounts[i] - 1;
    if (short || p.reason) n++;
  });
  return n;
}
function ratingFor(name) {
  const c = STATE.customers.find(x => x.name === name);
  if (!c) return { rating: 'unknown', avgDelay: null };
  const schedule = scheduleForCustomer(c);
  const paid = STATE.milestonePaid[name] || {};
  const cum = scheduleCumPct(schedule);
  const delays = [];
  schedule.forEach((m, i) => {
    const p = paid[m.id];
    if (!p || !p.date) return;
    const due = stageDueDate(m, c.bookingDate, c.possessionDate, cum[i]);
    const d = milestoneDelay(due, { date: parseDateInput(p.date) });
    if (d != null) delays.push(d);
  });
  return computeRating(delays);
}

/* ================= table sort / filter ================= */
let SORT = { cust: { key: 'agreeNo', dir: 1 }, coll: { key: 'date', dir: -1 } };
let FILT = { cust: '', custStatus: 'all', coll: '', ms: 'all' };

// natural compare: numbers as numbers, dates as dates, "12A" after "2A"
function cmpVals(a, b) {
  if (a == null) a = '';
  if (b == null) b = '';
  if (a instanceof Date || b instanceof Date) return new Date(a) - new Date(b);
  const na = typeof a === 'number', nb = typeof b === 'number';
  if (na && nb) return a - b;
  const sa = String(a), sb = String(b);
  const fa = parseFloat(sa), fb = parseFloat(sb);
  if (!isNaN(fa) && !isNaN(fb) && /^[\d.,]+$/.test(sa.trim()) && /^[\d.,]+$/.test(sb.trim())) return fa - fb;
  return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
}
function sortRows(rows, state, valueOf) {
  return rows.slice().sort((x, y) => cmpVals(valueOf(x, state.key), valueOf(y, state.key)) * state.dir);
}
// paint the arrow on whichever header is active
function paintSortHeaders(theadSel, state) {
  document.querySelectorAll(theadSel + ' th.sortable').forEach(th => {
    th.classList.remove('asc', 'desc');
    if (th.dataset.k === state.key) th.classList.add(state.dir === 1 ? 'asc' : 'desc');
  });
}
function wireSortHeaders(theadSel, state, rerender) {
  document.querySelectorAll(theadSel + ' th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const k = th.dataset.k;
      if (state.key === k) state.dir = -state.dir; else { state.key = k; state.dir = 1; }
      rerender();
    });
  });
}
const RATING_RANK = { red: 0, yellow: 1, unknown: 2, green: 3 };

/* ================= Customers ================= */
function newCustomer() {
  const p = ctxProject(), t = ctxTower();
  return {
    id: uid('c'), agreeNo: STATE.customers.length + 1,
    psNo: psNext(STATE.customers),
    projectId: p ? p.id : null, towerId: t ? t.id : null,
    name: '', contact: '', email: '', pan: '', aadhar: '', profession: '', address: '',
    bookingDate: null, agreementDate: null,
    possessionDate: t && t.possessionTarget ? new Date(t.possessionTarget) : null,
    wing: t ? t.name : '', flat: '', type: '',
    carpetArea: 0, balconyArea: 0, salableArea: 0, rate: 0,
    basicValueManual: 0, parkingAmt: 0, parkingType: '', infraCharges: 0,
    agreementValueIndex: 0, duePctPercent: 0, tdsDuePctPercent: 1, tdsPaid: 0, stampDutyReceived: 0,
    dlStatus: 'NOT STARTED', dlDate: null, bankOrOwn: '', bankersNo: '', fileNo: '', loanAmount: 0,
    loanExpected: 0, tokenPaid: 0,
    stampDutyPct: FUNDING_DEFAULTS.stampDutyPct, stampDutyAmt: 0,
    registrationAmt: FUNDING_DEFAULTS.registrationAmt, gstPct: FUNDING_DEFAULTS.gstPct, otherCharges: 0,
    remark: '',
    // ---- learned from a live builder's own report ----
    coApplicant: '', coApplicantPan: '',   // legacy mirrors of the first co-applicant
    coApplicants: [],
    marketValue: 0,                 // ready reckoner; stamp duty is charged on the higher of this and the agreement value
    bookingSource: '', subSource: '', salesManager: '', bookingScheme: '',
    bookingStatus: 'BOOKED',        // BOOKED / AGREEMENT DONE / REGISTERED / HOLD / CANCELLED
    parkingLevel: '', parkingNo: '',
    maintenanceAmt: 0, maintenanceGst: 0, maintenanceReceived: 0, maintenanceGstReceived: 0,
    registrationNo: '', registrationDate: null,
    cancelDate: null, cancelReason: '',
    stage: '',                      // blank = worked out from the record
  };
}

/* ================= The customer's life cycle =================
   A unit does not go from "booked" to "money in the bank" in one move. It is held while
   the customer decides, booked when the token lands, then the funding route is settled,
   the agreement is executed, the document is registered, demands run for two or three
   years, and possession closes it. Every one of those steps has a different next action,
   which is why the record leads with where it stands rather than with a form.

   Funding is deliberately NOT a step in that line. A sanction can land before registration
   or long after it, and a self-funded buyer never has one at all, so it runs as its own
   track underneath. */
const STAGES = [
  { id: 'hold',       label: 'Held',               sub: 'unit blocked, not booked' },
  { id: 'booked',     label: 'Booked',             sub: 'booking amount received' },
  { id: 'funding',    label: 'Funding decided',    sub: 'loan or own funds' },
  { id: 'agreement',  label: 'Agreement executed', sub: 'signed, not yet registered' },
  { id: 'registered', label: 'Registered',         sub: 'stamp duty paid' },
  { id: 'collection', label: 'Under collection',   sub: 'demands running' },
  { id: 'possession', label: 'Possession',         sub: 'handed over, closed' },
];
const STAGE_IDS = STAGES.map(s => s.id);
// what the stage means for the booking status the rest of the application already reads
const STAGE_TO_BOOKING = {
  hold: 'HOLD', booked: 'BOOKED', funding: 'BOOKED', agreement: 'AGREEMENT DONE',
  registered: 'REGISTERED', collection: 'REGISTERED', possession: 'REGISTERED', cancelled: 'CANCELLED',
};
const FUND_STEPS = [
  { id: 'NOT STARTED',      label: 'Not started' },
  { id: 'APPLIED',          label: 'Applied' },
  { id: 'SANCTIONED',       label: 'Sanctioned' },
  { id: 'PARTLY DISBURSED', label: 'Part disbursed' },
  { id: 'FULLY DISBURSED',  label: 'Fully disbursed' },
];
function fundingDecided(c) {
  const s = String(c.dlStatus || 'NOT STARTED').toUpperCase();
  if (s === 'NOT REQUIRED') return true;
  if (s !== 'NOT STARTED') return true;
  const b = String(c.bankOrOwn || '').trim().toUpperCase();
  return !!b && b !== 'SELF';
}
function isSelfFunded(c) {
  const s = String(c.dlStatus || '').toUpperCase();
  return s === 'NOT REQUIRED' || String(c.bankOrOwn || '').trim().toUpperCase() === 'SELF';
}
/* An explicitly set stage wins; otherwise it is read off the record, so the banner is
   right on day one for the 678 units that were imported before this existed. */
function stageOf(c) {
  if (!c) return 'booked';
  const st = String(c.bookingStatus || 'BOOKED').toUpperCase();
  if (st === 'CANCELLED') return 'cancelled';
  if (st === 'HOLD') return 'hold';
  if (c.stage && STAGE_IDS.includes(c.stage)) return c.stage;
  if (st === 'REGISTERED') {
    // possession is handover, not just a settled ledger: a unit that has paid in full two
    // years before the building is finished is still under collection until the date lands
    let paidUp = false;
    try { paidUp = (derived(c).AN || 0) <= 0; } catch (e) { paidUp = false; }
    const pd = asDateSafe(c.possessionDate);
    const handed = pd && pd.getTime() <= Date.now();
    return (paidUp && handed) ? 'possession' : 'collection';
  }
  if (st === 'AGREEMENT DONE') return 'agreement';
  if (fundingDecided(c)) return 'funding';
  return 'booked';
}
function stageIndex(c) { return STAGE_IDS.indexOf(stageOf(c)); }
function stageLabel(c) {
  const id = stageOf(c);
  if (id === 'cancelled') return 'Cancelled';
  const s = STAGES.find(x => x.id === id);
  return s ? s.label : id;
}

const BOOKING_STATUSES = ['BOOKED', 'AGREEMENT DONE', 'REGISTERED', 'HOLD', 'CANCELLED'];
// a unit that is on hold or cancelled is not a live receivable
const LIVE_STATUSES = ['BOOKED', 'AGREEMENT DONE', 'REGISTERED'];
function isLiveBooking(c) { return LIVE_STATUSES.includes(String(c.bookingStatus || 'BOOKED').toUpperCase()); }
function realisedRate(c) {
  const a = c.salableArea || 0;
  return a > 0 ? Math.round(((c.agreementValueIndex || 0) / a) * 100) / 100 : 0;
}

const FIELD_MAP = [
  ['projectId','select'],['towerId','select'],
  ['psNo','text'],['name','text'],['contact','text'],['email','text'],['pan','text'],['aadhar','text'],
  ['profession','text'],['address','text'],
  ['bookingDate','date'],['agreementDate','date'],['possessionDate','date'],
  ['flat','text'],['type','text'],
  ['carpetArea','num'],['balconyArea','num'],['salableArea','num'],['rate','num'],
  ['basicValueManual','num'],['parkingAmt','num'],['parkingType','text'],['infraCharges','num'],
  ['agreementValueIndex','num'],['duePctPercent','num'],['tdsDuePctPercent','num'],['tdsPaid','num'],
  ['stampDutyReceived','num'],
  ['dlStatus','select'],['dlDate','date'],['bankOrOwn','select'],['bankersNo','text'],['fileNo','text'],
  ['loanAmount','num'],['loanExpected','num'],['loanExpectedMax','bool'],['tokenPaid','num'],
  ['stampDutyPct','num'],['stampDutyAmt','num'],['registrationAmt','num'],['gstPct','num'],['otherCharges','num'],
  ['assignedTo','text'],['assignedPhone','text'],['assignedEmail','text'],
  ['remark','text'],
  ['marketValue','num'],
  ['bookingSource','text'],['subSource','text'],['salesManager','text'],['bookingScheme','text'],
  ['bookingStatus','select'],
  ['parkingLevel','text'],['parkingNo','text'],
  ['maintenanceAmt','num'],['maintenanceGst','num'],['maintenanceReceived','num'],['maintenanceGstReceived','num'],
  ['registrationNo','text'],['registrationDate','date'],
  ['cancelDate','date'],['cancelReason','text'],
];

function customerSortValue(c, key) {
  const l = towerOf(c);
  switch (key) {
    case 'agreeNo': return c.psNo || '';
    case 'name':    return c.name || '';
    case 'project': return l.project ? l.project.name : '';
    case 'tower':   return l.tower ? l.tower.name : '';
    case 'flat':    return c.flat || '';
    case 'value':   return c.agreementValueIndex || 0;
    case 'balance': return derived(c).AM || 0;
    case 'rating':  return RATING_RANK[ratingFor(c.name).rating];
    default:        return '';
  }
}
function customerMatches(c) {
  const q = FILT.cust.trim().toLowerCase();
  if (q) {
    const l = towerOf(c);
    const hay = [c.psNo, c.name, c.flat, c.type, c.contact, c.email, c.bankOrOwn, c.fileNo, c.remark,
                 l.project && l.project.name, l.tower && l.tower.name].filter(Boolean).join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  const f = FILT.custStatus;
  if (f === 'all') return true;
  if (f === 'watch')   return isWatched(partialCountFor(c.name));
  if (f === 'overdue') return overdueCountFor(c.name) > 0;
  if (f === 'balance') return (derived(c).AM || 0) > 1;
  return ratingFor(c.name).rating === f;
}
function overdueCountFor(name) {
  const c = STATE.customers.find(x => x.name === name);
  if (!c) return 0;
  const sched = scheduleForCustomer(c);
  if (!sched.length) return 0;
  const cum = scheduleCumPct(sched);
  const paid = STATE.milestonePaid[name] || {};
  const today = new Date();
  let n = 0;
  sched.forEach((m, i) => {
    if (paid[m.id]) return;
    const due = stageDueDate(m, c.bookingDate, c.possessionDate, cum[i]);
    if (due && due <= today) n++;
  });
  return n;
}

function renderCustomerList() {
  const all = visibleCustomers();
  const list = sortRows(all.filter(customerMatches), SORT.cust, customerSortValue);
  paintSortHeaders('#cust-thead', SORT.cust);
  const tb = document.getElementById('cust-list-body');
  const shownRows = pageSlice('customers', list);
  renderPager('cust-pager', 'customers', list.length, renderCustomerList);
  tb.innerHTML = shownRows.map(c => {
    const d = derived(c);
    const r = ratingFor(c.name);
    const cls = { green:'ok', yellow:'warn', red:'crit', unknown:'unk' }[r.rating];
    const pc = partialCountFor(c.name);
    const od = overdueCountFor(c.name);
    const l = towerOf(c);
    return `<tr class="row-click" data-id="${c.id}">
      <td class="psno">${c.psNo ? esc(c.psNo) : '<span class="pill warn">no number</span>'}</td>
      <td class="cn">${esc(c.name) || '<span class="muted">Unnamed</span>'}${
        String(c.remark || '').trim() ? ` <span class="has-remark" title="${esc(String(c.remark).trim())}">&#9998;</span>` : ''}</td>
      <td>${l.project ? esc(l.project.name) : '<span class="muted">–</span>'}</td>
      <td>${l.tower ? esc(l.tower.name) : '<span class="muted">–</span>'}</td>
      <td>${esc(c.flat)}</td>
      <td class="num">${fmtINR(c.agreementValueIndex)}</td>
      <td class="num">${fmtINR(d.AM)}</td>
      <td><span class="pill ${cls}">${r.rating}</span>${isWatched(pc) ? ' <span class="pill watch">Watch</span>' : ''}${od ? ` <span class="pill crit">${od} overdue</span>` : ''}</td>
      <td><button class="btn-tiny danger del-cust" data-id="${c.id}">Remove</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="9" class="empty-row">${
      !STATE.customers.length ? 'No customers yet: pick a project and tower above, then click “+ Add customer”.'
      : all.length ? 'No units match the search or filter: clear them to see all ' + all.length + '.'
      : 'No units match the current Project / Tower selection.'}</td></tr>`;

  tb.querySelectorAll('.row-click td:not(:last-child)').forEach(td =>
    td.addEventListener('click', () => openEditor(td.closest('tr').dataset.id)));
  tb.querySelectorAll('.del-cust').forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation();
    const id = b.dataset.id, c = STATE.customers.find(x => x.id === id);
    if (!await askConfirm({ title: `Remove ${c.name || 'this customer'}?`,
          body: 'Their collection entries and milestone history go with them.',
          confirmLabel: 'Remove them', danger: true })) return;
    delete STATE.milestonePaid[c.name];
    STATE.collections = STATE.collections.filter(e2 => e2.customer !== c.name);
    STATE.customers = STATE.customers.filter(x => x.id !== id);
    if (CURRENT_CUSTOMER_ID === id) closeEditor();
    refreshAll(); markDirty(c);
  }));
  document.getElementById('cust-count').textContent = list.length;
  document.getElementById('cust-ctx-note').textContent = ctxLabel();
  document.getElementById('cust-shown').textContent =
    (list.length === all.length) ? `${all.length} unit${all.length === 1 ? '' : 's'}`
                                 : `showing ${list.length} of ${all.length}`;
}

function populateCustomerProjectSelects(selProject, selTower) {
  const ps = document.getElementById('f_projectId');
  ps.innerHTML = '<option value="">,  select project , </option>' +
    visibleProjects().map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  ps.value = selProject || '';
  const ts = document.getElementById('f_towerId');
  const p = projectById(ps.value);
  ts.innerHTML = '<option value="">,  select tower , </option>' +
    (p ? p.towers.map(t => `<option value="${t.id}">Tower ${esc(t.name)}</option>`).join('') : '');
  ts.value = (p && selTower && p.towers.some(t => t.id === selTower)) ? selTower : '';
}
function onEditorProjectChange() {
  const pid = document.getElementById('f_projectId').value;
  populateCustomerProjectSelects(pid, null);
  if (EDIT_BUFFER) { EDIT_BUFFER.projectId = pid || null; EDIT_BUFFER.towerId = null; }
  recomputeEditorPreview();
}
function onEditorTowerChange() {
  const tid = document.getElementById('f_towerId').value;
  if (EDIT_BUFFER) {
    EDIT_BUFFER.towerId = tid || null;
    const l = towerOf(EDIT_BUFFER);
    if (l.tower) {
      EDIT_BUFFER.wing = l.tower.name;
      const posEl = document.getElementById('f_possessionDate');
      if (!posEl.value && l.tower.possessionTarget) posEl.value = toISODate(l.tower.possessionTarget);
    }
  }
  recomputeEditorPreview();
}

function openEditor(id) {
  const src = STATE.customers.find(c => c.id === id);
  if (!src) return;
  CURRENT_CUSTOMER_ID = id;
  EDIT_BUFFER = { ...src };
  // the co-applicant list is edited in place, so it has to be a copy or Cancel would
  // still have changed the record
  EDIT_BUFFER.coApplicants = coApplicantsOf(src).map(x => ({ ...x }));
  document.getElementById('cust-editor').classList.add('show');
  document.getElementById('editor-title').textContent = EDIT_BUFFER.name ? `Editing: ${EDIT_BUFFER.name}` : 'New customer';
  populateCustomerProjectSelects(EDIT_BUFFER.projectId, EDIT_BUFFER.towerId);
  populateBankSelect('f_bankOrOwn', EDIT_BUFFER.bankOrOwn);
  clearRequiredBanner('cust-editor');
  paintRequiredMarks();
  lockPsNo(true);
  FIELD_MAP.forEach(([k, t]) => {
    const el = document.getElementById('f_' + k);
    if (!el || k === 'projectId' || k === 'towerId' || k === 'bankOrOwn') return;
    if (t === 'bool') el.checked = !!EDIT_BUFFER[k];
    else if (t === 'date') el.value = toISODate(EDIT_BUFFER[k]);
    else el.value = EDIT_BUFFER[k] != null ? EDIT_BUFFER[k] : '';
  });
  renderCoApplicants();
  showRecordTab('info');
  renderStageBanner();
  recomputeEditorPreview();
  applyEditorCols();
  minimiseCustomerList(true);
  const wn = document.getElementById('f_workNote');
  if (wn) wn.value = '';
  renderWorkTrail();
  // scroll to the folded list bar rather than the form itself, so "Back to the list" stays
  // on screen and the record still starts at the top
  const top = document.getElementById('cust-list-panel');
  (top && top.classList.contains('list-min') ? top : document.getElementById('cust-editor'))
    .scrollIntoView({ behavior: 'smooth', block: 'start' });
}
/* While a record is open the list folds to a single line: the form lands at the top of the
   screen instead of below a few hundred rows. "Back to the list" brings it straight back,
   and the record stays open underneath it. */
function minimiseCustomerList(on) {
  const panel = document.getElementById('cust-list-panel');
  if (!panel) return;
  panel.classList.toggle('list-min', !!on);
  const note = document.getElementById('cust-min-note');
  if (note) {
    const n = document.querySelectorAll('#cust-list-body tr.cust-row, #cust-list-body tr[data-id]').length
              || (STATE.customers || []).length;
    note.innerHTML = on
      ? `List folded away while this record is open &middot; <b>${n}</b> unit${n === 1 ? '' : 's'} in view`
      : '';
  }
}
function showCustomerList() {
  minimiseCustomerList(false);
  const panel = document.getElementById('cust-list-panel');
  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ================= The builder's report =================
   A one-page picture of where a project stands, drawn as SVG from the same figures the
   dashboard shows and handed over as a PNG. Nothing is screenshotted: the sheet is built
   here, so it can be reshaped for whatever a particular builder wants to see without
   touching the dashboard.

   It carries the Project Overview and nothing else -- no customer-level ledgers, no PAN or
   Aadhar, no other builder's numbers. */
const RPT_W = 1400;
const RPT_C = {
  ink: '#12151c', mid: '#4a5160', faint: '#8b93a3',
  line: '#e3e6ec', panel: '#f7f8fa', white: '#ffffff',
  brand: '#1447d6', good: '#1f9d55', warn: '#c47f17', crit: '#c8322b',
  s1: '#1447d6', s2: '#6b8cf0', s3: '#1f9d55', s4: '#b9c0cf',
};
const RPT_FONT = "'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

function svgEsc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function sT(x, y, text, o) {
  o = o || {};
  return `<text x="${x}" y="${y}" font-family="${RPT_FONT}" font-size="${o.size || 13}"` +
    ` font-weight="${o.weight || 400}" fill="${o.fill || RPT_C.ink}"` +
    ` text-anchor="${o.anchor || 'start'}"${o.spacing ? ` letter-spacing="${o.spacing}"` : ''}>${svgEsc(text)}</text>`;
}
function sR(x, y, w, h, o) {
  o = o || {};
  return `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${Math.max(0, h)}"` +
    ` fill="${o.fill || RPT_C.white}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 1}"` : ''}` +
    ` rx="${o.r == null ? 8 : o.r}"/>`;
}

/* a labelled progress bar: collected against invoiced */
function rptMeter(x, y, w, label, invoiced, collected) {
  const pct = invoiced > 0 ? Math.min(100, Math.round(collected / invoiced * 100)) : 0;
  const barY = y + 20, barH = 12;
  return sT(x, y + 12, label, { size: 12.5, weight: 600 })
    + sT(x + w, y + 12, `${fmtCompact(collected)} of ${fmtCompact(invoiced)}  ·  ${pct}%`,
         { size: 12, fill: RPT_C.mid, anchor: 'end' })
    + sR(x, barY, w, barH, { fill: RPT_C.line, r: 6 })
    + sR(x, barY, w * (pct / 100), barH, { fill: pct >= 85 ? RPT_C.good : pct >= 50 ? RPT_C.s1 : RPT_C.warn, r: 6 });
}
function rptSection(x, y, title) {
  return sT(x, y, title.toUpperCase(), { size: 11, weight: 700, fill: RPT_C.brand, spacing: 0.6 })
       + `<line x1="${x}" y1="${y + 9}" x2="${RPT_W - 48}" y2="${y + 9}" stroke="${RPT_C.line}" stroke-width="1"/>`;
}

/* what the sheet is built from -- all of it already computed for the dashboard */
function builderReportData() {
  const k = DATA.kpis;
  const tl = DATA.payment_timeline || [];
  const msMap = {}, msOrder = [];
  tl.forEach(t => {
    if (!msMap[t.milestone]) { msMap[t.milestone] = { invoiced: 0, collected: 0 }; msOrder.push(t.milestone); }
    if (t.status !== 'Not Yet Due') msMap[t.milestone].invoiced += t.amount;
    if (t.status === 'Paid') msMap[t.milestone].collected += t.amount;
    else if (t.status === 'Partially Paid') msMap[t.milestone].collected += (t.amount_paid || 0);
  });
  const milestones = msOrder.map(m => ({ label: m, ...msMap[m] })).filter(d => d.invoiced > 0);

  const twMap = {};
  DATA.customers.forEach(c => {
    const w = 'Tower ' + (c.tower || c.wing || '–');
    if (!twMap[w]) twMap[w] = { invoiced: 0, collected: 0 };
    twMap[w].invoiced += c.agreement_value;
    twMap[w].collected += c.received;
  });
  const towers = Object.keys(twMap).sort().map(w => ({ label: w, ...twMap[w] }));

  const queue = buildActionQueue();
  const banks = bankGroups(queue).filter(g => g.bank !== 'OWN FUNDS');
  const overdue = queue.filter(q => q.type === 'overdue');
  const buckets = [
    { label: 'Up to 15 days', n: 0, amt: 0, color: RPT_C.good },
    { label: '16 to 45 days', n: 0, amt: 0, color: RPT_C.warn },
    { label: 'Over 45 days',  n: 0, amt: 0, color: RPT_C.crit },
  ];
  overdue.forEach(q => {
    const d = Math.abs(q.daysToDue || 0);
    const b = d <= 15 ? buckets[0] : d <= 45 ? buckets[1] : buckets[2];
    b.n++; b.amt += q.outstanding;
  });
  const gstDue = DATA.customers.reduce((a, c) => a + c.gst_due, 0);
  const gstRecd = DATA.customers.reduce((a, c) => a + c.gst_received, 0);
  const ocr = ocrReportRows();
  return {
    k, milestones, towers, banks, buckets,
    overdueTotal: overdue.reduce((a, q) => a + q.outstanding, 0), overdueCount: overdue.length,
    bankPending: queue.reduce((a, q) => a + q.bankShare, 0),
    gstDue, gstRecd,
    ocrReq: ocr.reduce((a, r) => a + r.ownReq, 0),
    ocrPending: ocr.reduce((a, r) => a + r.ownPending, 0),
    status: DATA.status_dist || [],
  };
}

function buildBuilderReportSVG() {
  const d = builderReportData();
  const f = soleSelectedFile();
  const proj = visibleProjects()[0] || {};
  const builder = proj.builder || (f ? f.partner : 'Builder');
  const today = new Date();
  const M = 48, W = RPT_W - M * 2;
  let y = 0;
  const parts = [];

  // ---------- header ----------
  parts.push(sR(0, 0, RPT_W, 108, { fill: RPT_C.brand, r: 0 }));
  parts.push(sT(M, 46, 'PERFECT SOLUTIONS', { size: 21, weight: 800, fill: '#fff', spacing: 1.2 }));
  parts.push(sT(M, 70, 'Collection status report', { size: 13.5, fill: '#dbe4ff' }));
  parts.push(sT(RPT_W - M, 46, fmtDate(today), { size: 13.5, weight: 700, fill: '#fff', anchor: 'end' }));
  parts.push(sT(RPT_W - M, 70, 'figures as recorded in the Collection MIS', { size: 11.5, fill: '#dbe4ff', anchor: 'end' }));
  y = 148;
  parts.push(sT(M, y, builder, { size: 24, weight: 800 }));
  parts.push(sT(M, y + 24, `${ctxLabel()}  ·  ${d.k.units} unit${d.k.units === 1 ? '' : 's'}`,
    { size: 13, fill: RPT_C.mid }));
  y += 62;

  // ---------- headline numbers ----------
  const tiles = [
    { l: 'Agreement value', v: fmtCompact(d.k.total_agreement), s: `${d.k.units} units` },
    { l: 'Collected',       v: fmtCompact(d.k.total_received), s: `${d.k.collection_pct}% of agreement value`, good: true },
    { l: 'Outstanding now', v: fmtCompact(d.k.total_balance), s: 'against demands already raised', bad: true },
    { l: 'Collection efficiency', v: d.k.due_collection_pct + '%', s: 'received vs demanded', good: true },
    { l: 'Loans sanctioned', v: fmtCompact(d.k.total_loan), s: `${d.k.bankFiles} loan${d.k.bankFiles === 1 ? '' : 's'}` },
    { l: 'Awaited from banks', v: fmtCompact(d.bankPending), s: 'on open demands' },
  ];
  const tw = (W - 5 * 14) / 6;
  tiles.forEach((t, i) => {
    const x = M + i * (tw + 14);
    parts.push(sR(x, y, tw, 92, { fill: RPT_C.panel, stroke: RPT_C.line }));
    parts.push(sT(x + 14, y + 26, t.l, { size: 11, weight: 600, fill: RPT_C.faint }));
    parts.push(sT(x + 14, y + 56, t.v, { size: 22, weight: 800, fill: t.bad ? RPT_C.crit : t.good ? RPT_C.good : RPT_C.ink }));
    parts.push(sT(x + 14, y + 76, t.s, { size: 10.5, fill: RPT_C.mid }));
  });
  y += 128;

  // ---------- collection against the schedule ----------
  parts.push(rptSection(M, y, 'Collection against the payment schedule'));
  y += 28;
  const ms = d.milestones.slice(0, 12);
  if (ms.length) {
    ms.forEach(m => { parts.push(rptMeter(M, y, W, m.label, m.invoiced, m.collected)); y += 46; });
    if (d.milestones.length > ms.length) {
      parts.push(sT(M, y + 6, `+ ${d.milestones.length - ms.length} further stages not yet demanded`,
        { size: 11.5, fill: RPT_C.faint }));
      y += 22;
    }
  } else { parts.push(sT(M, y + 6, 'No demands raised yet.', { size: 12.5, fill: RPT_C.faint })); y += 26; }
  y += 18;

  // ---------- tower performance ----------
  parts.push(rptSection(M, y, 'Tower-wise performance'));
  y += 28;
  d.towers.slice(0, 10).forEach(t => { parts.push(rptMeter(M, y, W, t.label, t.invoiced, t.collected)); y += 46; });
  y += 18;

  // ---------- what is outstanding ----------
  parts.push(rptSection(M, y, 'What is outstanding'));
  y += 28;
  const halfW = (W - 24) / 2;
  const boxH = 150;
  parts.push(sR(M, y, halfW, boxH, { fill: RPT_C.panel, stroke: RPT_C.line }));
  parts.push(sT(M + 16, y + 26, 'Overdue demands', { size: 12, weight: 700 }));
  parts.push(sT(M + 16, y + 56, fmtCompact(d.overdueTotal), { size: 22, weight: 800, fill: d.overdueTotal ? RPT_C.crit : RPT_C.good }));
  parts.push(sT(M + 16, y + 76, `${d.overdueCount} demand${d.overdueCount === 1 ? '' : 's'} past their due date`, { size: 11.5, fill: RPT_C.mid }));
  let by = y + 98;
  const maxB = Math.max(1, ...d.buckets.map(b => b.amt));
  d.buckets.forEach(b => {
    parts.push(sT(M + 16, by + 8, b.label, { size: 10.5, fill: RPT_C.mid }));
    parts.push(sR(M + 122, by, (halfW - 210) * (b.amt / maxB), 9, { fill: b.color, r: 4 }));
    parts.push(sT(M + halfW - 16, by + 8, b.amt ? fmtCompact(b.amt) : '–', { size: 10.5, weight: 700, anchor: 'end', fill: RPT_C.mid }));
    by += 16;
  });
  const bx = M + halfW + 24;
  parts.push(sR(bx, y, halfW, boxH, { fill: RPT_C.panel, stroke: RPT_C.line }));
  parts.push(sT(bx + 16, y + 26, 'With the banks', { size: 12, weight: 700 }));
  parts.push(sT(bx + 16, y + 56, fmtCompact(d.bankPending), { size: 22, weight: 800, fill: RPT_C.s1 }));
  parts.push(sT(bx + 16, y + 76, 'still to be disbursed on open demands', { size: 11.5, fill: RPT_C.mid }));
  let ky = y + 98;
  d.banks.slice(0, 3).forEach(g => {
    parts.push(sT(bx + 16, ky + 8, g.bank, { size: 10.5, fill: RPT_C.mid }));
    parts.push(sT(bx + halfW - 16, ky + 8, `${fmtCompact(g.disbursed)} of ${fmtCompact(g.sanctioned)} disbursed`,
      { size: 10.5, weight: 700, anchor: 'end', fill: RPT_C.mid }));
    ky += 16;
  });
  y += boxH + 26;

  // ---------- customer's own money & GST ----------
  parts.push(rptSection(M, y, 'Customer own contribution and GST'));
  y += 28;
  parts.push(rptMeter(M, y, halfW, 'Own contribution received', d.ocrReq, d.ocrReq - d.ocrPending));
  parts.push(rptMeter(bx, y, halfW, 'GST received', d.gstDue, d.gstRecd));
  y += 62;

  // ---------- footer ----------
  parts.push(`<line x1="${M}" y1="${y}" x2="${RPT_W - M}" y2="${y}" stroke="${RPT_C.line}" stroke-width="1"/>`);
  parts.push(sT(M, y + 24, 'Prepared by Perfect Solutions  ·  perfectfinadvisory.com  ·  support@perfectfinadvisory.com',
    { size: 11.5, fill: RPT_C.mid }));
  parts.push(sT(RPT_W - M, y + 24, 'Turning your financial dreams into reality',
    { size: 11.5, fill: RPT_C.faint, anchor: 'end' }));
  const H = y + 56;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${RPT_W}" height="${H}" viewBox="0 0 ${RPT_W} ${H}">`
    + sR(0, 0, RPT_W, H, { fill: RPT_C.white, r: 0 }) + parts.join('') + '</svg>';
}

function reportFileName(ext) {
  const f = soleSelectedFile();
  const proj = visibleProjects()[0] || {};
  const base = String(proj.builder || (f ? f.partner : 'Builder')).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `${base || 'Builder'}_Collection_Report_${toISODate(new Date())}.${ext}`;
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* the merged view is several builders at once: one builder must never be handed another
   builder's numbers, so the export asks you to pick a file first */
function exportGuard() {
  const partners = [...new Set(visibleCustomers().map(c => (fileById(c._file) || {}).partner))];
  if (partners.length > 1) {
    askTell({ title: 'Pick one builder first',
      body: `This view has ${partners.length} builder partners in it, and a report meant for one of them must not carry another one’s figures.`,
      note: 'Choose the builder partner (or one of its projects) above, then export.' });
    return true;
  }
  if (!visibleCustomers().length) {
    askTell({ title: 'Nothing to report yet', body: 'Load a project with units in it first.' });
    return true;
  }
  return false;
}

function exportBuilderSVG() {
  if (exportGuard()) return;
  downloadBlob(new Blob([buildBuilderReportSVG()], { type: 'image/svg+xml;charset=utf-8' }), reportFileName('svg'));
}

/* PNG at 2x, so it stays sharp pasted into WhatsApp, a mail or a deck */
function exportBuilderPNG() {
  if (exportGuard()) return;
  const btn = document.getElementById('btn-export-open');
  const label = btn ? btn.getAttribute('title') : '';
  if (btn) { btn.disabled = true; btn.setAttribute('title', 'Building…'); }
  const svg = buildBuilderReportSVG();
  const wm = svg.match(/width="(\d+)" height="(\d+)"/);
  const w = wm ? +wm[1] : RPT_W, h = wm ? +wm[2] : 2000;
  const img = new Image();
  const done = () => { if (btn) { btn.disabled = false; btn.setAttribute('title', label || 'Share this overview'); } };
  img.onload = () => {
    try {
      const scale = 2;
      const cv = document.createElement('canvas');
      cv.width = w * scale; cv.height = h * scale;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.drawImage(img, 0, 0);
      cv.toBlob(blob => {
        if (blob) downloadBlob(blob, reportFileName('png'));
        else notify('The image could not be generated. The vector version gives the same report.');
        done();
      }, 'image/png');
    } catch (e) { console.error(e); notify('Could not build the image: ' + e.message); done(); }
  };
  img.onerror = () => { notify('Could not build the image. Try the vector version.'); done(); };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/* ================= The MIS folder: many builder files, one workspace =================
   Every file in the MIS reports folder is loaded at once and lives in one shared state.
   Each record carries the file it came from, so:
     - selecting builders or projects is a FILTER, not a reload;
     - an edit is written straight back into the record, and the file that owns it is the
       one marked unsaved. Nobody has to pick a file before typing.
   A file is a builder's project workbook; its folder name is the builder partner.
*/
let FILES = [];                       // { id, label, partner, fileName, bytes, dirty }
let SEL = { files: 'all' };           // 'all' or an array of file ids

function fileById(id) { return FILES.find(f => f.id === id) || null; }
function fileLabel(id) { const f = fileById(id); return f ? f.label : ''; }
function selectedFileIds() { return SEL.files === 'all' ? FILES.map(f => f.id) : SEL.files.filter(fileById); }
function fileSelected(id) { return SEL.files === 'all' || SEL.files.indexOf(id) >= 0; }
function soleSelectedFile() {
  const ids = selectedFileIds();
  return ids.length === 1 ? fileById(ids[0]) : null;
}
function dirtyFiles() { return FILES.filter(f => f.dirty); }

/* mark the workbook that owns a record. Everything that writes calls this with the record
   (or its file id) it touched, so "unsaved" always points at the right file. */
function markDirty(target) {
  DIRTY = true;
  let ids = [];
  if (typeof target === 'string') ids = [target];
  else if (target && target._file) ids = [target._file];
  else if (target === undefined) ids = selectedFileIds();      // a change with no owner: whatever is in view
  ids.forEach(id => { const f = fileById(id); if (f) f.dirty = true; });
  updateStatusLine();
  if (typeof renderFileBar === 'function') renderFileBar();
  if (typeof setSaveState === 'function') setSaveState(dirtyFiles().length ? 'unsaved' : 'saved');
  if (typeof queueAutosave === 'function') queueAutosave();
}
function markClean(label) {
  DIRTY = dirtyFiles().length > 0;
  if (label) SOURCE_LABEL = label;
  updateStatusLine();
}
function updateStatusLine() {
  const el = document.getElementById('status-line');
  if (!el) return;
  el.textContent = statusText();
  el.classList.remove('dirty');
  if (typeof setSaveState === 'function') setSaveState(dirtyFiles().length ? 'unsaved' : 'saved');
}

/* ---------- loading ---------- */
/* partner = the folder the file sits in, inside the MIS reports folder */
function partnerFromPath(path, fileName) {
  if (!path) return '';
  const parts = String(path).split('/').filter(Boolean);
  parts.pop();                                   // drop the file itself
  if (!parts.length) return '';
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
}

async function loadOneWorkbook(file, partner) {
  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const parsed = parseWorkbookIntoState(wb, uid);
  const builder = (parsed.projects[0] || {}).builder || '';
  // the file name is what they see in the folder, and two projects can carry the same
  // project name inside; the workbook is identified by the file, the project by the project
  const label = String(file.name).replace(/\.(xlsx|xlsm)$/i, '');
  const f = { id: uid('f'), label, partner: partner || builder || 'Unfiled',
              fileName: file.name, bytes: buf, dirty: false };

  // settings are shared across the workspace: the first file sets them, later files do not
  // silently rewrite what is already there
  if (!FILES.length) {
    resetConfig();
    if (parsed.settings) Object.keys(parsed.settings).forEach(k => { CONFIG[k] = parsed.settings[k]; });
  }

  const clash = [];
  parsed.customers.forEach(c => {
    if (STATE.customers.some(x => String(x.name || '').trim().toLowerCase() === String(c.name || '').trim().toLowerCase()))
      clash.push(c.name);
  });

  // the builder partner's own record rides along with each of their projects: take the
  // fullest copy, so one project carrying their accounts fills them in everywhere
  const bRec = readBuilderSheet(wb);
  if (bRec) {
    const cur = STATE.builders[f.partner];
    const score = x => (x ? Object.values(x).filter(v => v && typeof v === 'string').length + (x.accounts || []).length * 3 : -1);
    if (score(bRec) > score(cur)) { bRec.name = f.partner; STATE.builders[f.partner] = bRec; }
  } else if (!STATE.builders[f.partner]) {
    STATE.builders[f.partner] = newBuilder(f.partner);
  }

  parsed.projects.forEach(p => STATE.projects.push({ ...p, _file: f.id }));

  /* Client numbers used to be unique inside one workbook. With every builder's file open at
     once they have to be unique across the whole folder, so a number already issued to
     somebody else is reissued here -- the next free one, never a number that has been used.
     It is our own reference, not the builder's, and every change is written to the trail. */
  const reissued = [];
  parsed.customers.forEach(c => {
    const rec = { ...c, _file: f.id };
    const taken = rec.psNo && STATE.customers.some(x => String(x.psNo || '').toUpperCase() === String(rec.psNo).toUpperCase());
    STATE.customers.push(rec);
    if (taken || !rec.psNo) {
      const was = rec.psNo || '(none)';
      rec.psNo = psNext(STATE.customers);
      reissued.push(`${rec.name}: ${was} → ${rec.psNo}`);
      addWorkNote(rec.name, 'fix', 'Client number reissued: the old one was already in use in another open project',
        `PS client no.: ${was} → ${rec.psNo}`);
      f.dirty = true;
    }
  });
  parsed.collections.forEach(e => STATE.collections.push({ ...e, _file: f.id }));
  Object.keys(parsed.milestonePaid || {}).forEach(n => {
    STATE.milestonePaid[n] = Object.assign(STATE.milestonePaid[n] || {}, parsed.milestonePaid[n]);
  });
  Object.keys(parsed.workNotes || {}).forEach(n => {
    STATE.workNotes[n] = (STATE.workNotes[n] || []).concat(parsed.workNotes[n]);
  });
  FILES.push(f);
  return { file: f, clash, reissued };
}

async function addFiles(fileList) {
  const picked = [...fileList].filter(f => /\.(xlsx|xlsm)$/i.test(f.name));
  if (!picked.length) {
    await askTell({ title: 'Nothing to load there', body: 'No project records were found in what you picked.' });
    return;
  }
  const clashes = [], reissues = [];
  let added = 0;
  for (const file of picked) {
    const path = file.webkitRelativePath || '';
    const partner = partnerFromPath(path, file.name);
    // the same workbook again replaces what it replaced before
    const dup = FILES.find(f => f.fileName === file.name && f.partner === (partner || f.partner));
    if (dup) removeFileRecords(dup.id, true);
    try {
      const r = await loadOneWorkbook(file, partner);
      added++;
      if (r.clash.length) clashes.push(`${r.file.label}: ${r.clash.slice(0, 3).join(', ')}${r.clash.length > 3 ? '…' : ''}`);
      if (r.reissued.length) reissues.push(`<b>${esc(projectNameOf(r.file.id) || r.file.label)}</b>: ${r.reissued.length} client number${r.reissued.length === 1 ? '' : 's'} reissued`);
    } catch (err) {
      console.error(err);
      await askTell({ title: `Could not read ${file.name}`, body: err.message });
    }
  }
  if (!added) return;
  SEL = { files: 'all' };
  SOURCE_LABEL = FILES.length === 1 ? FILES[0].label : `${FILES.length} project files`;
  CTX = { projectId: 'all', towerId: 'all', partner: CTX ? CTX.partner : 'all' };
  closeEditor(); closeProjectEditor();
  renderFileBar(); renderContextBar(); renderProjectList(); refreshAll();
  updateStatusLine();
  if (reissues.length) {
    await askTell({ title: 'Client numbers made unique',
      body: 'Every project in the workspace is open together now, so a client number has to be unique across all of them. Numbers that were already in use have been reissued, and each one is logged in that customer\u2019s work notes.',
      note: reissues.join('<br>') + '<br><span class="muted">Save to keep the new numbers.</span>' });
  }
  if (clashes.length) {
    await askTell({ title: 'Two projects share a customer name',
      body: 'Receipts and milestones are matched to a customer by name, so the same name in two projects reads as one person until it is changed.',
      note: clashes.join('<br>') });
  }
}

function removeFileRecords(id, quiet) {
  const names = STATE.customers.filter(c => c._file === id).map(c => c.name);
  STATE.projects = STATE.projects.filter(p => p._file !== id);
  STATE.customers = STATE.customers.filter(c => c._file !== id);
  STATE.collections = STATE.collections.filter(e => e._file !== id);
  names.forEach(n => {
    if (!STATE.customers.some(c => c.name === n)) { delete STATE.milestonePaid[n]; delete STATE.workNotes[n]; }
  });
  FILES = FILES.filter(f => f.id !== id);
  if (SEL.files !== 'all') SEL.files = SEL.files.filter(x => x !== id);
  if (!quiet) { renderFileBar(); renderContextBar(); renderProjectList(); refreshAll(); updateStatusLine(); }
}

async function closeFile(id) {
  const f = fileById(id);
  if (!f) return;
  if (f.dirty && !await askConfirm({ title: `Close ${f.label}?`, danger: true,
        body: 'It has changes that are not saved yet.',
        confirmLabel: 'Close it and lose those changes' })) return;
  removeFileRecords(id);
}

/* ---------- saving ---------- */
/* the slice of the workspace that belongs to one file, in the shape the writer expects */
function stateOfFile(id) {
  const projects = STATE.projects.filter(p => p._file === id);
  const customers = STATE.customers.filter(c => c._file === id);
  const names = new Set(customers.map(c => c.name));
  const milestonePaid = {}, workNotes = {};
  Object.keys(STATE.milestonePaid).forEach(n => { if (names.has(n)) milestonePaid[n] = STATE.milestonePaid[n]; });
  Object.keys(STATE.workNotes).forEach(n => { if (names.has(n)) workNotes[n] = STATE.workNotes[n]; });
  return { projects, customers, milestonePaid, workNotes,
           builder: STATE.builders[(fileById(id) || {}).partner] || null,
           collections: STATE.collections.filter(e => e._file === id || (!e._file && names.has(e.customer))) };
}

/* Writing straight into the connected folder: the builder partner's folder is created if it
   is not there yet, and the project lands inside it. When no folder is connected the record
   comes down as a download instead, which is the only thing a browser can do unasked. */
async function writeIntoFolder(f, buf) {
  if (!FOLDER_HANDLE) return false;
  try {
    let perm = await FOLDER_HANDLE.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') perm = await FOLDER_HANDLE.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') return false;
    const dir = await FOLDER_HANDLE.getDirectoryHandle(f.partner, { create: true });
    const fh = await dir.getFileHandle(f.fileName || (f.label + '.xlsx'), { create: true });
    const w = await fh.createWritable();
    await w.write(new Blob([buf]));
    await w.close();
    return true;
  } catch (e) { console.warn('folder write failed', e); return false; }
}

async function saveFile(id, quiet) {
  const f = fileById(id);
  if (!f) return false;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(f.bytes.slice(0));
  writeStateToWorkbook(wb, stateOfFile(id));
  const buf = await wb.xlsx.writeBuffer();
  const wrote = await writeIntoFolder(f, buf);
  if (!wrote && !quiet) {
    const safe = String(f.label).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'MIS';
    downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
                 `${safe}_${toISODate(new Date())}.xlsx`);
  }
  if (wrote || !quiet) { f.bytes = buf; f.dirty = false; }
  return wrote || !quiet;
}

/* ---- granular saving: a builder, a project, a wing or one customer ---- */
function filesOfPartner(name) { return FILES.filter(f => f.partner === name); }
function fileOfProject(projectId) { const p = projectById(projectId); return p ? p._file : null; }

async function saveScope(scope) {
  const ids = scope.all ? dirtyFiles().map(f => f.id)
    : scope.partner ? filesOfPartner(scope.partner).map(f => f.id)
    : scope.project ? [fileOfProject(scope.project)]
    : scope.file ? [scope.file] : [];
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return false;
  setSaveState('saving');
  let all = true;
  try { for (const id of list) { const done = await saveFile(id, !!scope.quiet); all = all && done; } }
  catch (err) { console.error(err); notify('Could not save those changes: ' + err.message); all = false; }
  setSaveState(dirtyFiles().length ? 'unsaved' : 'saved');
  return all;
}

/* With the folder connected everything saves itself a moment after each change. Without one
   there is nowhere to write, so the changes wait for the Save button. */
let AUTOSAVE_TIMER = null, LOADING = false;
function queueAutosave() {
  if (LOADING || !FOLDER_HANDLE) return;
  clearTimeout(AUTOSAVE_TIMER);
  AUTOSAVE_TIMER = setTimeout(() => { saveScope({ all: true, quiet: true }); }, 1200);
}
function setSaveState(state) {
  const el = document.getElementById('save-state');
  if (!el) return;
  const n = dirtyFiles().length;
  const auto = !!FOLDER_HANDLE;
  el.className = 'save-state ' + state;
  el.innerHTML = state === 'saving' ? '<span class="dot"></span>Saving…'
    : n === 0 ? '<span class="dot"></span>All changes saved'
    : auto ? '<span class="dot"></span>Saving…'
    : `<span class="dot"></span>${n} record${n === 1 ? '' : 's'} with unsaved changes
       <button class="btn-tiny" id="btn-save-now" type="button">Save changes</button>`;
  const b = document.getElementById('btn-save-now');
  if (b) b.addEventListener('click', () => saveScope({ all: true }));
}
async function doSave() { await saveScope({ all: true }); }


/* ================= Builder partners =================
   A builder partner is the top of the tree: their own folder, and inside it a workspace per
   project. Their details and their bank accounts belong to the partner, not to any one
   project, so the record is carried by every project they own and edited in one place.

   Accounts are typed because builders run several: the RERA-designated account that has to
   take 70% of collections, the separate account they may draw from, and usually different
   ones again for GST, maintenance and TDS. Money paid into the wrong one is a RERA problem,
   so the type is a field, not a note. */
const ACCOUNT_TYPES = [
  'RERA designated collection (70%)',
  'Separate / withdrawal (30%)',
  'Master collection',
  'GST payments',
  'Maintenance / society',
  'TDS',
  'Land / other',
];

function newAccount() {
  return { id: uid('ac'), label: '', type: ACCOUNT_TYPES[0], bank: '', branch: '',
           accountNo: '', ifsc: '', project: '', note: '' };
}
function newBuilder(name) {
  return { name: name || '', legalName: '', contactPerson: '', designation: '', phone: '', email: '',
           address: '', city: '', gstin: '', pan: '', rera: '', note: '', accounts: [] };
}
function builderOf(name) {
  if (!name) return newBuilder('');
  if (!STATE.builders[name]) STATE.builders[name] = newBuilder(name);
  return STATE.builders[name];
}
function buildersInPlay() {
  const out = [];
  partnersList().forEach(n => out.push(builderOf(n)));
  Object.keys(STATE.builders).forEach(n => { if (out.indexOf(STATE.builders[n]) < 0) out.push(STATE.builders[n]); });
  return out;
}
function projectsOfPartner(name) {
  const ids = FILES.filter(f => f.partner === name).map(f => f.id);
  return STATE.projects.filter(p => ids.indexOf(p._file) >= 0);
}
function accountsFor(partner, projectName) {
  const b = builderOf(partner);
  return (b.accounts || []).filter(a => !a.project || !projectName || a.project === projectName);
}

const BUILDER_FIELDS = [
  ['name', 'Builder partner'], ['legalName', 'Legal entity name'], ['contactPerson', 'Contact person'],
  ['designation', 'Designation'], ['phone', 'Phone'], ['email', 'Email'], ['address', 'Office address'],
  ['city', 'City'], ['gstin', 'GSTIN'], ['pan', 'PAN'], ['rera', 'RERA registration'], ['note', 'Notes'],
];
const ACCOUNT_COLS = [
  ['label', 'Account label'], ['type', 'Used for'], ['bank', 'Bank'], ['branch', 'Branch'],
  ['accountNo', 'Account number'], ['ifsc', 'IFSC'], ['project', 'For project'], ['note', 'Note'],
];

/* ---- the builder record inside a project workbook ---- */
function readBuilderSheet(wb) {
  const ws = wb.getWorksheet(SH_BUILDER);
  if (!ws) return null;
  const b = newBuilder('');
  const byLabel = {};
  BUILDER_FIELDS.forEach(([k, l]) => { byLabel[l.toLowerCase()] = k; });
  let r = 1, seenAccounts = false;
  const accCols = {};
  while (r < 400) {
    const a = String(cellVal(ws.getRow(r).getCell(1)) || '').trim();
    if (a.toUpperCase() === 'ACCOUNTS') {
      seenAccounts = true;
      ACCOUNT_COLS.forEach(([k], i) => { accCols[k] = i + 1; });
      r += 2;                                  // skip the header row
      while (r < 400) {
        const lbl = cellVal(ws.getRow(r).getCell(1));
        const num = cellVal(ws.getRow(r).getCell(5));
        if (!lbl && !num) break;
        const acc = newAccount();
        ACCOUNT_COLS.forEach(([k], i) => { acc[k] = String(cellVal(ws.getRow(r).getCell(i + 1)) || ''); });
        acc.id = uid('ac');
        b.accounts.push(acc);
        r++;
      }
      break;
    }
    if (a) {
      const key = byLabel[a.toLowerCase()];
      if (key) b[key] = String(cellVal(ws.getRow(r).getCell(2)) || '');
    }
    r++;
  }
  return b.name || b.accounts.length || b.gstin ? b : null;
}

/* ================= project contacts =================
   Who to tell. A project's people live with the project, not the builder, because a
   builder with four sites has four different accounts teams. Whoever is marked primary
   is who the daily brief goes to. */
const CONTACT_ROLES = ['Accounts', 'CRM', 'Sales', 'Project head', 'Director', 'Auditor', 'Other'];
const CONTACT_COLS = [['project','Project'], ['name','Name'], ['role','Role'],
                      ['email','Email'], ['phone','Phone'], ['primary','Primary']];
function newContact() { return { id: uid('ct'), name: '', role: 'Accounts', email: '', phone: '', primary: false }; }
function primaryContacts(project) {
  return ((project && project.contacts) || []).filter(c => c.primary && String(c.email || '').includes('@'));
}
function readContactsSheet(wb, projects) {
  const ws = wb.getWorksheet(SH_CONTACTS);
  if (!ws) return;
  let r = 2, blanks = 0;
  while (r < 5000) {
    const pname = cellVal(ws.getRow(r).getCell(1));
    const nm = cellVal(ws.getRow(r).getCell(2));
    if (!pname && !nm) { blanks++; if (blanks > 3) break; r++; continue; }
    blanks = 0;
    const proj = projects.find(x => x.name === String(pname || ''));
    if (proj) {
      if (!proj.contacts) proj.contacts = [];
      proj.contacts.push({ id: uid('ct'), name: String(nm || ''),
        role: cellVal(ws.getRow(r).getCell(3)) || 'Other',
        email: cellVal(ws.getRow(r).getCell(4)) || '',
        phone: cellVal(ws.getRow(r).getCell(5)) ? String(cellVal(ws.getRow(r).getCell(5))) : '',
        primary: String(cellVal(ws.getRow(r).getCell(6)) || '').trim().toUpperCase() === 'YES' });
    }
    r++;
  }
}
function writeContactsSheet(wb, S) {
  let ws = wb.getWorksheet(SH_CONTACTS);
  if (!ws) { ws = wb.addWorksheet(SH_CONTACTS);
    ws.columns = [{ width: 28 }, { width: 26 }, { width: 16 }, { width: 30 }, { width: 16 }, { width: 10 }]; }
  const last = Math.max(ws.actualRowCount || 0, ws.rowCount || 0, 2) + 5;
  for (let r = 1; r <= last; r++) { const row = ws.getRow(r); for (let c = 1; c <= 6; c++) row.getCell(c).value = null; }
  CONTACT_COLS.forEach(([, l], i) => { const c = ws.getRow(1).getCell(i + 1); c.value = l; c.font = { bold: true }; });
  let r = 2;
  (S.projects || []).forEach(p => {
    (p.contacts || []).forEach(ct => {
      const row = ws.getRow(r);
      row.getCell(1).value = p.name;
      row.getCell(2).value = ct.name || '';
      row.getCell(3).value = ct.role || '';
      row.getCell(4).value = ct.email || '';
      row.getCell(5).value = ct.phone || '';
      row.getCell(6).value = ct.primary ? 'YES' : '';
      row.commit(); r++;
    });
  });
}

function writeBuilderSheet(wb, builder) {
  if (!builder) return;
  let ws = wb.getWorksheet(SH_BUILDER);
  if (!ws) { ws = wb.addWorksheet(SH_BUILDER); ws.columns = [{ width: 26 }, { width: 46 }, { width: 22 },
    { width: 22 }, { width: 26 }, { width: 16 }, { width: 26 }, { width: 30 }]; }
  const last = Math.max(ws.rowCount, 2);
  for (let r = 1; r <= last; r++) { const row = ws.getRow(r); for (let c = 1; c <= 8; c++) row.getCell(c).value = null; }
  let r = 1;
  BUILDER_FIELDS.forEach(([k, l]) => {
    const row = ws.getRow(r);
    row.getCell(1).value = l; row.getCell(1).font = { bold: true };
    row.getCell(2).value = builder[k] || '';
    row.commit(); r++;
  });
  r++;
  ws.getRow(r).getCell(1).value = 'ACCOUNTS';
  ws.getRow(r).getCell(1).font = { bold: true };
  r++;
  ACCOUNT_COLS.forEach(([, l], i) => { const c = ws.getRow(r).getCell(i + 1); c.value = l; c.font = { bold: true }; });
  r++;
  (builder.accounts || []).forEach(a => {
    const row = ws.getRow(r);
    ACCOUNT_COLS.forEach(([k], i) => { row.getCell(i + 1).value = a[k] || ''; });
    row.commit(); r++;
  });
}

/* ---------------- the builder partner screen ---------------- */
let BUILDER_BUF = null, BUILDER_ORIG = null;

function renderBuilderList() {
  const tb = document.getElementById('bp-list-body');
  if (!tb) return;
  const list = buildersInPlay();
  const rows = pageSlice('builders', list);
  renderPager('bp-pager', 'builders', list.length, renderBuilderList);
  tb.innerHTML = rows.map(b => {
    const projects = projectsOfPartner(b.name);
    const units = STATE.customers.filter(c => projects.some(p => p.id === c.projectId)).length;
    return `<tr class="row-click bp-row" data-name="${esc(b.name)}">
      <td class="cn">${esc(b.name) || '<span class="muted">Unnamed</span>'}
        ${b.legalName ? `<div class="sub-line">${esc(b.legalName)}</div>` : ''}</td>
      <td>${b.contactPerson ? esc(b.contactPerson) : '<span class="muted">not on file</span>'}
        ${b.phone ? `<div class="sub-line">${esc(b.phone)}</div>` : ''}</td>
      <td>${b.gstin ? esc(b.gstin) : '<span class="muted">–</span>'}</td>
      <td class="num">${projects.length}</td>
      <td class="num">${units}</td>
      <td class="num">${(b.accounts || []).length
        ? (b.accounts || []).length : '<span class="warn-txt">none</span>'}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="6" class="empty-row">No builder partners yet. Onboard one and its projects live under it.</td></tr>`;
  tb.querySelectorAll('.bp-row').forEach(tr =>
    tr.addEventListener('click', () => openBuilderEditor(tr.dataset.name)));
  document.getElementById('bp-count').textContent = list.length;
}

function minimiseBuilderList(on) {
  const panel = document.getElementById('bp-list-panel');
  if (!panel) return;
  panel.classList.toggle('list-min', !!on);
  const note = document.getElementById('bp-min-note');
  if (note) note.textContent = on ? 'List folded away while this partner is open' : '';
}

function openBuilderEditor(name) {
  BUILDER_ORIG = name || null;
  BUILDER_BUF = JSON.parse(JSON.stringify(name ? builderOf(name) : newBuilder('')));
  document.getElementById('bp-editor-title').textContent =
    name ? `Builder partner: ${name}` : 'Onboard a builder partner';
  BUILDER_FIELDS.forEach(([k]) => {
    const el = document.getElementById('bf_' + k);
    if (el) el.value = BUILDER_BUF[k] || '';
  });
  renderAccountRows();
  document.getElementById('builder-editor').classList.add('show');
  minimiseBuilderList(true);
  document.getElementById('bp-list-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function closeBuilderEditor() {
  BUILDER_BUF = null; BUILDER_ORIG = null;
  document.getElementById('builder-editor').classList.remove('show');
  minimiseBuilderList(false);
}

function renderAccountRows() {
  const tb = document.getElementById('bp-acc-body');
  if (!tb || !BUILDER_BUF) return;
  const projects = projectsOfPartner(BUILDER_ORIG || BUILDER_BUF.name).map(p => p.name);
  tb.innerHTML = (BUILDER_BUF.accounts || []).map((a, i) => `
    <tr data-i="${i}">
      <td><input class="ac" data-k="label" value="${esc(a.label || '')}" placeholder="Collection A/C"></td>
      <td><select class="ac" data-k="type">${ACCOUNT_TYPES.map(t =>
            `<option value="${esc(t)}"${a.type === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></td>
      <td><input class="ac" data-k="bank" value="${esc(a.bank || '')}"></td>
      <td><input class="ac" data-k="branch" value="${esc(a.branch || '')}"></td>
      <td><input class="ac" data-k="accountNo" value="${esc(a.accountNo || '')}"></td>
      <td><input class="ac" data-k="ifsc" value="${esc(a.ifsc || '')}"></td>
      <td><select class="ac" data-k="project"><option value="">All projects</option>${projects.map(n =>
            `<option value="${esc(n)}"${a.project === n ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></td>
      <td><button class="btn-tiny danger ac-del" type="button">Remove</button></td>
    </tr>`).join('') || `<tr><td colspan="8" class="empty-row">No accounts yet. Add the collection account first.</td></tr>`;
  tb.querySelectorAll('.ac').forEach(el => el.addEventListener('input', e => {
    const i = +el.closest('tr').dataset.i;
    BUILDER_BUF.accounts[i][el.dataset.k] = el.value;
  }));
  tb.querySelectorAll('.ac').forEach(el => el.addEventListener('change', e => {
    const i = +el.closest('tr').dataset.i;
    BUILDER_BUF.accounts[i][el.dataset.k] = el.value;
  }));
  tb.querySelectorAll('.ac-del').forEach(b => b.addEventListener('click', () => {
    BUILDER_BUF.accounts.splice(+b.closest('tr').dataset.i, 1);
    renderAccountRows();
  }));
}

/* Saving a builder partner writes their record into every project they own, and where a
   folder is connected it also creates their folder if this is a brand-new partner. */
async function saveBuilderEditor() {
  if (!BUILDER_BUF) return;
  BUILDER_FIELDS.forEach(([k]) => {
    const el = document.getElementById('bf_' + k);
    if (el) BUILDER_BUF[k] = el.value.trim();
  });
  const name = BUILDER_BUF.name;
  if (!name) { await askTell({ title: 'Name the builder partner', body: 'Their projects are filed under this name.' }); return; }
  if (name !== BUILDER_ORIG && STATE.builders[name] && BUILDER_ORIG) {
    await askTell({ title: 'That name is taken', body: `${name} already exists as a builder partner.` }); return;
  }
  // a rename carries their projects across: the workspace folder is moved below, the
  // file registry is re-tagged here, and every project row that names the old builder is
  // rewritten -- otherwise the folder says one thing and the spreadsheet inside says another
  if (BUILDER_ORIG && BUILDER_ORIG !== name) {
    const moved = filesOfPartner(BUILDER_ORIG);
    moved.forEach(f => { f.partner = name; });
    const movedIds = new Set(moved.map(f => f.id));
    STATE.projects.forEach(pr => {
      if (movedIds.has(pr._file) || pr.builder === BUILDER_ORIG) pr.builder = name;
    });
    // accounts are pinned to a partner's projects by name; keep those pointers valid
    (BUILDER_BUF.accounts || []).forEach(a => { if (a.partner === BUILDER_ORIG) a.partner = name; });
    delete STATE.builders[BUILDER_ORIG];
    if (!STATE.workNotes) STATE.workNotes = {};
    const key = '(workspace)';
    if (!STATE.workNotes[key]) STATE.workNotes[key] = [];
    STATE.workNotes[key].push({ when: new Date().toISOString(), type: 'change',
      note: `Builder partner renamed: ${BUILDER_ORIG} \u2192 ${name}`,
      changed: `${moved.length} project${moved.length === 1 ? '' : 's'} and their folder moved with them` });
  }
  STATE.builders[name] = BUILDER_BUF;
  const mine = filesOfPartner(name);
  mine.forEach(f => markDirty(f.id));
  closeBuilderEditor();
  renderBuilderList(); renderContextBar(); renderProjectList(); refreshAll();

  // their place on disk is made the moment they are onboarded, not when their first
  // project happens to be saved -- a partner with nothing under them still has a home
  const home = await ensurePartnerFolder(name, BUILDER_ORIG);
  if (mine.length) await saveScope({ partner: name });

  if (home === 'made') {
    await askTell({ title: `${name} is onboarded`,
      body: `A folder for them is ready in your workspace. Their projects go inside it.`,
      confirmLabel: 'Right' });
  } else if (home === 'no-folder') {
    await askTell({ title: `${name} is onboarded`,
      body: 'They are on the list, but nothing has been written to your computer yet: no workspace folder is connected.',
      note: 'Open the gear icon &rarr; <b>MIS reports folder</b> &rarr; <b>Choose folder…</b>. After that every partner, project and change writes itself into that folder.',
      confirmLabel: 'Got it' });
  } else if (home === 'denied') {
    await askTell({ title: `${name} is onboarded`,
      body: 'Their folder could not be created: the browser did not grant permission to write into your workspace folder.',
      note: 'Open the gear icon &rarr; <b>MIS reports folder</b> and choose it again, allowing edits this time.',
      confirmLabel: 'Got it' });
  } else if (!mine.length) {
    await askTell({ title: `${name} is onboarded`,
      body: 'Their folder is in place. Add their first project and it is filed under them straight away.',
      confirmLabel: 'Right' });
  }
}

/* Make (or rename) the builder partner's own folder inside the workspace folder.
   Returns 'made' | 'exists' | 'no-folder' | 'denied'. */
async function ensurePartnerFolder(name, previousName) {
  if (!FOLDER_HANDLE) return 'no-folder';
  try {
    let perm = await FOLDER_HANDLE.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') perm = await FOLDER_HANDLE.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') return 'denied';
    let existed = true;
    try { await FOLDER_HANDLE.getDirectoryHandle(name, { create: false }); }
    catch (e) { existed = false; }
    const dir = await FOLDER_HANDLE.getDirectoryHandle(name, { create: true });
    // a renamed partner: carry their projects into the new folder, then drop the old one
    if (previousName && previousName !== name) {
      try {
        const old = await FOLDER_HANDLE.getDirectoryHandle(previousName, { create: false });
        for await (const [fn, entry] of old.entries()) {
          if (entry.kind !== 'file') continue;
          const src = await entry.getFile();
          const fh = await dir.getFileHandle(fn, { create: true });
          const w = await fh.createWritable();
          await w.write(await src.arrayBuffer());
          await w.close();
        }
        await FOLDER_HANDLE.removeEntry(previousName, { recursive: true });
      } catch (e) { console.warn('could not move the old folder', e); }
      return 'made';
    }
    return existed ? 'exists' : 'made';
  } catch (e) {
    console.warn('partner folder', e);
    return 'denied';
  }
}

/* ================= The remembered MIS reports folder =================
   A browser cannot be handed a path like C:\Users\...\MIS reports and read it -- nothing on
   a web page may touch the disk unasked. What it can do, in Chrome and Edge, is remember a
   folder you picked once: the handle is kept in this browser's own storage, and on the next
   open the whole workspace loads from it (one click if the browser wants permission
   re-confirmed). Elsewhere -- Firefox, Safari -- the folder is picked each session, which is
   the same two clicks as before. The path is also written into the workbooks as a label, so
   everyone on the team can see which folder the files are supposed to live in. */
const FOLDER_DB = 'psmis', FOLDER_STORE = 'handles', FOLDER_KEY = 'misFolder';
let FOLDER_HANDLE = null;

function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(FOLDER_DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(FOLDER_STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(key, val) {
  try {
    const db = await idbOpen();
    await new Promise((res, rej) => {
      const tx = db.transaction(FOLDER_STORE, 'readwrite');
      tx.objectStore(FOLDER_STORE).put(val, key);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch (e) { console.warn('folder not remembered', e); }
}
async function idbGet(key) {
  try {
    const db = await idbOpen();
    return await new Promise((res, rej) => {
      const tx = db.transaction(FOLDER_STORE, 'readonly');
      const rq = tx.objectStore(FOLDER_STORE).get(key);
      rq.onsuccess = () => res(rq.result || null);
      rq.onerror = () => rej(rq.error);
    });
  } catch (e) { return null; }
}
function folderApi() { return typeof window.showDirectoryPicker === 'function'; }

/* walk the folder: every .xlsx inside every builder-partner subfolder */
async function filesFromHandle(dir) {
  const out = [];
  async function walk(handle, path) {
    for await (const [name, entry] of handle.entries()) {
      if (entry.kind === 'directory') await walk(entry, path ? path + '/' + name : name);
      else if (/\.(xlsx|xlsm)$/i.test(name) && !name.startsWith('~$')) {
        const file = await entry.getFile();
        // the loader reads the partner off this, exactly as the folder picker gives it
        Object.defineProperty(file, 'webkitRelativePath', { value: (path ? path + '/' : '') + name });
        out.push(file);
      }
    }
  }
  await walk(dir, '');
  return out;
}

async function pickMisFolder() {
  if (!folderApi()) {
    await askTell({ title: 'This browser picks the folder each time',
      body: 'Remembering a folder needs Chrome or Edge. Use <b>Add MIS folder…</b> at the top and choose your MIS reports folder.',
      note: 'Everything else works the same.' });
    return;
  }
  let dir;
  try { dir = await window.showDirectoryPicker({ id: 'ps-mis', mode: 'read' }); }
  catch (e) { return; }                                    // they cancelled
  FOLDER_HANDLE = dir;
  await idbPut(FOLDER_KEY, dir);
  CONFIG.misFolderPath = dir.name;
  FILES.forEach(f => markDirty(f.id));
  renderFolderSetting();
  await loadFromFolderHandle();
}

async function loadFromFolderHandle() {
  if (!FOLDER_HANDLE) { await pickMisFolder(); return; }
  let perm = 'granted';
  try {
    perm = await FOLDER_HANDLE.queryPermission({ mode: 'read' });
    if (perm !== 'granted') perm = await FOLDER_HANDLE.requestPermission({ mode: 'read' });
  } catch (e) { perm = 'denied'; }
  if (perm !== 'granted') {
    await askTell({ title: 'The folder needs permission again',
      body: 'The browser asks once per session before a page may read a folder it remembered.' });
    return;
  }
  const files = await filesFromHandle(FOLDER_HANDLE);
  if (!files.length) {
    await askTell({ title: 'Nothing in that folder',
      body: `No .xlsx files were found under <b>${esc(FOLDER_HANDLE.name)}</b>.`,
      note: 'Each builder partner gets a folder, and their project workbooks go inside it.' });
    return;
  }
  hideFolderBanner();
  await addFiles(files);
}

function hideFolderBanner() { const el = document.getElementById('folder-banner'); if (el) el.style.display = 'none'; }
function showFolderBanner(name, count) {
  const el = document.getElementById('folder-banner');
  if (!el) return;
  el.style.display = 'flex';
  el.innerHTML = `<span>Your MIS reports folder <b>${esc(name)}</b> is remembered on this computer.</span>
    <span class="spacer"></span>
    <button class="btn-primary btn-tiny" id="fb-load" type="button">Load everything from it</button>
    <button class="btn-tiny" id="fb-dismiss" type="button">Not now</button>`;
  document.getElementById('fb-load').addEventListener('click', () => loadFromFolderHandle());
  document.getElementById('fb-dismiss').addEventListener('click', hideFolderBanner);
}

function renderFolderSetting() {
  const inp = document.getElementById('set-folder-path');
  const hint = document.getElementById('set-folder-hint');
  if (!inp) return;
  inp.value = FOLDER_HANDLE ? FOLDER_HANDLE.name : (CONFIG.misFolderPath || '');
  const btn = document.getElementById('btn-reload-folder');
  if (btn) btn.disabled = !FOLDER_HANDLE;
  if (hint) hint.innerHTML = !folderApi()
    ? 'This browser cannot remember a folder. Use <b>Add MIS folder…</b> each session (Chrome and Edge can remember it).'
    : FOLDER_HANDLE
      ? 'Remembered. Every time you open the application it offers to load the whole workspace.'
      : 'Not set yet. Choose the folder that holds your builder-partner folders.';
}

/* on open: if a folder was remembered, load it outright when the browser still trusts us,
   and otherwise offer it as one click (a page may not read a folder without a gesture) */
async function initMisFolder() {
  if (!folderApi()) { renderFolderSetting(); return; }
  const dir = await idbGet(FOLDER_KEY);
  if (!dir) { renderFolderSetting(); return; }
  FOLDER_HANDLE = dir;
  renderFolderSetting();
  let perm = 'prompt';
  try { perm = await dir.queryPermission({ mode: 'read' }); } catch (e) { perm = 'prompt'; }
  if (perm === 'granted') await loadFromFolderHandle();
  else showFolderBanner(dir.name, 0);
}

async function forgetMisFolder() {
  FOLDER_HANDLE = null;
  await idbPut(FOLDER_KEY, null);
  CONFIG.misFolderPath = '';
  hideFolderBanner();
  renderFolderSetting();
}

/* ================= Where should this go? =================
   With every builder's file open at once, "add a customer" has to start with which builder,
   which project and which wing -- and any of the three may not exist yet. One dialog asks,
   creates whatever is missing (a new project means a new workbook), and hands back the
   target. Nothing is ever added to whichever file happens to be selected. */
const NEW_ = '__new__';
let TG_RESOLVE = null;

function tgPartners() { return partnersList(); }
function tgProjectsFor(partner) {
  const ids = FILES.filter(f => f.partner === partner).map(f => f.id);
  return STATE.projects.filter(p => ids.indexOf(p._file) >= 0);
}
function tgFill() {
  const ps = document.getElementById('tg_partner');
  const partner = ps.value;
  document.getElementById('tg_partner_new_wrap').style.display = partner === NEW_ ? 'block' : 'none';
  const prj = document.getElementById('tg_project');
  const list = partner === NEW_ ? [] : tgProjectsFor(partner);
  prj.innerHTML = list.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')
    + `<option value="${NEW_}">+ New project</option>`;
  if (!list.length) prj.value = NEW_;
  tgFillTowers();
}
function tgFillTowers() {
  const isNewProject = document.getElementById('tg_project').value === NEW_;
  document.getElementById('tg_project_new_wrap').style.display = isNewProject ? 'block' : 'none';
  const tw = document.getElementById('tg_tower');
  const p = isNewProject ? null : projectById(document.getElementById('tg_project').value);
  tw.innerHTML = (p ? p.towers.map(t => `<option value="${esc(t.id)}">Tower ${esc(t.name)}</option>`).join('') : '')
    + `<option value="${NEW_}">+ New wing</option>`;
  if (!p || !p.towers.length) tw.value = NEW_;
  document.getElementById('tg_tower_new_wrap').style.display = tw.value === NEW_ ? 'block' : 'none';
}
function openTargetDialog(mode) {
  const forCustomer = mode !== 'project';
  document.getElementById('tg-title').textContent = forCustomer ? 'Where does this customer go?' : 'Where does this go?';
  document.getElementById('tg-sub').textContent = forCustomer
    ? 'Builder partner, then the project, then the wing.'
    : 'Pick the builder partner, then add a new project, or a new wing to one that exists.';
  document.getElementById('tg_tower_wrap').style.display = forCustomer ? 'block' : 'block';
  const ps = document.getElementById('tg_partner');
  ps.innerHTML = tgPartners().map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('')
    + `<option value="${NEW_}">+ New builder partner</option>`;
  if (CTX.partner && CTX.partner !== 'all' && tgPartners().indexOf(CTX.partner) >= 0) ps.value = CTX.partner;
  else if (!tgPartners().length) ps.value = NEW_;
  document.getElementById('tg_partner_new').value = '';
  document.getElementById('tg_project_new').value = '';
  document.getElementById('tg_tower_new').value = '';
  tgFill();
  document.getElementById('target-dialog').classList.add('show');
  return new Promise(res => { TG_RESOLVE = res; });
}
function closeTargetDialog(result) {
  document.getElementById('target-dialog').classList.remove('show');
  const r = TG_RESOLVE; TG_RESOLVE = null;
  if (r) r(result || null);
}

/* a brand-new workbook for a project that has no file yet */
function newFileFor(partner, projectName) {
  const f = { id: uid('f'), label: projectName, partner: partner,
              fileName: `${projectName}.xlsx`, bytes: BASE_WORKBOOK_BYTES.slice(0), dirty: true };
  FILES.push(f);
  const p = newProject();
  p.name = projectName;
  p.builder = partner;
  p._file = f.id;
  STATE.projects.push(p);
  if (SEL.files !== 'all') SEL.files = SEL.files.concat([f.id]);
  return { file: f, project: p };
}

async function confirmTarget() {
  const partnerSel = document.getElementById('tg_partner').value;
  const partner = partnerSel === NEW_ ? document.getElementById('tg_partner_new').value.trim() : partnerSel;
  if (!partner) { await askTell({ title: 'Name the builder partner', body: 'Their projects are filed under this name.' }); return; }
  // a partner named here for the first time becomes a real record, with their own place on disk
  if (!STATE.builders[partner]) { STATE.builders[partner] = newBuilder(partner); await ensurePartnerFolder(partner); }

  let project;
  if (document.getElementById('tg_project').value === NEW_) {
    const name = document.getElementById('tg_project_new').value.trim();
    if (!name) { await askTell({ title: 'Name the project', body: 'A project is created under this name.' }); return; }
    if (STATE.projects.some(p => String(p.name).toLowerCase() === name.toLowerCase())) {
      await askTell({ title: 'That project already exists', body: `${name} is already open. Pick it from the list instead.` }); return;
    }
    project = newFileFor(partner, name).project;
  } else {
    project = projectById(document.getElementById('tg_project').value);
    if (!project) { await askTell({ title: 'Pick a project', body: 'Choose one, or create a new project.' }); return; }
  }

  let tower;
  if (document.getElementById('tg_tower').value === NEW_) {
    const tname = document.getElementById('tg_tower_new').value.trim();
    if (!tname) { await askTell({ title: 'Name the wing', body: 'Every unit sits in a tower or wing.' }); return; }
    tower = newTower();
    tower.name = tname;
    project.towers.push(tower);
  } else {
    tower = project.towers.find(t => t.id === document.getElementById('tg_tower').value);
  }
  markDirty(project);
  closeTargetDialog({ fileId: project._file, project, tower });
}

/* everything that creates a record starts here: pick the target, then open the right editor */
async function addCustomerFlow() {
  const t = await openTargetDialog('customer');
  if (!t || !t.tower) return;
  CTX.partner = (fileById(t.fileId) || {}).partner || 'all';
  if (SEL.files !== 'all' && SEL.files.indexOf(t.fileId) < 0) SEL.files = SEL.files.concat([t.fileId]);
  CTX.projectId = t.project.id; CTX.towerId = t.tower.id;
  renderContextBar(); renderProjectList(); refreshAll();
  const c = newCustomer();
  c.projectId = t.project.id;
  c.towerId = t.tower.id;
  c.wing = t.tower.name;
  c.psNo = psNext(STATE.customers);           // unique across every open file
  c._file = t.fileId;
  STATE.customers.push(c);
  markDirty(c);
  renderCustomerList();
  openEditor(c.id);
}

async function addProjectFlow() {
  const t = await openTargetDialog('project');
  if (!t) return;
  CTX.partner = (fileById(t.fileId) || {}).partner || 'all';
  if (SEL.files !== 'all' && SEL.files.indexOf(t.fileId) < 0) SEL.files = SEL.files.concat([t.fileId]);
  CTX.projectId = t.project.id; CTX.towerId = t.tower ? t.tower.id : 'all';
  renderContextBar(); renderProjectList(); refreshAll(); updateStatusLine();
  openProjectEditor(t.project.id);
}

/* ================= Pagination =================
   One paginator for every listing in the tool. Each table keeps its own page and its own
   Rows selector, both starting from the rowsPerPage setting, so "10 rows" means the same
   thing on the action queue, the customer list and inside a report drawer. */
const PAGE_SIZES = [5, 10, 20, 50, 0];        // 0 = show everything
const PAGERS = {};

function pagerState(key) {
  if (!PAGERS[key]) PAGERS[key] = { size: Math.max(0, Math.round(cfg('rowsPerPage') || 10)), page: 1 };
  return PAGERS[key];
}
function pagerReset(key) { pagerState(key).page = 1; }
function pagerPages(key, total) {
  const p = pagerState(key);
  return p.size > 0 ? Math.max(1, Math.ceil(total / p.size)) : 1;
}
/* the slice of rows this page shows, with the page clamped to what exists */
function pageSlice(key, rows) {
  const p = pagerState(key);
  const pages = pagerPages(key, rows.length);
  p.page = Math.min(Math.max(1, p.page), pages);
  if (!(p.size > 0)) return rows;
  const from = (p.page - 1) * p.size;
  return rows.slice(from, from + p.size);
}
/* draws the control under a table and wires it to re-render whatever owns it */
function renderPager(hostId, key, total, rerender) {
  const host = document.getElementById(hostId);
  if (!host) return;
  const p = pagerState(key);
  const pages = pagerPages(key, total);
  const size = p.size > 0 ? p.size : total;
  const from = total ? (p.size > 0 ? (p.page - 1) * p.size + 1 : 1) : 0;
  const to = p.size > 0 ? Math.min(p.page * p.size, total) : total;
  host.className = 'pager';
  host.innerHTML = `
    <label>Rows <select class="pg-size">${PAGE_SIZES.map(n =>
      `<option value="${n}"${n === p.size ? ' selected' : ''}>${n === 0 ? 'All' : n}</option>`).join('')}</select></label>
    <span class="pager-gap"></span>
    <button class="btn-tiny pg-first" type="button" ${p.page <= 1 ? 'disabled' : ''}>&laquo; First</button>
    <button class="btn-tiny pg-prev" type="button" ${p.page <= 1 ? 'disabled' : ''}>&lsaquo; Prev</button>
    <span class="pager-info">${total ? `${from}–${to} of ${total}` : 'nothing to show'}${
        pages > 1 ? `  ·  page ${p.page} of ${pages}` : ''}</span>
    <button class="btn-tiny pg-next" type="button" ${p.page >= pages ? 'disabled' : ''}>Next &rsaquo;</button>
    <button class="btn-tiny pg-last" type="button" ${p.page >= pages ? 'disabled' : ''}>Last &raquo;</button>`;
  const go = fn => { fn(); rerender(); };
  host.querySelector('.pg-size').addEventListener('change', e =>
    go(() => { p.size = parseInt(e.target.value, 10); p.page = 1; }));
  host.querySelector('.pg-first').addEventListener('click', () => go(() => { p.page = 1; }));
  host.querySelector('.pg-prev').addEventListener('click', () => go(() => { p.page--; }));
  host.querySelector('.pg-next').addEventListener('click', () => go(() => { p.page++; }));
  host.querySelector('.pg-last').addEventListener('click', () => go(() => { p.page = pages; }));
}
/* the setting changed: every listing goes back to that many rows */
function resetAllPagers() {
  const n = Math.max(0, Math.round(cfg('rowsPerPage') || 10));
  Object.keys(PAGERS).forEach(k => { PAGERS[k].size = n; PAGERS[k].page = 1; });
}

/* ================= Customer form: columns, collapsing, tabs =================
   Sixty-odd fields on one page is a wall. Two sections carry the work that gets done every
   day -- who the customer is, and how the flat is being funded -- so those stay open. The
   rest are filed behind tabs: still one click away, no longer in the way. The layout is
   built from the existing markup at startup, so every field keeps its id and every rule,
   required-field marker and highlight still points at the same box. */
const EDITOR_PRIMARY = ['Customer details', 'How it is being funded'];
const EDITOR_TAB_ORDER = ['Where this unit sits', 'Co-applicants', 'Area & pricing', 'Cost of the flat',
  'GST, TDS & current dues', 'Who is collecting', 'Own contribution plan',
  'Milestone schedule preview', 'Remarks', 'Work notes'];
let EDITOR_TAB = null;
const FIELD_LABELS = {};

function sectionTitle(sec) {
  const h = sec.querySelector('h4');
  if (!h) return '';
  const first = [...h.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
  return (first ? first.textContent : h.textContent).trim().replace(/\s+/g, ' ').replace(/[,\s]+$/, '');
}

/* ================= Co-applicants =================
   A home loan is underwritten on the household, not one name: the second and third
   earners on the agreement are what get a file sanctioned. The builder's own daily sales
   report carries one co-applicant and their PAN; a lender wants the rest of the identity,
   so the block below is the DSR's two fields plus what a bank actually asks for.
   Four is the practical ceiling -- no lender on our panel underwrites more. */
const MAX_COAPPLICANTS = 4;
const COAPP_ORDINALS = ['1st', '2nd', '3rd', '4th'];
const COAPP_RELATIONS = ['Spouse', 'Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister',
                         'Business partner', 'Other'];
const COAPP_FIELDS = [
  ['name',      'Co-applicant name', 'text',  ''],
  ['relation',  'Relation to applicant', 'select', ''],
  ['pan',       'PAN number',        'text',  ''],
  ['aadhar',    'Aadhar number',     'text',  ''],
  ['contact',   'Contact number',    'text',  ''],
  ['email',     'Email',             'text',  ''],
  ['profession','Profession',        'text',  ''],
  ['income',    'Annual income',     'num',   'used by the bank to size the sanction'],
  ['address',   'Address',           'text',  ''],
];
function newCoApplicant() {
  const o = { id: uid('ca') };
  COAPP_FIELDS.forEach(([k, , t]) => { o[k] = t === 'num' ? 0 : ''; });
  return o;
}
/* older records carry a single flat pair of fields; lift them into the list on the way in
   so nothing that was typed before this existed is lost */
function coApplicantsOf(c) {
  if (!c) return [];
  if (!Array.isArray(c.coApplicants)) {
    c.coApplicants = (c.coApplicant || c.coApplicantPan)
      ? [Object.assign(newCoApplicant(), { name: c.coApplicant || '', pan: c.coApplicantPan || '' })]
      : [];
  }
  return c.coApplicants;
}
function coApplicantLabel(ca, i) {
  return (ca && String(ca.name || '').trim()) || `${COAPP_ORDINALS[i] || (i + 1) + 'th'} co-applicant`;
}
function coApplicantSummary(c) {
  const list = coApplicantsOf(c).filter(x => String(x.name || '').trim());
  return list.map(x => x.name.trim()).join(', ');
}

function renderCoApplicants() {
  const host = document.getElementById('coapp-list');
  if (!host || !EDIT_BUFFER) return;
  const list = coApplicantsOf(EDIT_BUFFER);
  host.innerHTML = list.length ? list.map((ca, i) => `
    <div class="coapp" data-idx="${i}">
      <div class="coapp-head">
        <div class="ttl"><span class="ord">${COAPP_ORDINALS[i] || (i + 1) + 'th'} co-applicant</span></div>
        <button class="btn-tiny danger" type="button" data-coapp-remove="${i}">Remove</button>
      </div>
      <div class="fgrid">
        ${COAPP_FIELDS.map(([k, label, type, hint]) => {
          const id = `f_ca${i}_${k}`;
          const v = ca[k] == null ? '' : ca[k];
          const ctl = type === 'select'
            ? `<select id="${id}" data-coapp="${i}" data-cak="${k}"><option value=""></option>${
                 COAPP_RELATIONS.map(r => `<option${String(v) === r ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select>`
            : `<input ${type === 'num' ? 'type="number" ' : ''}id="${id}" data-coapp="${i}" data-cak="${k}" value="${esc(type === 'num' && !v ? '' : v)}">`;
          return `<div class="fld"><label>${esc(label)}</label>${ctl}${hint ? `<div class="set-hint">${esc(hint)}</div>` : ''}</div>`;
        }).join('')}
      </div>
    </div>`).join('')
    : `<div class="coapp-empty">No co-applicant on this agreement yet.</div>`;

  const btn = document.getElementById('btn-add-coapp');
  if (btn) {
    const full = list.length >= MAX_COAPPLICANTS;
    btn.style.display = full ? 'none' : '';
    btn.textContent = `+ Add ${COAPP_ORDINALS[list.length] || (list.length + 1) + 'th'} co-applicant`;
  }
  applyFieldHelp(host);
  const note = document.getElementById('coapp-note');
  if (note) note.textContent = list.length
    ? `, ${list.length} of ${MAX_COAPPLICANTS} added`
    : `, up to ${MAX_COAPPLICANTS}`;
}

function readCoApplicantsForm() {
  if (!EDIT_BUFFER) return;
  const list = coApplicantsOf(EDIT_BUFFER);
  document.querySelectorAll('#coapp-list [data-coapp]').forEach(el => {
    const i = parseInt(el.dataset.coapp, 10), k = el.dataset.cak;
    if (!list[i]) return;
    const type = (COAPP_FIELDS.find(f => f[0] === k) || [])[2];
    list[i][k] = type === 'num' ? (el.value === '' ? 0 : parseFloat(el.value) || 0) : el.value;
  });
  // keep the two legacy columns pointing at the first co-applicant so the builder's own
  // report format still reads correctly
  EDIT_BUFFER.coApplicant = list[0] ? (list[0].name || '') : '';
  EDIT_BUFFER.coApplicantPan = list[0] ? (list[0].pan || '') : '';
}

function addCoApplicantRow() {
  if (!EDIT_BUFFER) return;
  readCoApplicantsForm();
  const list = coApplicantsOf(EDIT_BUFFER);
  if (list.length >= MAX_COAPPLICANTS) return;
  list.push(newCoApplicant());
  renderCoApplicants();
  const first = document.getElementById(`f_ca${list.length - 1}_name`);
  if (first) first.focus();
}

async function removeCoApplicantRow(i) {
  if (!EDIT_BUFFER) return;
  readCoApplicantsForm();
  const list = coApplicantsOf(EDIT_BUFFER);
  const ca = list[i];
  if (!ca) return;
  if (String(ca.name || '').trim() && !await askConfirm({
        title: 'Remove this co-applicant?',
        body: `<b>${esc(ca.name)}</b> comes off this agreement record.`,
        confirmLabel: 'Remove', danger: true })) return;
  list.splice(i, 1);
  renderCoApplicants();
}

/* ================= The stage banner =================
   Drawn at the head of an open record, on both of its tabs, because "what happens next"
   is a property of the stage and not of whichever form section happens to be open. */
function renderStageBanner() {
  const host = document.getElementById('cust-stage-banner');
  if (!host) return;
  const c = EDIT_BUFFER;
  if (!c) { host.innerHTML = ''; return; }
  const cur = stageOf(c);
  const idx = STAGE_IDS.indexOf(cur);
  const l = towerOf(c);
  const where = [l.project ? l.project.name : '', l.tower ? 'Tower ' + l.tower.name : '',
                 c.flat ? 'Flat ' + c.flat : '', c.type || ''].filter(Boolean).join(' · ');

  const stopped = cur === 'cancelled';
  host.classList.toggle('sb-banner-stopped', stopped);

  const steps = STAGES.map((s, i) => {
    const cls = stopped ? 'skipped' : i < idx ? 'done' : i === idx ? 'now' : '';
    return `<button type="button" class="sb-step ${cls}" data-stage="${s.id}"
              title="Move this unit to “${esc(s.label)}”">
              <span class="bar"></span><span class="lb">${esc(s.label)}<span class="sub">${esc(s.sub)}</span></span>
            </button>`;
  }).join('');

  // funding runs alongside, not in line
  let fund;
  if (isSelfFunded(c)) {
    fund = `<span class="sb-chip past">Self-funded, no loan</span>`;
  } else if (String(c.dlStatus || '').toUpperCase() === 'REJECTED') {
    fund = `<span class="sb-chip bad">Loan rejected</span>`;
  } else {
    const fi = FUND_STEPS.findIndex(f => f.id === String(c.dlStatus || 'NOT STARTED').toUpperCase());
    fund = FUND_STEPS.map((f, i) =>
      `<span class="sb-chip ${i < fi ? 'past' : i === fi ? 'on' : ''}">${esc(f.label)}</span>`).join('');
  }
  const bank = String(c.bankOrOwn || '').trim();

  host.innerHTML = `
    <div class="sb-top">
      <div class="sb-who">${esc(c.name || 'New customer')}</div>
      <div class="sb-where">${esc(where)}</div>
      <div class="sb-hint">Click a step to move this unit${c.stage ? ' · set by hand' : ' · read from the record'}</div>
    </div>
    ${stopped ? `<div class="sb-stopped-note">Cancelled${c.cancelDate ? ' on ' + fmtDate(c.cancelDate) : ''}${
        c.cancelReason ? ' &mdash; ' + esc(c.cancelReason) : ''}. This unit is out of every collection figure.</div>` : ''}
    <div class="sb-track">${steps}</div>
    <div class="sb-fund">
      <span class="cap">Funding</span>${fund}
      ${bank && !isSelfFunded(c) ? `<span class="sb-chip">${esc(bank)}</span>` : ''}
      ${c.loanAmount ? `<span class="sb-chip">Sanctioned ${fmtINR(c.loanAmount)}</span>` : ''}
      <span class="sb-hint" style="margin-left:auto;">Set on the “How it is being funded” section</span>
    </div>`;

  host.querySelectorAll('.sb-step').forEach(b =>
    b.addEventListener('click', () => setCustomerStage(b.dataset.stage)));
}

function setCustomerStage(id) {
  if (!EDIT_BUFFER || !STAGE_IDS.includes(id)) return;
  readEditorForm();
  EDIT_BUFFER.stage = id;
  const bs = STAGE_TO_BOOKING[id];
  if (bs) {
    EDIT_BUFFER.bookingStatus = bs;
    const el = document.getElementById('f_bookingStatus');
    if (el) el.value = bs;
  }
  renderStageBanner();
  recomputeEditorPreview();
}

function setupCustomerEditor() {
  const ed = document.getElementById('cust-editor');
  if (!ed || ed.dataset.laidOut) return;
  ed.dataset.laidOut = '1';

  /* ---- the record's own two tabs, built here rather than in the markup so the form
     sections below stay one flat list for everything that reads them ---- */
  const head = ed.querySelector('.head');
  const banner = document.createElement('div');
  banner.id = 'cust-stage-banner';
  banner.className = 'stage-banner';
  head.after(banner);

  const recTabs = document.createElement('div');
  recTabs.className = 'rec-tabs';
  recTabs.id = 'rec-tabs';
  recTabs.innerHTML = `<button type="button" class="rec-tab active" data-rec="info">Information</button>
                       <button type="button" class="rec-tab" data-rec="timeline">Payment timeline</button>`;
  banner.after(recTabs);

  const info = document.createElement('div');
  info.id = 'rec-info';
  let n = recTabs.nextSibling;
  while (n) { const next = n.nextSibling; info.appendChild(n); n = next; }
  ed.appendChild(info);

  const timeline = document.createElement('div');
  timeline.id = 'rec-timeline';
  const tlPanel = document.querySelector('#mtab-timeline .panel');
  if (tlPanel) timeline.appendChild(tlPanel);
  ed.appendChild(timeline);

  recTabs.addEventListener('click', e => {
    const b = e.target.closest('.rec-tab');
    if (b) showRecordTab(b.dataset.rec);
  });

  // remember what every field is called, for the change trail
  FIELD_MAP.forEach(([k]) => {
    const el = document.getElementById('f_' + k);
    const lab = el && el.closest('.fld') && el.closest('.fld').querySelector('label');
    // the label may carry a help badge whose bubble text is not part of the field's name
    const text = lab ? [...lab.childNodes]
      .filter(n => !(n.nodeType === 1 && n.classList.contains('fhelp')))
      .map(n => n.textContent).join('') : '';
    FIELD_LABELS[k] = lab ? text.replace('*', '').trim() : k;
  });

  const secs = [...info.querySelectorAll('.form-section')];
  secs.forEach(sec => {
    const h = sec.querySelector('h4');
    const body = document.createElement('div');
    body.className = 'sec-body';
    while (h.nextSibling) body.appendChild(h.nextSibling);
    sec.appendChild(body);
    sec.dataset.sec = sectionTitle(sec);
    h.addEventListener('click', () => {
      if (sec.closest('#cust-tabs')) return;       // tabbed sections are shown by their tab
      sec.classList.toggle('collapsed');
    });
  });

  const byTitle = t => secs.find(x => x.dataset.sec === t);
  const tabsWrap = document.createElement('div');
  tabsWrap.id = 'cust-tabs';
  const strip = document.createElement('div');
  strip.className = 'ed-tabs';
  tabsWrap.appendChild(strip);
  info.appendChild(tabsWrap);

  // the two everyday sections first, open; everything else into the tab strip in order
  EDITOR_PRIMARY.forEach(t => { const sec = byTitle(t); if (sec) info.insertBefore(sec, tabsWrap); });
  const tabbed = EDITOR_TAB_ORDER.map(byTitle).filter(Boolean)
    .concat(secs.filter(x => !EDITOR_PRIMARY.includes(x.dataset.sec) && !EDITOR_TAB_ORDER.includes(x.dataset.sec)));
  tabbed.forEach(sec => {
    tabsWrap.appendChild(sec);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ed-tab';
    btn.dataset.sec = sec.dataset.sec;
    btn.textContent = sec.dataset.sec;
    btn.addEventListener('click', () => showEditorTab(sec.dataset.sec));
    strip.appendChild(btn);
  });
  showEditorTab(tabbed.length ? tabbed[0].dataset.sec : null);
  applyEditorCols();
}

/* Information vs Payment timeline. The timeline used to be its own top-level tab with a
   customer picker of its own, which meant picking the same person twice to see one unit. */
let RECORD_TAB = 'info';
function showRecordTab(which) {
  RECORD_TAB = (which === 'timeline') ? 'timeline' : 'info';
  const info = document.getElementById('rec-info');
  const tl = document.getElementById('rec-timeline');
  if (!info || !tl) return;
  info.classList.toggle('hide', RECORD_TAB === 'timeline');
  tl.classList.toggle('show', RECORD_TAB === 'timeline');
  document.querySelectorAll('#rec-tabs .rec-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.rec === RECORD_TAB));
  if (RECORD_TAB === 'timeline') { pagerReset('timeline'); renderMilestones(); }
}

function showEditorTab(title) {
  EDITOR_TAB = title;
  document.querySelectorAll('#cust-tabs .form-section').forEach(sec =>
    sec.classList.toggle('ed-open', sec.dataset.sec === title));
  document.querySelectorAll('#cust-tabs .ed-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.sec === title));
  if (title === 'Work notes') renderWorkTrail();
}

/* the field may be behind a tab or inside a collapsed section: open whatever is hiding it */
function revealField(key) {
  const el = document.getElementById('f_' + key);
  if (!el) return null;
  if (el.closest('#rec-info') && RECORD_TAB !== 'info') showRecordTab('info');
  const sec = el.closest('.form-section');
  if (sec) {
    sec.classList.remove('collapsed');
    if (sec.closest('#cust-tabs')) showEditorTab(sec.dataset.sec);
  }
  return el;
}

/* Columns are a setting, but a 3-column form on a 900px window is unreadable, so the
   count steps down on narrow screens rather than overflowing. */
/* ================= Field help =================
   Turns the explanatory line under a field into an ⓘ on its label. The hint element itself
   is MOVED rather than copied, so anything that keeps writing to it by id -- the client
   number lock, the demand picker, the contacts note -- carries on working and simply
   updates what the bubble says.

   Only static help moves. A hint with an id is usually live state (which folder is
   connected, what the computed GST rate is, how many units were built), and that belongs on
   screen; the three named below are help text that happens to have an id. */
const FHELP_IDS = ['psno-hint', 'coll_against_hint', 'pf-contact-hint'];
function applyFieldHelp(root) {
  (root || document).querySelectorAll('.fld > .set-hint').forEach(hint => {
    if (hint.closest('.fhelp')) return;                        // already moved
    if (hint.id && !FHELP_IDS.includes(hint.id)) return;        // live state, leave it visible
    const fld = hint.parentElement;
    // a label normally, but a few fields are a bare button with a note under it
    let host = fld.querySelector(':scope > label');
    if (!host) {
      const prev = hint.previousElementSibling;
      if (prev && prev.tagName === 'BUTTON') host = prev;
    }
    if (!host) return;                                          // nothing to hang it off
    const badge = document.createElement('span');
    badge.className = 'fhelp';
    badge.tabIndex = 0;
    badge.setAttribute('role', 'note');
    badge.setAttribute('aria-label', 'What this field is for');
    badge.textContent = 'i';
    badge.appendChild(hint);
    host.appendChild(badge);
  });
}
/* clicking the ⓘ inside a checkbox's label would otherwise tick the box */
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('.fhelp');
  if (b) { e.preventDefault(); e.stopPropagation(); b.focus(); }
}, true);
/* keep the bubble inside the window rather than letting it run off the edge */
document.addEventListener('mouseover', e => {
  const b = e.target.closest && e.target.closest('.fhelp');
  if (!b) return;
  b.classList.remove('flip-left', 'flip-right');
  const pop = b.querySelector('.set-hint');
  if (!pop) return;
  const r = b.getBoundingClientRect();
  const half = Math.min(250, pop.offsetWidth || 250) / 2;
  if (r.left + half > window.innerWidth - 12) b.classList.add('flip-left');
  else if (r.left - half < 12) b.classList.add('flip-right');
});

function applyEditorCols() {
  const ed = document.getElementById('cust-editor');
  if (!ed) return;
  const want = Math.max(1, Math.min(5, Math.round(cfg('editorCols') || 3)));
  const w = window.innerWidth;
  const eff = w < 820 ? 1 : w < 1240 ? Math.min(2, want) : want;
  ed.style.setProperty('--fgrid-cols', eff);
}

/* ================= Work notes =================
   Every change to a customer record, kept with the record. Not an afterthought field: the
   trail is written by the app itself, so "who moved this sanction figure and when" has an
   answer without anyone remembering to write it down. Typed notes sit in the same stream. */
function workNotesFor(name) { return (STATE.workNotes && STATE.workNotes[name]) || []; }

function addWorkNote(name, kind, text, changesText) {
  if (!name) return;
  if (!STATE.workNotes) STATE.workNotes = {};
  if (!STATE.workNotes[name]) STATE.workNotes[name] = [];
  STATE.workNotes[name].push({ ts: new Date().toISOString(), kind: kind || 'note',
                               text: text || '', changesText: changesText || '' });
}

/* how a value reads in the trail */
function trailValue(k, t, v) {
  if (v == null || v === '') return '(empty)';
  if (t === 'date') { const d = (v instanceof Date) ? v : parseDateInput(v); return d ? fmtDate(d) : '(empty)'; }
  if (t === 'bool') return v ? 'yes' : 'no';
  if (k === 'projectId') { const p = STATE.projects.find(x => x.id === v); return p ? p.name : String(v); }
  if (k === 'towerId') { const x = allTowers().find(y => y.tower.id === v); return x ? x.tower.name : String(v); }
  if (t === 'num') return Number(v) ? fmtINR(Number(v)) : String(v);
  return String(v);
}

/* what actually changed between the record on file and the form being saved */
function diffCustomer(prev, next) {
  if (!prev) return '';
  const out = [];
  FIELD_MAP.forEach(([k, t]) => {
    let a = prev[k], b = next[k];
    if (t === 'date') { a = toISODate(a); b = toISODate(b); }
    else if (t === 'num') { a = num(a, 0); b = num(b, 0); }
    else if (t === 'bool') { a = !!a; b = !!b; }
    else { a = a == null ? '' : String(a); b = b == null ? '' : String(b); }
    if (a === b) return;
    out.push(`${FIELD_LABELS[k] || k}: ${trailValue(k, t, prev[k])} → ${trailValue(k, t, next[k])}`);
  });
  // co-applicants live in a list, so the trail names the person rather than a field id
  const pa = coApplicantsOf(prev), na = coApplicantsOf(next);
  for (let i = 0; i < Math.max(pa.length, na.length); i++) {
    const a = pa[i], b = na[i];
    if (a && !b) { out.push(`Co-applicant ${i + 1} removed: ${coApplicantLabel(a, i)}`); continue; }
    if (!a && b) { out.push(`Co-applicant ${i + 1} added: ${coApplicantLabel(b, i)}`); continue; }
    COAPP_FIELDS.forEach(([k, label, t]) => {
      const x = t === 'num' ? num(a[k], 0) : String(a[k] == null ? '' : a[k]);
      const y = t === 'num' ? num(b[k], 0) : String(b[k] == null ? '' : b[k]);
      if (x !== y) out.push(`Co-applicant ${i + 1} ${label.toLowerCase()}: ${x || '—'} → ${y || '—'}`);
    });
  }
  return out.join('\n');
}

function renderWorkTrail() {
  const host = document.getElementById('work-trail');
  if (!host) return;
  const name = EDIT_BUFFER ? EDIT_BUFFER.name : null;
  const list = workNotesFor(name).slice().reverse();
  const KIND = { note: 'note', edit: 'change', fix: 'fixed' };
  host.innerHTML = list.map(n => {
    const d = new Date(n.ts);
    const when = isNaN(d) ? esc(n.ts) : `${fmtDate(d)}<div class="wn-when">${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>`;
    const changes = (n.changesText || '').split('\n').filter(Boolean).map(line => {
      const i = line.indexOf(': ');
      const lab = i > 0 ? line.slice(0, i) : '';
      const rest = i > 0 ? line.slice(i + 2) : line;
      const parts = rest.split(' → ');
      return `<div class="wn-change">${lab ? `<b>${esc(lab)}</b>: ` : ''}` +
        (parts.length === 2 ? `<span class="wn-was">${esc(parts[0])}</span> → <b>${esc(parts[1])}</b>` : esc(rest)) + '</div>';
    }).join('');
    return `<div class="wn-item"><div class="wn-when">${when}</div>
      <div><span class="wn-kind ${esc(n.kind)}">${KIND[n.kind] || n.kind}</span>
        ${n.text ? `<div>${esc(n.text)}</div>` : ''}${changes}</div></div>`;
  }).join('') || `<div class="empty-row" style="padding:14px 0;">Nothing recorded on this unit yet. Every change you save from here on is logged, and you can add your own notes above.</div>`;

  const tab = document.querySelector('#cust-tabs .ed-tab[data-sec="Work notes"]');
  if (tab) tab.innerHTML = 'Work notes' + (list.length ? ` <span class="sec-count">${list.length}</span>` : '');
}

function addTypedWorkNote() {
  const el = document.getElementById('f_workNote');
  const text = (el.value || '').trim();
  if (!text || !EDIT_BUFFER) { if (el) el.focus(); return; }
  addWorkNote(EDIT_BUFFER.name, 'note', text, '');
  el.value = '';
  markDirty(EDIT_BUFFER);
  renderWorkTrail();
}

function closeEditor() {
  CURRENT_CUSTOMER_ID = null; EDIT_BUFFER = null;
  minimiseCustomerList(false);
  const el = document.getElementById('cust-editor');
  if (el) el.classList.remove('show');
  const banner = document.getElementById('cust-stage-banner');
  if (banner) banner.innerHTML = '';
  renderMilestones();
}
function readEditorForm() {
  if (!EDIT_BUFFER) return;
  FIELD_MAP.forEach(([k, t]) => {
    const el = document.getElementById('f_' + k);
    if (!el) return;
    if (k === 'projectId' || k === 'towerId') { EDIT_BUFFER[k] = el.value || null; return; }
    if (t === 'bool') { EDIT_BUFFER[k] = !!el.checked; return; }
    if (t === 'date') EDIT_BUFFER[k] = parseDateInput(el.value);
    else if (t === 'num') EDIT_BUFFER[k] = el.value === '' ? 0 : parseFloat(el.value);
    else EDIT_BUFFER[k] = el.value;
  });
  readCoApplicantsForm();
  const l = towerOf(EDIT_BUFFER);
  if (l.tower) EDIT_BUFFER.wing = l.tower.name;
}
function recomputeEditorPreview() {
  if (!EDIT_BUFFER) return;
  readEditorForm();
  const cc = toCalcCustomer(EDIT_BUFFER);
  const schedule = scheduleForCustomer(EDIT_BUFFER);
  const d = deriveCustomer(cc, sumRecoveryFor(cc.name), schedule);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('calc_Q', d.Q.toLocaleString('en-IN') + ' sq.ft');
  set('calc_R', d.R.toLocaleString('en-IN') + ' sq.mt');
  ['U','V','AA','AB','AD','AG','AI','AJ','AM','AN','AY','BA','BB','BE'].forEach(k => set('calc_' + k, fmtINR(d[k])));
  renderFundingPreview(EDIT_BUFFER);
  renderLoanExpectation(EDIT_BUFFER);
  set('calc_AL', fmtINR(d.AL) + '  (from Collections)');
  set('calc_AZ', fmtINR(d.AZ) + '  (from Collections)');
  const rr = realisedRate(EDIT_BUFFER);
  set('calc_realised', rr ? fmtINR(rr) + ' / sq.ft' : '\u2014');
  const mDue = (EDIT_BUFFER.maintenanceAmt || 0) + (EDIT_BUFFER.maintenanceGst || 0);
  const mGot = (EDIT_BUFFER.maintenanceReceived || 0) + (EDIT_BUFFER.maintenanceGstReceived || 0);
  set('calc_maintBal', mDue || mGot ? fmtINR(Math.max(0, mDue - mGot)) : '\u2014');
  const body = document.getElementById('milestone-preview-body');
  if (body) {
    const l = towerOf(EDIT_BUFFER);
    document.getElementById('milestone-preview-note').textContent =
      l.tower ? `Tower ${l.tower.name} schedule: ${schedule.length} stages` : '';
    body.innerHTML = schedule.length
      ? schedule.map((m, i) => `<tr><td>${esc(m.label)}</td><td class="num">${Math.round((m.pct||0)*1000)/10}%</td><td class="num">${fmtINR(d.milestoneAmounts[i])}</td></tr>`).join('')
      : `<tr><td colspan="3" class="empty-row">Pick a project and tower above to see its payment schedule.</td></tr>`;
  }
}
async function saveEditor() {
  readEditorForm();
  const b = EDIT_BUFFER;
  // a co-applicant block that was opened and never filled in is not a person
  b.coApplicants = coApplicantsOf(b).filter(ca =>
    COAPP_FIELDS.some(([k, , t]) => t === 'num' ? num(ca[k], 0) : String(ca[k] || '').trim()));
  b.coApplicant = b.coApplicants[0] ? (b.coApplicants[0].name || '') : '';
  b.coApplicantPan = b.coApplicants[0] ? (b.coApplicants[0].pan || '') : '';
  // the banner lives inside the Information pane, which is hidden while the timeline tab
  // is showing: complaining there is complaining to nobody
  if (RECORD_TAB !== 'info') showRecordTab('info');
  if (enforceRequired('customer', b, 'cust-editor')) return;
  const dup = STATE.customers.find(c => c.id !== b.id && String(c.name || '').trim().toLowerCase() === String(b.name || '').trim().toLowerCase());
  if (dup) { notify(`Another unit (${dup.flat || 'no flat no.'}) is already under this exact name. Names must be unique: collections and the payment timeline are matched to a customer by name, so two "${b.name}" rows would share one ledger. Add a distinguishing initial.`); return; }
  if (b.psNo) {
    b.psNo = String(b.psNo).trim().toUpperCase();
    const dupPs = STATE.customers.find(c => c.id !== b.id && (c.psNo || '').toUpperCase() === b.psNo);
    if (dupPs) { notify(`${b.psNo} is already assigned to ${dupPs.name}. Every client number must be unique.`); return; }
    if (!psIsValid(b.psNo) && !await askConfirm({ title: 'Unusual client number',
          body: `<b>${esc(b.psNo)}</b> is not in the ${cfg('psPrefix')} + ${cfg('psDigits')}-digit format.`,
          confirmLabel: 'Save it anyway' })) return;
  }
  const dupUnit = STATE.customers.find(c => c.id !== b.id && c.towerId === b.towerId && String(c.flat).trim().toLowerCase() === String(b.flat).trim().toLowerCase());
  if (dupUnit && !await askConfirm({ title: 'That flat is already taken',
        body: `Flat <b>${esc(b.flat)}</b> in this tower is already assigned to <b>${esc(dupUnit.name)}</b>.`,
        confirmLabel: 'Save it anyway' })) return;
  const prev = STATE.customers.find(c => c.id === b.id);
  // moving a unit to a different tower means a different milestone schedule -- the recorded
  // payments are keyed to the OLD tower's stages, so they cannot carry across.
  if (prev && prev.towerId && b.towerId && prev.towerId !== b.towerId) {
    const hist = STATE.milestonePaid[prev.name];
    const n = hist ? Object.keys(hist).length : 0;
    if (n && !await askConfirm({ title: 'Moving this unit to another tower',
          body: 'The unit switches to that tower\'s payment schedule.',
          note: `The <b>${n}</b> milestone payment${n>1?'s':''} recorded against the old schedule will be cleared. Collection entries are not affected.`,
          confirmLabel: 'Move it', danger: true })) return;
    if (n) delete STATE.milestonePaid[prev.name];
  }
  // what changed, worked out before the record is replaced
  const changed = diffCustomer(prev, b);
  // renaming a customer must carry their milestone history, collection rows and work notes
  if (prev && prev.name && prev.name !== b.name) {
    if (STATE.milestonePaid[prev.name]) { STATE.milestonePaid[b.name] = STATE.milestonePaid[prev.name]; delete STATE.milestonePaid[prev.name]; }
    STATE.collections.forEach(e => { if (e.customer === prev.name) e.customer = b.name; });
    if (STATE.workNotes && STATE.workNotes[prev.name]) {
      STATE.workNotes[b.name] = (STATE.workNotes[b.name] || []).concat(STATE.workNotes[prev.name]);
      delete STATE.workNotes[prev.name];
    }
  }
  const typed = (document.getElementById('f_workNote').value || '').trim();
  if (changed || typed) addWorkNote(b.name, typed && !changed ? 'note' : 'edit', typed, changed);
  document.getElementById('f_workNote').value = '';
  if (prev && !b._file) b._file = prev._file;
  const i = STATE.customers.findIndex(c => c.id === b.id);
  if (i >= 0) STATE.customers[i] = b; else STATE.customers.push(b);
  syncCustomerWings();
  closeEditor();
  refreshAll(); markDirty(b);
  if (b._file) saveScope({ file: b._file, quiet: true });
}
function addCustomer() { addCustomerFlow(); }
function cancelEditor() {
  if (EDIT_BUFFER && !EDIT_BUFFER.name) STATE.customers = STATE.customers.filter(x => x.id !== EDIT_BUFFER.id);
  closeEditor();
  renderCustomerList();
}

/* ================= Collections ================= */
// how many days the bank actually took: demand raised -> money received
function bankLagOf(e) {
  if (!e || e.source !== 'Bank' || !e.requestedDate || !e.date) return null;
  const d = daysBetween(new Date(e.requestedDate), new Date(e.date));
  return (d == null || d < 0 || d > 400) ? null : d;
}
function fillCustomerSelect(selectId) {
  const sel = document.getElementById(selectId);
  const cur = sel.value;
  const list = visibleCustomers();
  sel.innerHTML = list.map(c => {
    const l = towerOf(c);
    return `<option value="${esc(c.name)}">${esc(c.name)}: ${esc(l.tower ? l.tower.name : c.wing)}-${esc(c.flat)}</option>`;
  }).join('');
  if (cur && list.some(c => c.name === cur)) sel.value = cur;
  return list;
}
function collectionSortValue(e, key) {
  const c = STATE.customers.find(x => x.name === e.customer);
  const l = c ? towerOf(c) : { project: null, tower: null };
  switch (key) {
    case 'date':     return e.date instanceof Date ? e.date : new Date(e.date);
    case 'project':  return l.project ? l.project.name : '';
    case 'tower':    return l.tower ? l.tower.name : (e.wing || '');
    case 'customer': return e.customer || '';
    case 'flat':     return e.flat || '';
    case 'source':   return e.source === 'Bank' ? 'Bank disbursement' : 'Own funds';
    case 'lag':      { const g = bankLagOf(e); return g == null ? -1 : g; }
    case 'cost':     return e.flatCost || 0;
    case 'gst':      return e.gst || 0;
    case 'total':    return (e.flatCost || 0) + (e.gst || 0);
    case 'remark':   return e.remark || '';
    default:         return '';
  }
}
/* The Collections tab records money the same way the receipt modal does, so it offers
   the same list of open demands rather than making somebody remember which stage it was. */
function fillCollectionTargets() {
  const sel = document.getElementById('coll_against');
  const hint = document.getElementById('coll_against_hint');
  if (!sel) return null;
  const name = document.getElementById('coll_customer').value;
  const c = STATE.customers.find(x => x.name === name);
  if (!c) { sel.innerHTML = '<option value=""></option>'; renderDemandPicker([]); if (hint) hint.textContent = ''; return null; }
  const targets = receiptTargets(c);
  const demands = targets.filter(t => t.kind === 'demand');
  const extras = targets.filter(t => t.kind !== 'demand');
  const opt = t => `<option value="${esc(t.id)}">${esc(receiptOptionText(t))}</option>`;
  const keep = sel.value;
  sel.innerHTML =
    (demands.length
      ? `<optgroup label="Pending demands on this payment schedule">${demands.map(opt).join('')}</optgroup>`
      : `<optgroup label="Payment schedule"><option value="__other__">Every demand on this schedule is settled</option></optgroup>`)
    + (extras.length ? `<optgroup label="Outside the payment schedule">${extras.map(opt).join('')}</optgroup>` : '');
  if (targets.some(t => t.id === keep)) sel.value = keep;
  renderDemandPicker(targets);
  prefillCollectionAmount(targets);
  if (hint) hint.textContent = demands.length
    ? 'Picking a demand updates the payment schedule too, exactly as the action queue does.'
    : 'Nothing is open on this schedule, so this will be logged without touching it.';
  return targets;
}

/* ---- the compact demand picker ----
   A hidden native select stays the single source of truth so every existing reader of
   `#coll_against` keeps working; this only changes what a person sees and clicks. */
function cbxShortLabel(t) {
  if (!t) return '—';
  const bits = [t.label];
  if (t.amount) bits.push(fmtINR(Math.round(t.amount)));
  return bits.join('  ·  ');
}
function cbxOptionHTML(t, selected) {
  const late = t.daysToDue != null && t.daysToDue < 0 ? Math.abs(t.daysToDue) : 0;
  return `<button type="button" class="cbx-opt" role="option" data-id="${esc(t.id)}"
    aria-selected="${selected ? 'true' : 'false'}">${esc(t.label)}` +
    (t.amount ? ` <span class="amt">· ${fmtINR(Math.round(t.amount))} outstanding</span>` : '') +
    (t.due ? ` <span class="amt">· due ${fmtDate(t.due)}</span>` : '') +
    (late ? ` <span class="late">· ${late}d late</span>` : '') + `</button>`;
}
function renderDemandPicker(targets) {
  const panel = document.getElementById('coll_against_panel');
  const lab = document.getElementById('coll_against_lab');
  const sel = document.getElementById('coll_against');
  if (!panel || !sel) return;
  const list = targets || [];
  const demands = list.filter(t => t.kind === 'demand');
  const extras = list.filter(t => t.kind !== 'demand');
  const cur = sel.value;
  panel.innerHTML =
    (demands.length
      ? `<div class="cbx-grp">Pending demands on this payment schedule</div>${demands.map(t => cbxOptionHTML(t, t.id === cur)).join('')}`
      : `<div class="cbx-grp">Every demand on this schedule is settled</div>`)
    + (extras.length ? `<div class="cbx-grp">Outside the payment schedule</div>${extras.map(t => cbxOptionHTML(t, t.id === cur)).join('')}` : '');
  const picked = list.find(t => t.id === cur);
  lab.textContent = cbxShortLabel(picked);
  lab.title = picked ? cbxShortLabel(picked) : '';
  panel.querySelectorAll('.cbx-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      sel.value = btn.dataset.id;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      closeDemandPicker();
      renderDemandPicker(list);
    });
  });
}
function openDemandPicker() {
  const box = document.getElementById('coll_against_cbx');
  const btn = document.getElementById('coll_against_btn');
  const panel = document.getElementById('coll_against_panel');
  if (!box) return;
  box.classList.add('open');
  btn.setAttribute('aria-expanded', 'true');
  // open upwards when there is more room above, so the list is never cut off
  panel.classList.remove('up');
  const r = btn.getBoundingClientRect();
  if (window.innerHeight - r.bottom < 260 && r.top > window.innerHeight - r.bottom) panel.classList.add('up');
  const active = panel.querySelector('.cbx-opt[aria-selected="true"]') || panel.querySelector('.cbx-opt');
  if (active) { active.classList.add('active'); active.scrollIntoView({ block: 'nearest' }); }
}
function closeDemandPicker() {
  const box = document.getElementById('coll_against_cbx');
  if (!box) return;
  box.classList.remove('open');
  document.getElementById('coll_against_btn').setAttribute('aria-expanded', 'false');
  box.querySelectorAll('.cbx-opt.active').forEach(e => e.classList.remove('active'));
}
function demandPickerKeys(e) {
  const box = document.getElementById('coll_against_cbx');
  if (!box) return;
  const open = box.classList.contains('open');
  if (!open) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); openDemandPicker(); }
    return;
  }
  const opts = [...box.querySelectorAll('.cbx-opt')];
  const i = opts.findIndex(o => o.classList.contains('active'));
  if (e.key === 'Escape') { e.preventDefault(); closeDemandPicker(); document.getElementById('coll_against_btn').focus(); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = Math.max(0, Math.min(opts.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    opts.forEach(o => o.classList.remove('active'));
    if (opts[n]) { opts[n].classList.add('active'); opts[n].scrollIntoView({ block: 'nearest' }); }
  } else if (e.key === 'Enter') { e.preventDefault(); if (opts[i]) opts[i].click(); }
}

/* What the selected demand is asking for, so the ordinary case is one click. Only ever
   fills a blank box: a figure somebody has typed is never overwritten. */
function prefillCollectionAmount(targets) {
  const sel = document.getElementById('coll_against');
  const t = (targets || []).find(x => x.id === (sel && sel.value));
  const fc = document.getElementById('coll_flatcost'), g = document.getElementById('coll_gst');
  if (!t || !fc || !g) return;
  if (!fc.value) fc.value = t.amount ? Math.round(t.amount) : '';
  if (!g.value) g.value = t.gst ? Math.round(t.gst) : '';
}

function renderCollections() {
  const list = fillCustomerSelect('coll_customer');
  fillCollectionTargets();
  const names = new Set(list.map(c => c.name));
  const inScope = STATE.collections.filter(e => names.has(e.customer));
  const q = FILT.coll.trim().toLowerCase();
  const rows = sortRows(inScope.filter(e => {
    if (!q) return true;
    const c = STATE.customers.find(x => x.name === e.customer);
    const l = c ? towerOf(c) : { project: null, tower: null };
    return [e.customer, e.flat, e.remark, l.project && l.project.name, l.tower && l.tower.name]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
  }), SORT.coll, collectionSortValue);
  paintSortHeaders('#coll-thead', SORT.coll);
  const tb = document.getElementById('coll-body');
  const shownColl = pageSlice('collections', rows);
  renderPager('coll-pager', 'collections', rows.length, renderCollections);
  tb.innerHTML = shownColl.map(e => {
    const c = STATE.customers.find(x => x.name === e.customer);
    const l = c ? towerOf(c) : { project: null, tower: null };
    return `<tr>
      <td>${fmtDate(e.date)}</td>
      <td>${l.project ? esc(l.project.name) : ''}</td>
      <td>${l.tower ? esc(l.tower.name) : esc(e.wing)}</td>
      <td>${esc(e.customer)}</td>
      <td>${esc(e.flat)}</td>
      <td>${e.source === 'Bank' ? '<span class="pill bank">Bank</span>'
            : e.source === 'Own' ? '<span class="pill own">Own</span>'
            : '<span class="muted">–</span>'}</td>
      <td class="num">${(() => { const g = bankLagOf(e); return g == null ? '<span class="muted">–</span>' : g + 'd'; })()}</td>
      <td class="num">${fmtINR(e.flatCost)}</td>
      <td class="num">${fmtINR(e.gst)}</td>
      <td class="num">${fmtINR((e.flatCost||0)+(e.gst||0))}</td>
      <td>${esc(e.remark)}</td>
      <td><button class="btn-tiny danger del-coll" data-id="${e.id}">Remove</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="12" class="empty-row">${inScope.length
      ? 'No entries match the search: clear it to see all ' + inScope.length + '.'
      : 'No collection entries for the current selection.'}</td></tr>`;
  tb.querySelectorAll('.del-coll').forEach(b => b.addEventListener('click', () => {
    const gone = STATE.collections.find(x => x.id === b.dataset.id);
    STATE.collections = STATE.collections.filter(x => x.id !== b.dataset.id);
    refreshAll(); markDirty(gone);
  }));
  const f = rows.reduce((a, e) => a + (e.flatCost||0), 0), g = rows.reduce((a, e) => a + (e.gst||0), 0);
  document.getElementById('coll-total').textContent = `${fmtINR(f+g)}  (${fmtINR(f)} + ${fmtINR(g)} GST)`;
  document.getElementById('coll-shown').textContent =
    (rows.length === inScope.length) ? `${inScope.length} entr${inScope.length === 1 ? 'y' : 'ies'}`
                                     : `showing ${rows.length} of ${inScope.length}`;
  document.getElementById('coll-ctx-note').textContent = ctxLabel();
}
function addCollectionEntry() {
  const name = document.getElementById('coll_customer').value;
  const c = STATE.customers.find(x => x.name === name);
  if (!c) {
    notify(STATE.customers.length
      ? 'No units in the current view. Widen the builder partner / project selection above, or pick the unit from the list.'
      : 'Add a unit first, then its receipts can be recorded here.');
    return;
  }
  const date = document.getElementById('coll_date').value;
  const flatCost = parseFloat(document.getElementById('coll_flatcost').value) || 0;
  const gst = parseFloat(document.getElementById('coll_gst').value) || 0;
  const remark = document.getElementById('coll_remark').value;
  const source = document.getElementById('coll_source').value;
  const requested = parseDateInput(document.getElementById('coll_requested').value);
  if (!date || (flatCost === 0 && gst === 0)) { notify('Enter a date and at least one amount.'); return; }
  if (source === 'Bank' && requested && parseDateInput(date) < requested) {
    notify('The money cannot arrive before the demand was raised with the bank: check the two dates.'); return;
  }
  const l = towerOf(c);
  // which demand is this money against?
  const againstId = (document.getElementById('coll_against') || {}).value || '';
  const target = receiptTargets(c).find(t => t.id === againstId) || null;
  const isDemand = !!(target && target.kind === 'demand' && target.row);
  const entry = { id: uid('r'), date: parseDateInput(date), customer: c.name,
    wing: l.tower ? l.tower.name : c.wing, flat: c.flat, flatCost, gst,
    remark: remark || (target ? target.label : ''),
    source, requestedDate: source === 'Bank' ? requested : null, _file: c._file };
  STATE.collections.push(entry);

  let before = null;
  if (isDemand && flatCost > 0) {
    if (!STATE.milestonePaid[c.name]) STATE.milestonePaid[c.name] = {};
    before = STATE.milestonePaid[c.name][target.id] ? { ...STATE.milestonePaid[c.name][target.id] } : null;
    const newAmt = (before ? (before.amount || 0) : 0) + flatCost;
    STATE.milestonePaid[c.name][target.id] = { amount: newAmt, date,
      reason: newAmt < target.row.amount - 1 ? (before && before.reason) || '' : '' };
  }
  if (target && target.kind === 'charges') c.stampDutyReceived = (c.stampDutyReceived || 0) + flatCost;
  COLLECT_UNDO.push({ what: `${fmtINR(flatCost)} from ${c.name}${target ? ' against ' + target.label : ''}`,
                      entryId: entry.id, customer: c.name, customerId: c.id,
                      msId: isDemand ? target.id : null, before,
                      stampAdded: target && target.kind === 'charges' ? flatCost : 0 });
  ['coll_flatcost','coll_gst','coll_remark','coll_requested'].forEach(i => document.getElementById(i).value = '');
  refreshAll(); markDirty();
}

/* ================= Payment Timeline ================= */
/* The timeline is now a tab of the open record, so its subject is whichever customer is
   open. It is only drawn when that tab is showing; nothing else on screen depends on it. */
function renderMilestones() {
  const body = document.getElementById('ms-body');
  if (!body) return;
  const sel = document.getElementById('ms_customer');
  const open = CURRENT_CUSTOMER_ID ? STATE.customers.find(x => x.id === CURRENT_CUSTOMER_ID) : null;
  const name = open ? open.name : (sel ? sel.value : '');
  if (sel) sel.value = name || '';
  if (!name) {
    body.innerHTML = `<tr><td colspan="6" class="empty-row">Open a customer to see their payment timeline.</td></tr>`;
    document.getElementById('ms-where').textContent = '';
    document.getElementById('ms-rating').innerHTML = '';
    const pg = document.getElementById('ms-pager'); if (pg) pg.innerHTML = '';
    return;
  }
  const c = STATE.customers.find(x => x.name === name);
  if (!c) { body.innerHTML = `<tr><td colspan="6" class="empty-row">That unit is no longer in view.</td></tr>`; return; }
  const l = towerOf(c);
  const schedule = l.tower ? l.tower.schedule : [];
  document.getElementById('ms-where').textContent =
    l.project ? `${l.project.name}${l.tower ? ' · Tower ' + l.tower.name : ''} · Flat ${c.flat}` : '';
  if (!schedule.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty-row">This unit's tower has no payment schedule yet: set one up under Settings &rarr; Projects &amp; towers.</td></tr>`;
    document.getElementById('ms-rating').innerHTML = '';
    return;
  }
  const paid = STATE.milestonePaid[name] || {};
  const today = new Date();
  const d = deriveCustomer(toCalcCustomer(c), sumRecoveryFor(name), schedule);
  const cum = scheduleCumPct(schedule);
  let shown = 0, total = 0;
  const msRows = schedule.map((m, i) => {
    const due = stageDueDate(m, c.bookingDate, c.possessionDate, cum[i]);
    const src = dueDateSource(m);
    const amountDue = d.milestoneAmounts[i];
    const p = paid[m.id] || null;
    const payment = p ? { amount: p.amount, date: parseDateInput(p.date) } : null;
    const status = milestoneStatus(due, payment, amountDue, today);
    const delay = milestoneDelay(due, payment);
    const cls = status === 'Paid' ? (delay == null ? 'unk' : delay <= cfg('greenDays') ? 'ok' : delay <= cfg('yellowDays') ? 'warn' : 'crit')
              : status === 'Partially Paid' ? 'partial'
              : status === 'Due, pending' ? 'crit' : 'unk';
    total++;
    const F = FILT.ms;
    if (F !== 'all') {
      if (F === 'overdue' && status !== 'Due, pending') return '';
      if (F === 'partial' && status !== 'Partially Paid') return '';
      if (F === 'paid'    && status !== 'Paid') return '';
      if (F === 'future'  && status !== 'Not Yet Due') return '';
      if (F === 'open'    && (status === 'Paid')) return '';
    }
    shown++;
    return `<tr class="${status === 'Due, pending' ? 'row-overdue' : ''}">
      <td>${esc(m.label)} <span class="muted">(${Math.round((m.pct||0)*1000)/10}%)</span></td>
      <td class="num">${fmtINR(amountDue)}</td>
      <td>${due ? `${fmtDate(due)}<div class="sub-line">${
              src === 'completed' ? '<b class="ok-txt">stage completed</b>'
            : src === 'planned' ? 'planned for the tower'
            : 'estimated'}</div>` : '<span class="muted">no date: set a stage date or booking/possession</span>'}</td>
      <td><span class="pill ${cls}">${status}</span>${delay != null ? ` <span class="muted">(${delay>=0?'+':''}${delay}d)</span>` : ''}</td>
      <td>${p ? `${fmtINR(p.amount)} on ${fmtDate(parseDateInput(p.date))}${p.reason ? `<div class="reason-txt">“${esc(p.reason)}”</div>` : ''}` : '<span class="muted">not recorded</span>'}</td>
      <td class="nowrap">
        <button class="btn-tiny ms-rec" data-id="${m.id}" data-amt="${amountDue}">${p ? 'Edit' : 'Record'}</button>
        ${p ? `<button class="btn-tiny danger ms-clr" data-id="${m.id}">Clear</button>` : ''}
      </td>
    </tr>`;
  }).filter(Boolean);
  const msPage = pageSlice('timeline', msRows);
  renderPager('ms-pager', 'timeline', msRows.length, renderMilestones);
  body.innerHTML = msPage.join('') || `<tr><td colspan="6" class="empty-row">No milestones match this filter.</td></tr>`;
  document.getElementById('ms-shown').textContent =
    (shown === total) ? `${total} milestone${total === 1 ? '' : 's'}` : `showing ${shown} of ${total}`;
  body.querySelectorAll('.ms-rec').forEach(b => b.addEventListener('click', () =>
    openPaymentDialog(name, b.dataset.id, parseFloat(b.dataset.amt))));
  body.querySelectorAll('.ms-clr').forEach(b => b.addEventListener('click', () => {
    delete STATE.milestonePaid[name][b.dataset.id];
    refreshAll(); markDirty(c);
  }));

  const r = ratingFor(name), pc = partialCountFor(name);
  document.getElementById('ms-rating').innerHTML =
    (r.rating === 'unknown'
      ? `<span class="pill unk">Not enough history</span>`
      : `<span class="pill ${ {green:'ok',yellow:'warn',red:'crit'}[r.rating] }">${r.rating}</span> <span class="muted">avg delay ${r.avgDelay>=0?'+':''}${Math.round(r.avgDelay)}d</span>`)
    + (pc ? ` <span class="pill ${isWatched(pc)?'watch':'unk'}">${pc} partial payment${pc>1?'s':''}${isWatched(pc)?'. Watch':''}</span>` : '');
}

function openPaymentDialog(customer, milestoneId, fullAmount) {
  const existing = (STATE.milestonePaid[customer] || {})[milestoneId];
  const dlg = document.getElementById('pay-dialog');
  dlg.classList.add('show');
  dlg.dataset.customer = customer;
  dlg.dataset.milestone = milestoneId;
  dlg.dataset.full = fullAmount;
  document.getElementById('pd_full').textContent = fmtINR(fullAmount);
  document.getElementById('pd_amount').value = existing ? existing.amount : fullAmount;
  document.getElementById('pd_date').value = existing ? existing.date : toISODate(new Date());
  document.getElementById('pd_reason').value = existing ? (existing.reason || '') : '';
  updatePayDialog();
  document.getElementById('pd_amount').focus();
}
function closePaymentDialog() { document.getElementById('pay-dialog').classList.remove('show'); }
function updatePayDialog() {
  const dlg = document.getElementById('pay-dialog');
  const full = parseFloat(dlg.dataset.full) || 0;
  const amt = parseFloat(document.getElementById('pd_amount').value) || 0;
  const partial = amt > 0 && amt < full - 1;
  document.getElementById('pd_reason_wrap').style.display = partial ? 'block' : 'none';
  document.getElementById('pd_note').style.display = partial ? 'block' : 'none';
  document.getElementById('pd_shortfall').textContent = partial ? fmtINR(full - amt) : '';
}
async function savePaymentDialog() {
  const dlg = document.getElementById('pay-dialog');
  const customer = dlg.dataset.customer, mid = dlg.dataset.milestone;
  const full = parseFloat(dlg.dataset.full) || 0;
  const amount = parseFloat(document.getElementById('pd_amount').value) || 0;
  const date = document.getElementById('pd_date').value;
  const reason = document.getElementById('pd_reason').value.trim();
  if (!date || amount <= 0) { notify('Enter a valid amount and a payment date.'); return; }
  if (amount > full + 1 && !await askConfirm({ title: 'More than the demand',
        body: `This is more than the <b>${fmtINR(full)}</b> due for this milestone.`,
        confirmLabel: 'Record it anyway' })) return;
  if (amount < full - 1 && !reason) { notify('This is less than the full amount due: please note why. The reason is kept with the record and counts toward this customer’s Watch flag.'); return; }
  if (!STATE.milestonePaid[customer]) STATE.milestonePaid[customer] = {};
  STATE.milestonePaid[customer][mid] = { amount, date, reason: amount < full - 1 ? reason : '' };
  closePaymentDialog();
  refreshAll(); markDirty(STATE.customers.find(x => x.name === customer));
}

/* ================= load notice ================= */
function showLoadNotice(msgs) {
  const el = document.getElementById('load-notice');
  if (!msgs.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.innerHTML = '<b>Heads up after loading:</b><ul>' +
    msgs.map(m => `<li>${m}</li>`).join('') + '</ul>' +
    '<button class="btn-tiny" id="dismiss-notice" type="button">Dismiss</button>';
  el.style.display = 'block';
  document.getElementById('dismiss-notice').addEventListener('click', () => { el.style.display = 'none'; });
}
function loadWarnings(fileName) {
  const w = [];
  const orphan = STATE.customers.filter(c => !c.projectId || !c.towerId).length;
  if (orphan) w.push(`<b>${orphan} unit${orphan>1?'s':''}</b> in this project are not linked to a tower yet (older records did not track towers). Create the project and tower on the <b>Projects &amp; Towers</b> tab, then open each customer and set them: their milestone schedule appears once they are linked.`);
  if (STATE.customers.length && !STATE.collections.length) w.push(`No collection history was imported. If these records used the older day-column layout, that format cannot be read back: re-enter payments on the <b>Collections</b> tab and they will be written in the new layout from now on.`);
  const badTowers = [];
  STATE.projects.forEach(p => p.towers.forEach(t => {
    if (t.schedule.length && Math.abs(scheduleTotalPct(t.schedule) - 100) > 0.05)
      badTowers.push(`${p.name} / Tower ${t.name} (${scheduleTotalPct(t.schedule)}%)`);
  }));
  if (badTowers.length) w.push(`Payment schedule does not add up to 100% for: ${badTowers.join(', ')}.`);
  return w;
}

/* ================= refresh / status ================= */
function refreshAll() {
  try { renderActions(); } catch (err) { console.error('action items render failed', err); }
  try { renderBuilderList(); } catch (err) { console.error('builder list render failed', err); }
  renderCustomerList();
  renderCollections();
  renderMilestones();
  if (CURRENT_CUSTOMER_ID) recomputeEditorPreview();
  // the documents tab keeps whatever has been typed over: only its lists follow the change
  const dp = document.getElementById('mtab-docs');
  if (dp && dp.classList.contains('active')) {
    try { fillDocCustomers(); fillDocDemands(); renderDocPaper(); }
    catch (err) { console.error('documents render failed', err); }
  }
  try { renderAll(); } catch (err) { console.error('dashboard render failed', err); }
}
function statusText() {
  if (!FILES.length) return SOURCE_LABEL;
  const towers = allTowers(true).length;
  const parts = [...new Set(FILES.map(f => f.partner))].length;
  return `${parts} builder partner${parts===1?'':'s'}`
       + ` · ${STATE.projects.length} project${STATE.projects.length===1?'':'s'} · ${towers} tower${towers===1?'':'s'}`
       + ` · ${STATE.customers.length} unit${STATE.customers.length===1?'':'s'}`;
}

/* ================= Funding preview & own-contribution plan =================
   The bank funds a share of the AGREEMENT VALUE only. Stamp duty, registration and GST
   are always the customer's own money, which is why the own contribution is so much
   bigger than "100% minus the loan percentage" makes it look.
*/
function renderFundingPreview(c) {
  if (!c) return;
  const prog = fundingProgress(toCalcCustomer(c), STATE.collections);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.innerHTML = v; };
  set('calc_costAV', fmtINR(prog.AV));
  set('calc_costSD', fmtINR(prog.stampDuty) + (prog.stampDutyOverridden
        ? ' <span class="pill warn">overridden</span>'
        : ` <span class="muted">(${prog.sdPct}%)</span>`));
  set('calc_costGST', fmtINR(prog.gst) + ` <span class="muted">(${prog.gstPct}%)</span>`);
  set('calc_costTotal', fmtINR(prog.totalCost));

  const stateTag =
    prog.status === 'sanctioned' ? '<span class="pill ok">Loan sanctioned</span>'
    : prog.provisional ? '<span class="pill warn">Provisional: sanction awaited</span>'
    : '<span class="pill crit">No loan figure yet</span>';
  const shortfallRow = prog.shortfall > 0
    ? `<div class="fs-row crit"><span>Sanctioned below expectation: customer must fund</span><b>${fmtINR(prog.shortfall)} extra</b></div>` : '';
  const unclassRow = prog.unclassified > 0
    ? `<div class="fs-row warn"><span>Receipts with no source marked</span><b>${fmtINR(prog.unclassified)}</b></div>` : '';
  set('fund-summary', `
    <div class="fs-head">${stateTag}
      <span class="muted">Loan is ${prog.loanPctOfAV}% of agreement value · own contribution is ${prog.ownPctOfCost}% of total cost</span></div>
    <div class="fs-grid">
      <div class="fs-col">
        <div class="fs-title">Own contribution (OCR)</div>
        <div class="fs-row"><span>Required</span><b>${fmtINR(prog.ownRequired)}</b></div>
        <div class="fs-row"><span>Received</span><b>${fmtINR(prog.ownPaid)}</b></div>
        <div class="fs-row ${prog.ownPending > 0 ? 'crit' : 'ok'}"><span>Still to arrange</span><b>${fmtINR(prog.ownPending)}</b></div>
        <div class="fs-note">Never loanable: stamp duty + registration + other = <b>${fmtINR(prog.nonLoanable)}</b></div>
      </div>
      <div class="fs-col">
        <div class="fs-title">Bank</div>
        <div class="fs-row"><span>${prog.status === 'sanctioned' ? 'Sanctioned' : 'Expected'}</span><b>${fmtINR(prog.loan)}</b></div>
        <div class="fs-row"><span>Disbursed</span><b>${fmtINR(prog.bankDisbursed)}</b></div>
        <div class="fs-row"><span>Left to disburse</span><b>${fmtINR(prog.bankPending)}</b></div>
      </div>
      <div class="fs-col">
        <div class="fs-title">Every rupee</div>
        <div class="fs-row"><span>Total cost of flat</span><b>${fmtINR(prog.totalCost)}</b></div>
        <div class="fs-row"><span>Received so far</span><b>${fmtINR(prog.totalIn)}</b></div>
        <div class="fs-row"><span>Still to come</span><b>${fmtINR(prog.totalPending)}</b></div>
      </div>
    </div>${shortfallRow}${unclassRow}`);

  renderOcrPlan(c, prog);
}

/* ---- interest on a late demand ----
   Nearly every agreement charges interest on a delayed instalment, and that is precisely
   why a real builder's book does not carry demands a year overdue: the meter running is
   what makes people pay. Showing the figure beside the demand is the pressure, whether
   or not the builder ever collects it. */
function delayInterest(outstanding, daysLate, c) {
  if (!cfg('interestOn')) return 0;
  const grace = cfg('delayGraceDays');
  const chargeable = (daysLate || 0) - grace;
  if (chargeable <= 0 || !(outstanding > 0)) return 0;
  const rate = (c && c.delayInterestPct != null ? c.delayInterestPct : cfg('delayInterestPct')) / 100;
  return round0(outstanding * rate * chargeable / 365);
}

/* ================= COLLECTION FORECAST =================
   A builder does not want a total outstanding figure; they want to know what will
   actually arrive, and how sure they can be. Three signals decide that, and the order
   matters because each one can only make a band worse, never better:

     1. how this customer has paid before, weighted so the last three milestones count
        for most -- somebody who was reliable two years ago and has missed the last
        three is not a reliable payer any more;
     2. how long the demand has already been outstanding;
     3. where the money is coming from -- a sanctioned bank disbursement behaves quite
        differently from one where the file has not even been submitted.

   Every threshold is a Settings value, so a builder who knows their buyers can tune it.
*/
const FORECAST_DEFAULTS = {
  recentWeight: 3,        // how heavily the most recent milestone counts
  recentWindow: 3,        // how many recent milestones get the heavy weighting
  ageAmberDays: 30,       // outstanding longer than this: one band worse
  ageRedDays: 60,         // outstanding longer than this: red, whoever the customer is
};
const BAND_ORDER = ['green', 'amber', 'red'];
const worsen = (band, steps) => BAND_ORDER[Math.min(BAND_ORDER.length - 1, BAND_ORDER.indexOf(band) + Math.max(0, steps | 0))];

/* Recency-weighted payment history. The most recent `recentWindow` milestones carry
   `recentWeight`, sliding down to 1; everything older counts half. */
function paymentHabit(c) {
  const sched = scheduleForCustomer(c);
  const paid = STATE.milestonePaid[c.name] || {};
  const cum = scheduleCumPct(sched);
  const seq = [];
  sched.forEach((m, i) => {
    const p = paid[m.id];
    if (!p || !p.date) return;
    const due = stageDueDate(m, c.bookingDate, c.possessionDate, cum[i]);
    const delay = milestoneDelay(due, { date: parseDateInput(p.date) });
    if (delay != null) seq.push({ delay, when: parseDateInput(p.date) });
  });
  if (seq.length < 2) return { band: 'unknown', delay: null, n: seq.length, recent: [] };
  seq.sort((a, b) => a.when - b.when);
  const W = cfg('recentWindow'), RW = cfg('recentWeight');
  let num = 0, den = 0;
  seq.forEach((x, i) => {
    const fromEnd = seq.length - 1 - i;                  // 0 = most recent
    const w = fromEnd < W ? Math.max(1, RW - fromEnd) : 0.5;
    num += x.delay * w; den += w;
  });
  const avg = den ? num / den : 0;
  const band = avg <= cfg('greenDays') ? 'green' : avg <= cfg('yellowDays') ? 'amber' : 'red';
  return { band, delay: Math.round(avg * 10) / 10, n: seq.length,
           recent: seq.slice(-W).map(x => x.delay) };
}

/* Whether the bank leg can be counted on. A sanction is a commitment; an application
   is a hope; a rejection is a hole in the funding plan. */
function bankConfidence(c) {
  const st = String(c.dlStatus || '').toUpperCase();
  if (st === 'FULLY DISBURSED' || st === 'PARTLY DISBURSED' || st === 'SANCTIONED') return { steps: 0, why: 'sanctioned' };
  if (st === 'REJECTED') return { steps: 2, why: 'loan rejected' };
  if (st === 'APPLIED') return { steps: 1, why: 'applied, not sanctioned' };
  if (st === 'NOT REQUIRED') return { steps: 0, why: 'self funded' };
  return { steps: 1, why: 'no loan started' };
}

/* One row per open demand per funding source. Own money and bank money are forecast
   separately because they arrive for different reasons and fail for different ones. */
function forecastRows() {
  const today = startOfDay(new Date());
  const out = [];
  visibleCustomers().forEach(c => {
    if (!isLiveBooking(c)) return;                       // on hold or cancelled: not a receivable
    const prog = fundingProgress(toCalcCustomer(c), STATE.collections);
    const habit = paymentHabit(c);
    const bank = bankConfidence(c);
    ownContributionPlan(c, prog).forEach(r => {
      if (r.settled) return;
      const daysOut = r.due ? Math.round((today - startOfDay(r.due)) / 86400000) : 0;
      let ageSteps = 0, ageWhy = '';
      if (daysOut > cfg('ageRedDays')) { ageSteps = 2; ageWhy = `${daysOut} days overdue`; }
      else if (daysOut > cfg('ageAmberDays')) { ageSteps = 1; ageWhy = `${daysOut} days overdue`; }
      const base = habit.band === 'unknown' ? 'amber' : habit.band;
      const habitWhy = habit.band === 'unknown'
        ? 'no payment history yet'
        : `pays ${habit.delay > 0 ? habit.delay + ' days late' : 'on time'} lately`;
      const push = (amount, share, extraSteps, extraWhy) => {
        if (amount < 1) return;
        const why = [habitWhy]; if (ageWhy) why.push(ageWhy); if (extraWhy) why.push(extraWhy);
        out.push({ customer: c.name, customerId: c.id, flat: c.flat,
                   project: (towerOf(c).project || {}).name || '', label: r.label,
                   due: r.due, amount: round0(amount), share,
                   band: worsen(base, ageSteps + (extraSteps || 0)),
                   daysOut, interest: delayInterest(amount, daysOut, c), why });
      };
      push(r.ownShare, 'own', 0, '');
      push(r.bankShare, 'bank', bank.steps, bank.steps ? bank.why : '');
    });
  });
  return out.sort((a, b) => (a.due || 0) - (b.due || 0));
}

const FORECAST_HORIZONS = [
  { key: 'overdue', label: 'Already overdue', days: 0,   arrears: true },
  { key: 'week',    label: 'Falls due this week',  days: 7 },
  { key: 'month',   label: 'By end of the month',  days: 30 },
  { key: 'm2',      label: 'Within 2 months',      days: 60 },
  { key: 'm3',      label: 'Within 3 months',      days: 90 },
  { key: 'm6',      label: 'Within 6 months',      days: 182 },
];

/* Arrears are kept out of the forward windows and given a card of their own. A builder
   reading "this week" means money that becomes due this week; folding two years of
   overdue demands into it makes the number large and useless. The forward windows are
   cumulative, because the real question is "how much by the end of March". */
function forecastBuckets(rows) {
  const today = startOfDay(new Date());
  const src = rows || forecastRows();
  return FORECAST_HORIZONS.map(h => {
    const inWindow = h.arrears
      ? src.filter(r => r.due && r.daysOut > 0)
      : (() => { const cutoff = new Date(today.getTime() + h.days * 86400000);
                 return src.filter(r => (!r.due || r.due <= cutoff) && !(r.due && r.daysOut > 0)); })();
    const by = { green: 0, amber: 0, red: 0 };
    inWindow.forEach(r => { by[r.band] += r.amount; });
    return { ...h, ...by, total: by.green + by.amber + by.red, count: inWindow.length, rows: inWindow };
  });
}

// Milestone-by-milestone: what the customer personally has to put up, and by when.
function ownContributionPlan(c, prog) {
  const l = towerOf(c);
  const sched = l.tower ? l.tower.schedule : [];
  if (!sched.length) return [];
  const cum = scheduleCumPct(sched);
  const cc = toCalcCustomer(c);
  const d = deriveCustomer(cc, sumRecoveryFor(c.name), sched);
  const paid = STATE.milestonePaid[c.name] || {};
  const today = new Date();
  const gstRate = prog.gstPct / 100;

  // ---- pass 1: what agreement value is still open across the whole schedule ----
  // The bank's share of any one demand is its share of THIS total, not of a pool that
  // also contains stamp duty, registration and GST. Getting that denominator wrong made
  // the split drift stage by stage, over-charging the customer on the early demands.
  const stages = sched.map((m, i) => {
    const amount = d.milestoneAmounts[i];
    const p = paid[m.id] || null;
    const settled = !!(p && p.amount >= amount - 1);
    return { m, i, amount, p, settled,
             outstanding: Math.max(0, amount - (p ? p.amount : 0)) };
  });
  const avRemaining = stages.reduce((a, x) => a + (x.settled ? 0 : x.outstanding), 0);
  const ratio = bankShareRatio(prog, avRemaining);

  let bankLeft = prog.bankPending, running = 0;
  const rows = [];
  stages.forEach(({ m, i, amount, p, settled, outstanding }) => {
    const due = stageDueDate(m, cc.bookingDate, cc.possessionDate, cum[i]);
    const bankShare = settled ? 0 : Math.min(round0(outstanding * ratio), bankLeft);
    const gst = settled ? 0 : round0(outstanding * gstRate);
    const ownShare = settled ? 0 : (outstanding - bankShare) + gst;
    bankLeft = Math.max(0, bankLeft - bankShare);
    if (!settled) running += ownShare;
    rows.push({ label: m.label, due, amount, outstanding, alreadyPaid: p ? p.amount : 0,
                gst, bankShare, ownShare, running, settled, kind: 'stage',
                overdue: !settled && due && due <= today });
  });

  // ---- the charges no bank ever funds, which the plan used to omit completely ----
  const nonLoanablePending = Math.max(0, prog.nonLoanable - prog.stampPaid);
  if (nonLoanablePending > 0) {
    running += nonLoanablePending;
    rows.push({ label: 'Stamp duty, registration & other charges',
                // payable at registration; before that the agreement date is the marker
                due: cc.registrationDate || cc.agreementDate || null, amount: prog.nonLoanable,
                outstanding: nonLoanablePending, alreadyPaid: prog.stampPaid,
                gst: 0, bankShare: 0, ownShare: nonLoanablePending, running,
                settled: false, kind: 'charges', overdue: false });
  }
  // ---- reconcile to the figure the funding summary shows ----
  // The stages are one ledger (milestone ticks) and the receipts are another. Whatever
  // the two do not account for between them still has to be arranged, so it gets its own
  // line rather than leaving the plan and the summary quoting different totals.
  const planned = rows.reduce((a, r) => a + (r.settled ? 0 : r.ownShare), 0);
  const diff = round0(prog.ownPending - planned);
  if (Math.abs(diff) > 1) {
    running += diff;
    rows.push({
      label: diff > 0 ? 'GST invoiced earlier and other own contribution not tied to a stage'
                      : 'Already paid ahead of the schedule',
      due: null, amount: Math.abs(diff), outstanding: Math.abs(diff), alreadyPaid: 0,
      gst: 0, bankShare: 0, ownShare: diff, running,
      settled: false, kind: 'reconcile', overdue: diff > 0 });
  }
  return rows;
}
function renderOcrPlan(c, prog) {
  const body = document.getElementById('ocr-plan-body');
  if (!body) return;
  const rows = ownContributionPlan(c, prog);
  const note = document.getElementById('ocr-plan-note');
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7" class="empty-row">Assign a project and tower to see the plan.</td></tr>`;
    if (note) note.textContent = '';
    return;
  }
  const openOwn = rows.filter(r => !r.settled).reduce((a, r) => a + r.ownShare, 0);
  if (note) note.textContent = `,  ${fmtINR(openOwn)} of own money still to be arranged across ${rows.filter(r => !r.settled).length} demands`;
  body.innerHTML = rows.map(r => `
    <tr class="${r.settled ? 'plan-done' : r.overdue ? 'row-overdue' : ''}">
      <td>${esc(r.label)}${r.settled ? ' <span class="pill ok">settled</span>' : ''}</td>
      <td>${r.due ? fmtDate(r.due) : '<span class="muted">–</span>'}</td>
      <td class="num">${r.settled ? fmtINR(r.amount) : fmtINR(r.outstanding)}${
          !r.settled && r.alreadyPaid > 0
            ? `<div class="sub-line">of ${fmtINR(r.amount)} · ${fmtINR(r.alreadyPaid)} already received</div>` : ''}</td>
      <td class="num">${r.gst ? fmtINR(r.gst) : '<span class="muted">–</span>'}</td>
      <td class="num">${r.bankShare ? fmtINR(r.bankShare) : '<span class="muted">–</span>'}</td>
      <td class="num"><b>${r.ownShare ? fmtINR(r.ownShare) : '–'}</b></td>
      <td class="num">${r.settled ? '<span class="muted">–</span>' : fmtINR(r.running)}</td>
    </tr>`).join('');
}

// files created before client numbers existed can be back-filled in one go
async function assignMissingPsNos() {
  const missing = STATE.customers.filter(c => !c.psNo);
  if (!missing.length) { await askTell({ title: 'Nothing to do',
        body: 'Every customer already has a client number.' }); return; }
  if (!await askConfirm({ title: 'Assign client numbers?',
        body: `<b>${missing.length}</b> customer${missing.length===1?'':'s'} in the workspace ${missing.length===1?'has':'have'} no client number.`,
        note: 'New numbers run on from the highest already issued, so nothing is reused.',
        confirmLabel: 'Assign them' })) return;
  const touched = missing.map(c => { c.psNo = psNext(STATE.customers); return c._file; });
  refreshAll();
  [...new Set(touched)].forEach(id => markDirty(id));
  await askTell({ title: 'Done', body: `${missing.length} client number${missing.length===1?'':'s'} assigned.` });
}

/* ================= Onboarding =================
   The sales-desk intake. Price is negotiated per unit (floor, size, view all move it),
   so the quoted price is captured directly rather than derived from a project rate card.
   The number that matters at this moment is the OCR: what the customer will have to find
   from their own pocket over the build: so it is shown before the file is even created.
*/
function obEl(id) { return document.getElementById('ob_' + id); }
function obNum(id) { const v = parseFloat(obEl(id).value); return isNaN(v) ? 0 : v; }

function openOnboard() {
  if (!STATE.projects.length || !allTowers().length) {
    notify('Set up a project and at least one tower first, under the gear icon \u2192 Projects & towers.'); return;
  }
  document.getElementById('onboard-dialog').classList.add('show');
  const ps = obEl('project');
  ps.innerHTML = visibleProjects().map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  ps.value = (ctxProject() || visibleProjects()[0] || STATE.projects[0]).id;
  obEl('psNo').value = psNext(STATE.customers);
  onboardTowers();
  ['flat','type','name','contact','email','pan'].forEach(k => obEl(k).value = '');
  ['carpet','balcony','rate','price','other','token','loanExp','loanSanc'].forEach(k => obEl(k).value = '');
  populateBankSelect('ob_bank', '');
  obEl('loanExpMax').checked = false;
  clearRequiredBanner('onboard-dialog');
  obEl('sdPct').value = FUNDING_DEFAULTS.stampDutyPct;
  obEl('reg').value = FUNDING_DEFAULTS.registrationAmt;
  obEl('gstPct').value = FUNDING_DEFAULTS.gstPct;
  obEl('loanStatus').value = 'APPLIED';
  const today = toISODate(new Date());
  obEl('booking').value = today;
  obEl('tokenDate').value = today;
  obEl('agreement').value = '';
  onboardRecalc();
  obEl('name').focus();
}
function closeOnboard() { document.getElementById('onboard-dialog').classList.remove('show'); }

function onboardTowers() {
  const p = projectById(obEl('project').value);
  const ts = obEl('tower');
  ts.innerHTML = p ? p.towers.map(t => `<option value="${t.id}">Tower ${esc(t.name)}</option>`).join('') : '';
  const cur = ctxTower();
  if (cur && p && p.towers.some(t => t.id === cur.id)) ts.value = cur.id;
  onboardTowerPicked();
}
function onboardTowerPicked() {
  const p = projectById(obEl('project').value);
  const t = p && p.towers.find(x => x.id === obEl('tower').value);
  if (t && t.possessionTarget && !obEl('possession').value) obEl('possession').value = toISODate(t.possessionTarget);
  onboardRecalc();
}

// rate and quoted price drive each other, whichever the sales team happens to know
let OB_LAST = null;
function onboardFromRate() { OB_LAST = 'rate'; onboardRecalc(); }
function onboardFromPrice() { OB_LAST = 'price'; onboardRecalc(); }

function onboardRecalc() {
  const area = obNum('carpet') + obNum('balcony');
  obEl('area').textContent = area ? area.toLocaleString('en-IN') + ' sq.ft' : '–';
  if (area > 0) {
    if (OB_LAST === 'rate' && obNum('rate') > 0) obEl('price').value = Math.round(obNum('rate') * area);
    else if (OB_LAST === 'price' && obNum('price') > 0) obEl('rate').value = Math.round(obNum('price') / area);
  }
  const draft = {
    name: '__onboarding__',
    agreementValueIndex: obNum('price'),
    stampDutyPct: obNum('sdPct'), stampDutyAmt: 0,
    registrationAmt: obNum('reg'), gstPct: obNum('gstPct'),
    otherCharges: obNum('other'),
    loanAmount: obNum('loanSanc'), loanExpected: obNum('loanExp'),
    stampDutyReceived: 0,
  };
  const k = costOfFlat(draft);
  const fp = fundingPlan(draft);
  const token = obNum('token');
  const ownAfterToken = Math.max(0, fp.ownRequired - token);
  const statusTag = fp.noLoan
    ? '<span class="pill crit">no loan figure yet</span>'
    : (obNum('loanSanc') > 0 ? '<span class="pill ok">sanctioned</span>'
                             : '<span class="pill warn">sanction awaited: provisional</span>');
  document.getElementById('ob-summary').innerHTML = `
    <div class="obs-grid">
      <div class="obs-item"><span>Quoted price</span><b>${fmtINR(k.AV)}</b></div>
      <div class="obs-item"><span>Stamp duty ${k.sdPct}% + registration</span><b>${fmtINR(k.stampDuty + k.registration)}</b></div>
      <div class="obs-item"><span>GST ${k.gstPct}%</span><b>${fmtINR(k.gst)}</b></div>
      ${k.other ? `<div class="obs-item"><span>Other charges</span><b>${fmtINR(k.other)}</b></div>` : ''}
      <div class="obs-item"><span>Total cost of flat</span><b>${fmtINR(k.totalCost)}</b></div>
      <div class="obs-item"><span>Token now</span><b>${fmtINR(token)}</b></div>
      <div class="obs-item"><span>Loan ${obNum('loanSanc') > 0 ? 'sanctioned' : 'expected'}</span><b>${fmtINR(fp.loan)}</b></div>
      <div class="obs-item hero"><span>OWN CONTRIBUTION (OCR)</span><b>${fmtINR(fp.ownRequired)}</b></div>
    </div>
    <div class="obs-note">${statusTag}
      After the ${fmtINR(token)} token, this customer still has to arrange <b>${fmtINR(ownAfterToken)}</b>
      from their own pocket across the payment schedule: ${fp.ownPctOfCost}% of the total cost.
      ${fmtINR(k.nonLoanable)} of that is stamp duty, registration and charges, which no bank will fund.</div>`;
}

async function saveOnboard() {
  const name = obEl('name').value.trim();
  const flat = obEl('flat').value.trim();
  // run the same required-field list the customer form runs, mapped onto the onboarding ids
  const draft = {
    projectId: obEl('project').value, towerId: obEl('tower').value,
    psNo: obEl('psNo').value.trim(), name, flat,
    contact: obEl('contact').value.trim(), pan: obEl('pan').value.trim(),
    salableArea: obNum('carpet') + obNum('balcony'),
    agreementValueIndex: obNum('price'),
    bookingDate: parseDateInput(obEl('booking').value),
    dlStatus: obEl('loanStatus').value,
    bankOrOwn: obEl('bank').value.trim(),
  };
  const OB_EL = { f_projectId:'ob_project', f_towerId:'ob_tower', f_psNo:'ob_psNo', f_name:'ob_name',
    f_flat:'ob_flat', f_contact:'ob_contact', f_pan:'ob_pan', f_salableArea:'ob_carpet',
    f_agreementValueIndex:'ob_price', f_bookingDate:'ob_booking', f_dlStatus:'ob_loanStatus',
    f_bankOrOwn:'ob_bank' };
  const swap = REQ_RULES.filter(r => r.form === 'customer').map(r => { const o = r.el; r.el = OB_EL[o] || null; return [r, o]; });
  const blocked = enforceRequired('customer', draft, 'onboard-dialog');
  swap.forEach(([r, o]) => { r.el = o; });
  if (blocked) return;
  const psNo = obEl('psNo').value.trim().toUpperCase();
  if (psNo && STATE.customers.some(c => (c.psNo || '').toUpperCase() === psNo)) {
    notify(`${psNo} is already assigned to another customer.`); return;
  }
  if (STATE.customers.some(c => c.name.trim().toLowerCase() === name.toLowerCase())) {
    notify('A customer with this exact name already exists: names must be unique.'); return;
  }
  const p = projectById(obEl('project').value);
  const t = p && p.towers.find(x => x.id === obEl('tower').value);
  if (!p || !t) { notify('Pick a project and tower.'); return; }
  const dup = STATE.customers.find(c => c.towerId === t.id && String(c.flat).trim().toLowerCase() === flat.toLowerCase());
  if (dup && !await askConfirm({ title: 'That flat is already taken',
        body: `Flat <b>${esc(flat)}</b> in Tower <b>${esc(t.name)}</b> is already assigned to <b>${esc(dup.name)}</b>.`,
        confirmLabel: 'Continue anyway' })) return;

  const bank = obEl('bank').value.trim().toUpperCase();
  const c = newCustomer();
  Object.assign(c, {
    projectId: p.id, towerId: t.id, wing: t.name, flat,
    agreeNo: STATE.customers.length + 1,
    psNo: obEl('psNo').value.trim().toUpperCase(),
    name, contact: obEl('contact').value.trim(), email: obEl('email').value.trim(), pan: obEl('pan').value.trim(),
    type: obEl('type').value.trim(),
    carpetArea: obNum('carpet'), balconyArea: obNum('balcony'),
    salableArea: obNum('carpet') + obNum('balcony'), rate: obNum('rate'),
    agreementValueIndex: obNum('price'), basicValueManual: obNum('price'),
    stampDutyPct: obNum('sdPct'), registrationAmt: obNum('reg'),
    gstPct: obNum('gstPct'), otherCharges: obNum('other'),
    tokenPaid: obNum('token'),
    loanExpected: obNum('loanExp'), loanAmount: obNum('loanSanc'),
    loanExpectedMax: !!obEl('loanExpMax').checked,
    bankOrOwn: bank || OWN_FUNDS,
    dlStatus: (bank && bank !== OWN_FUNDS) ? obEl('loanStatus').value : 'NOT REQUIRED',
    bookingDate: parseDateInput(obEl('booking').value),
    agreementDate: parseDateInput(obEl('agreement').value),
    possessionDate: parseDateInput(obEl('possession').value) || (t.possessionTarget ? new Date(t.possessionTarget) : null),
  });
  c._file = p._file;
  STATE.customers.push(c);

  // the token is real money in: log it as an own-funds receipt so the ledger starts correct
  const tok = obNum('token');
  if (tok > 0) {
    STATE.collections.push({
      id: uid('r'), date: parseDateInput(obEl('tokenDate').value) || new Date(),
      customer: name, wing: t.name, flat, flatCost: tok, gst: 0,
      remark: 'Booking / token amount', source: 'Own', requestedDate: null, _file: p._file,
    });
  }
  closeOnboard();
  CTX.projectId = p.id; CTX.towerId = t.id;
  renderContextBar();
  refreshAll();
  markDirty(c);
  openEditor(c.id);
}

/* ================= bank master, PS lock, loan expectation ================= */
// One dropdown builder for every place a lender is picked. A value already on a customer
// that is not in the master list is kept as an option -- an old file must never silently
// lose the bank it was saved with.
function populateBankSelect(elId, current) {
  const el = document.getElementById(elId);
  if (!el) return;
  const list = bankList().slice();
  const cur = (current == null ? '' : String(current)).trim().toUpperCase();
  if (cur && list.indexOf(cur) < 0) list.push(cur);
  el.innerHTML = '<option value="">,  not set , </option>' +
    list.map(b => `<option value="${esc(b)}">${esc(b)}${bankList().indexOf(b) < 0 ? ' (not in list)' : ''}</option>`).join('');
  el.value = cur;
}

let PSNO_UNLOCKED = false;
function lockPsNo(lock) {
  PSNO_UNLOCKED = !lock;
  const el = document.getElementById('f_psNo');
  const btn = document.getElementById('btn-unlock-psno');
  const hint = document.getElementById('psno-hint');
  if (!el) return;
  el.readOnly = !!lock;
  if (btn) btn.textContent = lock ? 'Unlock' : 'Lock';
  if (hint) hint.textContent = lock
    ? 'Issued once and fixed: it is how this client is referenced everywhere.'
    : 'Unlocked. Change it only to correct a genuine mistake: reports, receipts and the bank file all quote this number.';
}
async function togglePsNoLock() {
  if (PSNO_UNLOCKED) { lockPsNo(true); return; }
  if (!await askConfirm({ title: 'Unlock the client number?',
        body: 'It is meant to stay fixed for the life of the record.',
        note: 'Reports, receipts and the bank file all quote this number. Unlock it only to correct one that was issued wrongly.',
        confirmLabel: 'Unlock it' })) return;
  lockPsNo(false);
  const el = document.getElementById('f_psNo');
  if (el) { el.focus(); el.select(); }
}

// what the customer asked for vs. what the bank actually gave
function renderLoanExpectation(b) {
  const note = document.getElementById('loan-expect-note');
  if (!note) return;
  const maxWanted = !!b.loanExpectedMax;
  const expected = num(b.loanExpected, 0);
  const sanctioned = num(b.loanAmount, 0);
  const elExp = document.getElementById('f_loanExpected');
  if (elExp) elExp.disabled = maxWanted;
  if (!maxWanted && !expected && !sanctioned) { note.style.display = 'none'; return; }
  note.style.display = 'block';
  const want = maxWanted ? 'the <b>maximum</b> the bank will sanction'
                         : `<b>${fmtINR(expected)}</b>`;
  if (!sanctioned) {
    note.innerHTML = `Customer is looking for ${want}. Nothing sanctioned yet: every funding figure `
      + `on this file is provisional until the sanction letter lands.`;
    return;
  }
  if (maxWanted) {
    note.innerHTML = `Customer asked for ${want} and the bank sanctioned <b>${fmtINR(sanctioned)}</b>.`;
    return;
  }
  const gap = sanctioned - expected;
  if (Math.abs(gap) < 1) {
    note.innerHTML = `Sanctioned <b>${fmtINR(sanctioned)}</b>: exactly what the customer expected.`;
  } else if (gap > 0) {
    note.innerHTML = `Customer expected ${want}; the bank sanctioned <b>${fmtINR(sanctioned)}</b>: `
      + `<b>${fmtINR(gap)} more</b> than they were counting on. Their own contribution drops by the same amount.`;
  } else {
    note.innerHTML = `Customer expected ${want}; the bank sanctioned only <b>${fmtINR(sanctioned)}</b>: `
      + `a shortfall of <b>${fmtINR(-gap)}</b> they now have to fund themselves. Tell them early.`;
  }
}
