/* ================= event wiring + boot ================= */
document.querySelectorAll('.mtab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mtab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.mtab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('mtab-' + btn.dataset.mtab).classList.add('active');
    if (btn.dataset.mtab === 'docs') { try { renderDocs(); } catch (e) { console.error('documents render failed', e); } }
    syncRail();
  });
});

/* --- the navigation rail --- */
buildRail();
document.getElementById('rail-toggle').addEventListener('click', () =>
  setRailPinned(!document.body.classList.contains('rail-pinned')));
document.getElementById('rail-settings').addEventListener('click', () => openSettings());
try { setRailPinned(localStorage.getItem('ps-rail-pinned') === '1'); } catch (e) { setRailPinned(false); }

/* --- documents --- */
document.getElementById('doc_kind').addEventListener('change', e => {
  DOC.kind = e.target.value; renderDocs();
});
document.getElementById('doc_customer').addEventListener('change', e => {
  DOC.name = e.target.value; DOC.demandId = ''; renderDocs();
});
document.getElementById('doc_demand').addEventListener('change', e => {
  DOC.demandId = e.target.value;
  fillDocDemands(); docFillDefaults(); renderDocPaper();
});
/* every other control only redraws the sheet: nothing typed here touches the record */
document.querySelectorAll('#mtab-docs .doc-form input, #mtab-docs .doc-form textarea, #mtab-docs .doc-form select')
  .forEach(el => {
    if (['doc_kind', 'doc_customer', 'doc_demand'].includes(el.id)) return;
    el.addEventListener('input', renderDocPaper);
    el.addEventListener('change', renderDocPaper);
  });
document.getElementById('btn-doc-reset').addEventListener('click', () => { docFillDefaults(); renderDocPaper(); });
document.getElementById('btn-doc-log').addEventListener('click', async () => {
  const x = docContext();
  if (!x) return;
  const f = docForm();
  if (f.rcAmount <= 0 && f.rcGst <= 0) { notify('Put an amount on the receipt first.'); return; }
  if (!await askConfirm({ title: 'Add this to the ledger?',
        body: `<b>${fmtINR(f.rcAmount + f.rcGst)}</b> against <b>${esc(x.c.name)}</b>, ${esc(f.rcTowards)}.`,
        note: 'Only do this if the payment is not already recorded in Collections.',
        confirmLabel: 'Record it' })) return;
  const l = towerOf(x.c);
  STATE.collections.push({ id: uid('r'), date: f.date || new Date(), customer: x.c.name,
    wing: l.tower ? l.tower.name : x.c.wing, flat: x.c.flat,
    flatCost: round0(f.rcAmount), gst: round0(f.rcGst),
    remark: `${f.rcTowards} · receipt ${f.no}`,
    source: /disburse/i.test(f.rcMode) ? 'Bank' : 'Own', requestedDate: null, _file: x.c._file });
  DOC.logged.add(f.no);
  markDirty(x.c);
  refreshAll();
  renderDocPaper();
  document.getElementById('btn-doc-log').disabled = true;
  notify(`Recorded ${fmtINR(f.rcAmount + f.rcGst)} against ${x.c.name}. It is in the ledger now, so this receipt will not add it twice.`);
});
document.getElementById('btn-doc-print').addEventListener('click', docPrint);
document.getElementById('btn-doc-word').addEventListener('click', docWord);

document.getElementById('ctx_project').addEventListener('change', () => {
  CTX.towerId = 'all';
  onContextChange();
});
document.getElementById('ctx_tower').addEventListener('change', onContextChange);
document.getElementById('ctx_partner').addEventListener('change', e => {
  CTX.partner = e.target.value;
  // narrowing to one partner selects that partner's files, so the whole app follows
  SEL.files = CTX.partner === 'all' ? 'all' : FILES.filter(f => f.partner === CTX.partner).map(f => f.id);
  applyFileSelection();
});
document.getElementById('ctx_files_btn').addEventListener('click', e => {
  e.stopPropagation();
  document.getElementById('ctx_files_menu').classList.toggle('show');
});
document.addEventListener('click', e => {
  const m = document.getElementById('ctx_files_menu');
  if (m && m.classList.contains('show') && !e.target.closest('#ctx-file-wrap')) m.classList.remove('show');
});

