/* ================= In-page confirmation =================
   Native confirm() is not safe for anything a primary action depends on. Chrome offers
   "prevent this page from creating additional dialogs" after a few of them, and from that
   point every confirm() silently returns false: the Record receipt button simply stops
   working with no error and no explanation. Some kiosk and embedded browsers suppress
   them outright. So every "are you sure" now happens inside the page.

   askConfirm() returns a promise. Nothing about the app blocks on a browser dialog.
*/
let ASK_RESOLVE = null;

function askConfirm(opts) {
  const o = typeof opts === 'string' ? { body: opts } : (opts || {});
  const m = document.getElementById('ask-modal');
  // A second confirmation opening while one is still pending used to overwrite ASK_RESOLVE
  // and orphan the first promise: whatever was awaiting it -- saveReceipt, for one -- never
  // resumed, and its button looked dead. Settle the old one before taking the new.
  if (ASK_RESOLVE) { const stale = ASK_RESOLVE; ASK_RESOLVE = null; try { stale(false); } catch (e) {} }
  document.getElementById('ask-title').textContent = o.title || 'Please confirm';
  document.getElementById('ask-body').innerHTML = o.html || esc(o.body || '').replace(/\n/g, '<br>');
  const iw = document.getElementById('ask-input-wrap');
  if (iw && !o.keepInput) iw.style.display = 'none';
  const list = document.getElementById('ask-list');
  list.innerHTML = (o.rows || []).map(r =>
    `<div class="ask-row"><span>${esc(r[0])}</span><b>${esc(String(r[1]))}</b></div>`).join('');
  list.style.display = (o.rows && o.rows.length) ? 'block' : 'none';
  const note = document.getElementById('ask-note');
  note.innerHTML = o.note || '';
  note.style.display = o.note ? 'block' : 'none';
  const go = document.getElementById('ask-go');
  go.textContent = o.confirmLabel || 'Yes, continue';
  go.className = 'btn-primary' + (o.danger ? ' danger' : '');
  const cancel = document.getElementById('ask-cancel');
  cancel.textContent = o.cancelLabel || 'Cancel';
  cancel.style.display = (o.cancelLabel === null) ? 'none' : '';
  m.classList.add('show');
  setTimeout(() => { try { go.focus(); } catch (e) {} }, 30);
  return new Promise(res => { ASK_RESOLVE = res; });
}
function askClose(answer) {
  document.getElementById('ask-modal').classList.remove('show');
  const r = ASK_RESOLVE; ASK_RESOLVE = null;
  if (r) r(!!answer);
}

/* One-line text input, in the page. Replaces prompt(), which browsers suppress along with
   confirm() -- and which many block outright. Resolves to the string, or null on cancel. */
function askInput(opts) {
  const o = opts || {};
  const wrap = document.getElementById('ask-input-wrap');
  const inp = document.getElementById('ask-input');
  wrap.style.display = 'block';
  document.getElementById('ask-input-label').textContent = o.label || '';
  inp.value = o.value || '';
  inp.placeholder = o.placeholder || '';
  const p = askConfirm({ title: o.title || 'Enter a value', body: o.body || '',
                         confirmLabel: o.confirmLabel || 'Save', note: o.note });
  setTimeout(() => { try { inp.focus(); inp.select(); } catch (e) {} }, 40);
  return p.then(ok => { const v = inp.value; wrap.style.display = 'none'; return ok ? v : null; });
}

/* a plain message, same treatment -- one button, nothing to decide */
function askTell(opts) {
  const o = typeof opts === 'string' ? { body: opts } : (opts || {});
  return askConfirm({ ...o, title: o.title || 'Cannot do that',
                      confirmLabel: o.confirmLabel || 'OK', cancelLabel: null, onlyOk: true });
}

/* Fire-and-forget message. Replaces alert(): the caller returns immediately, exactly as it
   did before, but the user actually sees why nothing happened even in a browser that has
   suppressed native dialogs. */
function notify(body, title) {
  askConfirm({ title: title || 'Cannot do that', body: body,
               confirmLabel: 'OK', cancelLabel: null });
  const cancel = document.getElementById('ask-cancel');
  if (cancel) cancel.style.display = 'none';
}
