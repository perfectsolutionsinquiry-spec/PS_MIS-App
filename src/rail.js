/* ================= The navigation rail =================
   The five top tabs and the dashboard's four sub-tabs were two levels of the same thing:
   picking a screen. They are one list now. The old bars stay in the DOM and the rail drives
   them by clicking, so every existing handler, drill-through and "go to that tab" call keeps
   working untouched. */
const RAIL_ICON = {
  actions:     '<path d="M4 6h9M4 12h7M4 18h5"></path><path d="M14 16l2.5 2.5L21 14"></path>',
  overview:    '<rect x="3" y="3" width="7" height="8" rx="1"></rect><rect x="14" y="3" width="7" height="5" rx="1"></rect><rect x="14" y="11" width="7" height="10" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect>',
  customer:    '<circle cx="12" cy="8" r="3.6"></circle><path d="M5 20.5a7 7 0 0 1 14 0"></path>',
  reliability: '<path d="M3 12h3.5l2.5 7 4-14 2.5 7H21"></path>',
  forecast:    '<path d="M3 17l5.5-5.5 3.5 3.5L21 6"></path><path d="M21 11V6h-5"></path>',
  customers:   '<circle cx="9" cy="8" r="3.3"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0"></path><path d="M16.5 5.4a3.3 3.3 0 0 1 0 5.2"></path><path d="M18.2 20a6.6 6.6 0 0 0-2.7-5.1"></path>',
  collections: '<rect x="2.5" y="6" width="19" height="12" rx="2"></rect><circle cx="12" cy="12" r="2.4"></circle><path d="M6 12h.01M18 12h.01"></path>',
  docs:        '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5"></path><path d="M9 13h6M9 17h4"></path>',
};
const RAIL_ITEMS = [
  { id: 'actions', mtab: 'actions', label: 'Action Items', icon: 'actions' },
  { group: 'Dashboard' },
  { id: 'overview',    mtab: 'dashboard', tab: 'overview',    label: 'Overview',     icon: 'overview' },
  { id: 'customer',    mtab: 'dashboard', tab: 'customer',    label: 'Customer 360', icon: 'customer' },
  { id: 'reliability', mtab: 'dashboard', tab: 'reliability', label: 'Reliability',  icon: 'reliability' },
  { id: 'forecast',    mtab: 'dashboard', tab: 'forecast',    label: 'Forecast',     icon: 'forecast' },
  { group: 'Records' },
  { id: 'customers',   mtab: 'customers',   label: 'Customers',   icon: 'customers' },
  { id: 'collections', mtab: 'collections', label: 'Collections', icon: 'collections' },
  { id: 'docs',        mtab: 'docs',        label: 'Documents',   icon: 'docs' },
];

function buildRail() {
  const nav = document.getElementById('rail-nav');
  if (!nav) return;
  nav.innerHTML = RAIL_ITEMS.map(it => it.group
    ? `<div class="rail-group">${esc(it.group)}</div>`
    : `<button class="rail-item" type="button" data-rail="${it.id}" title="${esc(it.label)}">
         <span class="ri-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
           stroke-linecap="round" stroke-linejoin="round">${RAIL_ICON[it.icon] || ''}</svg></span>
         <span class="ri-lab">${esc(it.label)}</span>
       </button>`).join('');
  nav.querySelectorAll('.rail-item').forEach(b =>
    b.addEventListener('click', () => railGo(b.dataset.rail)));
  syncRail();
}

function railGo(id) {
  const it = RAIL_ITEMS.find(x => x.id === id);
  if (!it) return;
  const mt = document.querySelector(`.mtab-btn[data-mtab="${it.mtab}"]`);
  if (mt) mt.click();
  if (it.tab) {
    const tb = document.querySelector(`.tab-btn[data-tab="${it.tab}"]`);
    if (tb) tb.click();
  }
  syncRail();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* the rail follows the app rather than the other way round, so a drill-through that clicks
   a tab directly still lights the right entry */
function syncRail() {
  const panel = document.querySelector('.mtab-panel.active');
  const mtab = panel ? panel.id.replace(/^mtab-/, '') : '';
  const sub = document.querySelector('#mtab-dashboard .tab-panel.active');
  const tab = sub ? sub.id.replace(/^tab-/, '') : '';
  const hit = RAIL_ITEMS.find(x => x.id && x.mtab === mtab && (!x.tab || x.tab === tab))
           || RAIL_ITEMS.find(x => x.id && x.mtab === mtab);
  document.querySelectorAll('#rail-nav .rail-item').forEach(b =>
    b.classList.toggle('active', !!hit && b.dataset.rail === hit.id));
}

function setRailPinned(on) {
  document.body.classList.toggle('rail-pinned', !!on);
  const lab = document.getElementById('rail-toggle-lab');
  if (lab) lab.textContent = on ? 'Collapse' : 'Menu';
  const btn = document.getElementById('rail-toggle');
  if (btn) btn.title = on ? 'Collapse the menu to icons' : 'Keep the menu open';
  try { localStorage.setItem('ps-rail-pinned', on ? '1' : '0'); } catch (e) {}
}