/* --- projects --- */
document.getElementById('btn-add-proj').addEventListener('click', addProjectFlow);
document.getElementById('tg-cancel').addEventListener('click', () => closeTargetDialog(null));
document.getElementById('tg-go').addEventListener('click', confirmTarget);
document.getElementById('tg_partner').addEventListener('change', tgFill);
document.getElementById('tg_project').addEventListener('change', tgFillTowers);
document.getElementById('tg_tower').addEventListener('change', () => {
  document.getElementById('tg_tower_new_wrap').style.display =
    document.getElementById('tg_tower').value === '__new__' ? 'block' : 'none';
});
document.getElementById('target-dialog').addEventListener('click', e => {
  if (backdropDismiss(e, 'target-dialog')) closeTargetDialog(null);
});
document.getElementById('btn-cancel-proj').addEventListener('click', () => {
  if (PROJ_BUF && !PROJ_BUF.name) STATE.projects = STATE.projects.filter(x => x.id !== PROJ_BUF.id);
  closeProjectEditor();
  renderContextBar(); renderProjectList(); refreshAll();
});
document.getElementById('btn-save-proj').addEventListener('click', saveProjectEditor);

/* --- towers --- */
document.getElementById('btn-add-tower').addEventListener('click', addTower);
document.getElementById('btn-brief-close').addEventListener('click', () =>
  document.getElementById('brief-modal').classList.remove('show'));
document.getElementById('brief-modal').addEventListener('click', e => {
  if (backdropDismiss(e, 'brief-modal')) document.getElementById('brief-modal').classList.remove('show');
});
document.getElementById('btn-add-contact').addEventListener('click', () => {
  if (!PROJ_BUF) return;
  if (!PROJ_BUF.contacts) PROJ_BUF.contacts = [];
  PROJ_BUF.contacts.push(newContact());
  renderProjectContacts();
});
document.getElementById('btn-cancel-tower').addEventListener('click', cancelTowerEditor);
document.getElementById('btn-save-tower').addEventListener('click', saveTowerEditor);
document.getElementById('btn-add-stage').addEventListener('click', addScheduleStage);
document.getElementById('btn-reset-stages').addEventListener('click', resetScheduleToDefault);

/* --- tower inventory --- */
document.getElementById('btn-add-unit-type').addEventListener('click', () => {
  if (!TOWER_BUF) return;
  towerUnitTypes(TOWER_BUF).push(newUnitType());
  renderInventoryEditor();
});
document.getElementById('inv_positions').addEventListener('input', renderPositionPickers);
document.getElementById('btn-inv-generate').addEventListener('click', generateInventory);
document.getElementById('btn-inv-from-sales').addEventListener('click', inventoryFromSales);
document.getElementById('btn-add-unit').addEventListener('click', () => {
  if (!TOWER_BUF) return;
  towerUnits(TOWER_BUF).push(newInvUnit());
  renderInventoryUnits();
});
document.getElementById('btn-clear-units').addEventListener('click', async () => {
  if (!TOWER_BUF) return;
  const n = towerUnits(TOWER_BUF).length;
  if (!n) return;
  if (!await askConfirm({ title: 'Clear the unit list?', body: `All <b>${n}</b> units come off this tower.`,
        note: 'The customers who bought them are not touched.', confirmLabel: 'Clear it', danger: true })) return;
  TOWER_BUF.units = [];
  renderInventoryUnits();
});
document.getElementById('inv-filter').addEventListener('change', e => {
  INV_FILT.mode = e.target.value; pagerReset('inventory'); renderInventoryUnits();
});
document.getElementById('inv-search').addEventListener('input', e => {
  INV_FILT.q = e.target.value; pagerReset('inventory'); renderInventoryUnits();
});

/* --- outstanding-balance picker --- */
document.getElementById('balance-pick').addEventListener('change', e => {
  BALANCE_PICK = e.target.value;
  renderBalanceChart();
});

/* --- bank master --- */
document.getElementById('btn-add-bank').addEventListener('click', addBankFromInput);
document.getElementById('set-bank-new').addEventListener('keydown', e => { if (e.key === 'Enter') addBankFromInput(); });

/* --- PS client number lock --- */
document.getElementById('btn-unlock-psno').addEventListener('click', togglePsNoLock);
document.getElementById('f_loanExpectedMax').addEventListener('change', () => recomputeEditorPreview());
document.getElementById('ob_loanExpMax').addEventListener('change', () => {
  document.getElementById('ob_loanExp').disabled = document.getElementById('ob_loanExpMax').checked;
});

/* --- in-page confirmation --- */
/* ================= Modal backdrop guards =================
   Clicking the dim area behind a modal closes it. Two things made that dangerous, and both
   showed up as "the Record receipt button does nothing":

   1. The confirmation opens directly under the cursor. A double-click -- or the second,
      impatient click when the first seemed to do nothing -- landed on the confirmation's
      own backdrop and dismissed it before it was ever read. The receipt was cancelled by
      the click that was meant to record it.
   2. A press that starts inside the card and releases outside it (selecting text in the
      summary, dragging off a button) counts as a click on the backdrop.

   So a backdrop only dismisses when the press started there and the modal has been open
   long enough to have been seen. */
const MODAL_SHOWN_AT = new Map();
let MOUSEDOWN_TARGET = null;
document.addEventListener('mousedown', e => { MOUSEDOWN_TARGET = e.target; }, true);
document.querySelectorAll('.modal').forEach(m => {
  if (m.classList.contains('show')) MODAL_SHOWN_AT.set(m.id, Date.now());
  new MutationObserver(() => {
    if (m.classList.contains('show')) { MODAL_SHOWN_AT.set(m.id, Date.now()); return; }
    // The confirmation was hidden some other way. Settle its promise as a "no" rather than
    // leaving whatever awaited it stuck forever -- a stuck await is a dead button.
    if (m.id === 'ask-modal' && ASK_RESOLVE) {
      const r = ASK_RESOLVE; ASK_RESOLVE = null; try { r(false); } catch (e) {}
    }
  }).observe(m, { attributes: true, attributeFilter: ['class'] });
});
function backdropDismiss(e, id) {
  if (e.target.id !== id) return false;
  if (MOUSEDOWN_TARGET && MOUSEDOWN_TARGET !== e.target) return false;
  return (Date.now() - (MODAL_SHOWN_AT.get(id) || 0)) > 400;
}

document.getElementById('ask-go').addEventListener('click', () => askClose(true));
document.getElementById('ask-cancel').addEventListener('click', () => askClose(false));
/* A confirmation is never dismissed by clicking beside it. It sits exactly where the
   button that opened it was, so the click meant for that button -- or the second,
   impatient one -- used to cancel the very thing it was trying to do, with no trace.
   Cancel and Esc still close it; a stray click just draws the eye to the card. */
document.getElementById('ask-modal').addEventListener('click', e => {
  if (e.target.id !== 'ask-modal') return;
  const card = document.querySelector('#ask-modal .card2');
  if (!card) return;
  card.classList.remove('nudge');
  void card.offsetWidth;
  card.classList.add('nudge');
});

/* --- action queue: search, paging --- */
const actRerender = () => { try { renderActions(); } catch (e) { console.error(e); } };
document.getElementById('act-search').addEventListener('input', e => { ACT.q = e.target.value; pagerReset('queue'); actRerender(); });
document.getElementById('act-clear').addEventListener('click', () => { ACT.q = ''; pagerReset('queue'); actRerender(); });

/* --- per-customer collection panel --- */
document.getElementById('btn-close-collect').addEventListener('click', closeCollect);
document.getElementById('collect-modal').addEventListener('click', e => { if (backdropDismiss(e, 'collect-modal')) closeCollect(); });
document.getElementById('btn-collect-full').addEventListener('click', () => {
  const id = COLLECT_ID; closeCollect();
  if (id) { openEditor(id); document.querySelector('.mtab-btn[data-mtab="customers"]').click(); }
});
document.getElementById('btn-close-gaps').addEventListener('click', closeGaps);
document.getElementById('gaps-modal').addEventListener('click', e => { if (backdropDismiss(e, 'gaps-modal')) closeGaps(); });
document.getElementById('btn-gaps-prev').addEventListener('click', () => stepGaps(-1));
document.getElementById('btn-gaps-next').addEventListener('click', () => stepGaps(1));
document.getElementById('btn-gaps-full').addEventListener('click', () => {
  const c = gapsCustomer(); if (!c) return;
  closeGaps();
  document.querySelector('.mtab-btn[data-mtab="customers"]').click();
  openEditor(c.id);
});
document.getElementById('btn-gaps-collect').addEventListener('click', () => {
  const c = gapsCustomer(); if (!c) return;
  closeGaps();
  openCollect(c.id, null);
});
document.getElementById('btn-cancel-receipt').addEventListener('click', closeReceipt);
document.getElementById('btn-save-receipt').addEventListener('click', saveReceipt);
document.getElementById('receipt-modal').addEventListener('click', e => { if (backdropDismiss(e, 'receipt-modal')) closeReceipt(); });
['rc-full','rc-amount','rc-gst'].forEach(id =>
  document.getElementById(id).addEventListener('input', receiptRecalc));
document.getElementById('rc-source').addEventListener('change', receiptRecalc);
document.getElementById('rc-against').addEventListener('change', receiptPick);
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.getElementById('ask-modal').classList.contains('show')) { askClose(false); return; }
  if (document.getElementById('receipt-modal').classList.contains('show')) { closeReceipt(); return; }
  if (document.getElementById('gaps-modal').classList.contains('show')) { closeGaps(); return; }
  if (document.getElementById('collect-modal').classList.contains('show')) closeCollect();
});

/* --- maximize --- */
document.getElementById('btn-max-close').addEventListener('click', restoreCard);
document.getElementById('max-modal').addEventListener('click', e => { if (backdropDismiss(e, 'max-modal')) restoreCard(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && MAXIMIZED) restoreCard(); });

/* --- daily-collection range --- */
document.getElementById('daily-range').addEventListener('change', e => setDailyRange(e.target.value));

/* --- settings --- */
document.getElementById('btn-settings').addEventListener('click', () => openSettings());
document.getElementById('btn-close-settings').addEventListener('click', closeSettings);
/* --- builder partners --- */
document.getElementById('btn-add-builder').addEventListener('click', () => openBuilderEditor(null));
document.getElementById('btn-cancel-builder').addEventListener('click', closeBuilderEditor);
document.getElementById('btn-save-builder').addEventListener('click', saveBuilderEditor);
document.getElementById('btn-bp-show-list').addEventListener('click', () => {
  minimiseBuilderList(false);
  document.getElementById('bp-list-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
document.getElementById('btn-add-account').addEventListener('click', () => {
  if (!BUILDER_BUF) return;
  BUILDER_BUF.accounts = BUILDER_BUF.accounts || [];
  BUILDER_BUF.accounts.push(newAccount());
  renderAccountRows();
});

document.getElementById('btn-pick-folder').addEventListener('click', pickMisFolder);
document.getElementById('btn-add-folder-2').addEventListener('click', () => document.getElementById('folder-input').click());
document.getElementById('btn-add-file-2').addEventListener('click', () => document.getElementById('file-input').click());
document.getElementById('btn-reload-folder').addEventListener('click', () => { closeSettings(); loadFromFolderHandle(); });
document.getElementById('btn-forget-folder').addEventListener('click', forgetMisFolder);
document.getElementById('btn-reset-settings').addEventListener('click', resetSettings);
document.getElementById('btn-assign-psno').addEventListener('click', () => { assignMissingPsNos(); renderSettings(); });
document.getElementById('settings-modal').addEventListener('click', e => {
  if (backdropDismiss(e, 'settings-modal')) closeSettings();
});

/* --- report drill-through --- */
document.getElementById('btn-close-report').addEventListener('click', closeReport);
document.getElementById('report-modal').addEventListener('click', e => {
  if (backdropDismiss(e, 'report-modal')) closeReport();
});
document.getElementById('rpt-search').addEventListener('input', e => { RPT.q = e.target.value; pagerReset('report'); renderReport(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('report-modal').classList.contains('show')) closeReport();
});
// one delegated handler for every chart element that declares what it reports on
document.getElementById('mtab-dashboard').addEventListener('click', e => {
  const el = e.target.closest('[data-report]');
  if (!el) return;
  openReport(el.dataset.report, el.dataset.param || null);
});

/* --- onboarding --- */
document.getElementById('btn-onboard').addEventListener('click', openOnboard);
document.getElementById('btn-cancel-onboard').addEventListener('click', closeOnboard);
document.getElementById('btn-save-onboard').addEventListener('click', saveOnboard);
document.getElementById('ob_project').addEventListener('change', onboardTowers);
document.getElementById('ob_tower').addEventListener('change', onboardTowerPicked);
document.getElementById('ob_rate').addEventListener('input', onboardFromRate);
document.getElementById('ob_price').addEventListener('input', onboardFromPrice);
['carpet','balcony','sdPct','reg','gstPct','other','token','loanExp','loanSanc'].forEach(k => {
  const el = document.getElementById('ob_' + k);
  if (el) el.addEventListener('input', onboardRecalc);
});
document.getElementById('onboard-dialog').addEventListener('click', e => {
  if (backdropDismiss(e, 'onboard-dialog')) closeOnboard();
});

/* --- customers --- */
setupCustomerEditor();
/* every static field hint on the page becomes an ⓘ on its label */
applyFieldHelp();
/* --- share the overview --- */
function openExportDialog() {
  if (exportGuard()) return;
  const partner = [...new Set(visibleCustomers().map(c => (fileById(c._file) || {}).partner))][0] || '';
  document.getElementById('ex-sub').textContent = partner
    ? `A one-page picture of where ${partner} stands, ready to hand over.`
    : 'A one-page picture of where the project stands, for the builder.';
  document.getElementById('export-dialog').classList.add('show');
}
function closeExportDialog() { document.getElementById('export-dialog').classList.remove('show'); }
document.getElementById('btn-export-open').addEventListener('click', openExportDialog);
document.getElementById('btn-brief-open').addEventListener('click', openDailyBrief);
document.getElementById('ex-cancel').addEventListener('click', closeExportDialog);
document.getElementById('ex-png').addEventListener('click', () => { closeExportDialog(); exportBuilderPNG(); });
document.getElementById('ex-svg').addEventListener('click', () => { closeExportDialog(); exportBuilderSVG(); });
document.getElementById('export-dialog').addEventListener('click', e => {
  if (backdropDismiss(e, 'export-dialog')) closeExportDialog();
});
document.getElementById('btn-show-list').addEventListener('click', showCustomerList);
document.getElementById('btn-add-worknote').addEventListener('click', addTypedWorkNote);
document.getElementById('btn-add-coapp').addEventListener('click', addCoApplicantRow);
/* changing the booking status by hand hands the stage back to the record: an override that
   silently outranks what the user just typed is worse than no override at all */
document.getElementById('f_bookingStatus').addEventListener('change', () => {
  if (EDIT_BUFFER) { EDIT_BUFFER.stage = ''; readEditorForm(); renderStageBanner(); }
});
['f_dlStatus', 'f_bankOrOwn', 'f_loanAmount'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', () => { if (EDIT_BUFFER) { readEditorForm(); renderStageBanner(); } });
});
document.getElementById('coapp-list').addEventListener('click', e => {
  const b = e.target.closest('[data-coapp-remove]');
  if (b) removeCoApplicantRow(parseInt(b.dataset.coappRemove, 10));
});
window.addEventListener('resize', applyEditorCols);
document.getElementById('btn-add-cust').addEventListener('click', addCustomer);
document.getElementById('btn-cancel-cust').addEventListener('click', cancelEditor);
document.getElementById('btn-save-cust').addEventListener('click', saveEditor);
document.getElementById('f_projectId').addEventListener('change', onEditorProjectChange);
document.getElementById('f_towerId').addEventListener('change', onEditorTowerChange);
FIELD_MAP.forEach(([k]) => {
  if (k === 'projectId' || k === 'towerId') return;
  const el = document.getElementById('f_' + k);
  if (el) el.addEventListener('input', recomputeEditorPreview);
});

/* --- action items --- */
document.getElementById('act-type').addEventListener('change', e => { ACT.type = e.target.value; renderActions(); });
document.getElementById('act-bank').addEventListener('change', e => { ACT.bank = e.target.value; renderActions(); });
document.getElementById('act-horizon').addEventListener('change', e => { ACT.horizon = +e.target.value; renderActions(); });

/* --- table search / filter / sort --- */
const _cs = document.getElementById('cust-search');
const _cf = document.getElementById('cust-filter');
_cs.addEventListener('input', () => { pagerReset('customers'); FILT.cust = _cs.value; renderCustomerList(); });
_cf.addEventListener('change', () => { pagerReset('customers'); FILT.custStatus = _cf.value; renderCustomerList(); });
document.getElementById('cust-clear').addEventListener('click', () => {
  _cs.value = ''; _cf.value = 'all'; FILT.cust = ''; FILT.custStatus = 'all'; pagerReset('customers'); renderCustomerList();
});
wireSortHeaders('#cust-thead', SORT.cust, () => { pagerReset('customers'); renderCustomerList(); });

const _os = document.getElementById('coll-search');
_os.addEventListener('input', () => { pagerReset('collections'); FILT.coll = _os.value; renderCollections(); });
document.getElementById('coll-clear').addEventListener('click', () => {
  _os.value = ''; FILT.coll = ''; pagerReset('collections'); renderCollections();
});
wireSortHeaders('#coll-thead', SORT.coll, () => { pagerReset('collections'); renderCollections(); });

document.getElementById('ms-filter').addEventListener('change', e => {
  FILT.ms = e.target.value; pagerReset('timeline'); renderMilestones();
});

/* --- collections --- */
document.getElementById('btn-add-coll').addEventListener('click', addCollectionEntry);
document.getElementById('coll_customer').addEventListener('change', () => {
  document.getElementById('coll_flatcost').value = '';
  document.getElementById('coll_gst').value = '';
  fillCollectionTargets();
});
document.getElementById('coll_against_btn').addEventListener('click', e => {
  e.stopPropagation();
  const box = document.getElementById('coll_against_cbx');
  box.classList.contains('open') ? closeDemandPicker() : openDemandPicker();
});
document.getElementById('coll_against_btn').addEventListener('keydown', demandPickerKeys);
document.getElementById('coll_against_panel').addEventListener('keydown', demandPickerKeys);
document.addEventListener('click', e => {
  const box = document.getElementById('coll_against_cbx');
  if (box && box.classList.contains('open') && !box.contains(e.target)) closeDemandPicker();
});
document.getElementById('coll_against').addEventListener('change', () => {
  const c = STATE.customers.find(x => x.name === document.getElementById('coll_customer').value);
  if (!c) return;
  // a different demand means a different figure: clear first, then offer the new one
  document.getElementById('coll_flatcost').value = '';
  document.getElementById('coll_gst').value = '';
  prefillCollectionAmount(receiptTargets(c));
});
const _src = document.getElementById('coll_source');
function _syncCollSource() {
  document.getElementById('coll_req_wrap').style.display = _src.value === 'Bank' ? '' : 'none';
}
_src.addEventListener('change', _syncCollSource);
_syncCollSource();

/* --- timeline --- */
document.getElementById('ms_customer').addEventListener('change', () => { pagerReset('timeline'); renderMilestones(); });

/* --- payment dialog --- */
document.getElementById('pd_amount').addEventListener('input', updatePayDialog);
document.getElementById('btn-cancel-pay').addEventListener('click', closePaymentDialog);
document.getElementById('btn-save-pay').addEventListener('click', savePaymentDialog);
document.getElementById('pay-dialog').addEventListener('click', e => {
  if (backdropDismiss(e, 'pay-dialog')) closePaymentDialog();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('pay-dialog').classList.contains('show')) closePaymentDialog();
});

/* --- file in / out --- */
document.getElementById('file-input').addEventListener('change', async e => {
  const picked = [...e.target.files];
  e.target.value = '';
  if (picked.length) await addFiles(picked);
});
document.getElementById('folder-input').addEventListener('change', async e => {
  const picked = [...e.target.files];
  e.target.value = '';
  if (picked.length) await addFiles(picked);
});
window.addEventListener('beforeunload', e => { if (FILES.some(f => f.dirty)) { e.preventDefault(); e.returnValue = ''; } });

/* --- boot --- */
(async function init() {
  await loadTemplateAsBase();
  document.getElementById('coll_date').valueAsDate = new Date();
  renderContextBar();
  renderProjectList();
  renderBuilderList();
  refreshAll();
  markClean('Nothing loaded yet');
  initMisFolder();
})();
