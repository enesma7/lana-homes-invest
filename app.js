/* LANA HOMES Investments — flips, holdings and the LLC expense ledger. Single-page app (no build step). */
(function () {
  'use strict';
  var CFG = window.FLIPS_CONFIG || {};
  var C = window.FlipCalc;
  var STATUSES = ['Estimate', 'In Escrow', 'Rehab', 'Active', 'Pending', 'Sold'];
  var HSTATUSES = ['Owned', 'Rehab', 'Rented', 'Vacant', 'For Sale', 'Sold'];
  function isHolding(f) { return f && f.kind === 'holding'; }
  function statusesOf(f) { return isHolding(f) ? HSTATUSES : STATUSES; }
  var S = { token: sessionStorage.getItem('fl_token') || '', user: null, flips: null };
  var $app = document.getElementById('app');

  /* ---------- utils ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(v, dec) { var x = Number(v) || 0; var s = Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: dec === 0 ? 0 : 2, maximumFractionDigits: dec === 0 ? 0 : 2 }); return (x < 0 ? '−$' : '$') + s; }
  function pct(v, d) { if (v == null || !isFinite(v)) return '—'; return (v * 100).toFixed(d == null ? 1 : d) + '%'; }
  function signed(html, v) { return v > 0 ? '<span class="pos">' + html + '</span>' : (v < 0 ? '<span class="neg">' + html + '</span>' : '<span>' + html + '</span>'); }
  function sMoney(v, dec) { return signed(money(v, dec), v); }
  function sPct(v) { return v == null ? '—' : signed(pct(v), v); }
  function depositsHeld(f) { var m = /Security deposits held: \$([\d,]+(?:\.\d+)?)/i.exec(f && f.notes || ''); return m ? Number(m[1].replace(/,/g, '')) : 0; }
  function soldYear(f) { var m = /Sold (\d{4})\b/.exec(f && f.datesNote || ''); return m ? m[1] : ''; }
  function soldCell(f) { return fmtDate(f.saleDate) || ((soldYear(f) ? soldYear(f) + ' ' : '') + '<span class="pill warn">Needs Date</span>'); }
  function fmtDate(d) { if (!d) return ''; var p = d.split('-'); return p.length === 3 ? (+p[1]) + '/' + (+p[2]) + '/' + p[0] : d; }
  function todayISO() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function toast(msg, err) { var t = document.getElementById('toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 3800); }
  function isOwner() { return S.user && S.user.role === 'owner'; }
  function firstName(s) { return String(s || '').trim().split(/\s+/)[0].toLowerCase(); }
  function devKey(email) { return 'fl_dev_' + String(email || '').toLowerCase(); }

  function api(action, body) {
    if (!CFG.API_URL) return Promise.reject(Object.assign(new Error('The Investments service is not connected yet.'), { code: 'NO_API' }));
    body = Object.assign({ action: action, token: S.token }, body || {});
    return fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow', credentials: 'omit', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) {
          if (j.code === 'AUTH' && action !== 'deviceLogin') { signOutLocal(); route(); }
          var e = new Error(j.error || 'Something went wrong.'); e.code = j.code; throw e;
        }
        return j.data;
      });
  }
  function fail(e) { toast(e && e.message || 'Something went wrong.', true); }

  /* ---------- donut ---------- */
  function donut(value, max, center, label, tone, size) {
    size = size || 132; var sw = 10, r = (size - sw) / 2, c = 2 * Math.PI * r;
    var frac = max > 0 ? Math.max(0, Math.min(1, Math.abs(value) / max)) : 0;
    var id = 'g' + Math.random().toString(36).slice(2, 8);
    var stops = tone === 'good' ? ['#1FA855', '#0B6B34'] : tone === 'bad' ? ['#EF0207', '#9A0007'] : ['#EAD59E', '#D5BE87'];
    return '<div class="donut"><svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="' + esc(label + ' ' + center) + '">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + stops[0] + '"/><stop offset="1" stop-color="' + stops[1] + '"/></linearGradient></defs>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="#EEEEF0" stroke-width="' + sw + '"/>' +
      '<circle class="arc" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="url(#' + id + ')" stroke-width="' + sw + '" stroke-linecap="round" ' +
      'stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + c.toFixed(2) + '" data-off="' + (c * (1 - frac)).toFixed(2) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/>' +
      '<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="Inter,Helvetica,Arial,sans-serif" font-weight="700" font-size="' + (size > 120 ? 20 : 16) + '" fill="#000007">' + esc(center) + '</text></svg>' +
      '<div class="dl">' + esc(label) + '</div></div>';
  }
  function multiDonut(parts, center, label, size) {
    size = size || 150; var sw = 10, r = (size - sw) / 2, c = 2 * Math.PI * r, total = parts.reduce(function (s, p) { return s + Math.max(0, p.v); }, 0);
    var off = 0, segs = '';
    parts.forEach(function (p) {
      if (!(p.v > 0) || !total) return;
      var len = c * p.v / total;
      segs += '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + p.color + '" stroke-width="' + sw + '" stroke-dasharray="' + Math.max(0, len - 3).toFixed(2) + ' ' + (c - Math.max(0, len - 3)).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/>';
      off += len;
    });
    return '<div class="donut"><svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '"><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="#EEEEF0" stroke-width="' + sw + '"/>' + segs +
      '<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="Inter,Helvetica,Arial,sans-serif" font-weight="700" font-size="20" fill="#000007">' + esc(center) + '</text></svg><div class="dl">' + esc(label) + '</div></div>';
  }
  function animate() { requestAnimationFrame(function () { requestAnimationFrame(function () { document.querySelectorAll('circle.arc').forEach(function (a) { a.style.strokeDashoffset = a.getAttribute('data-off'); }); }); }); }
  var PALETTE = ['#D5BE87', '#000007', '#0B6B34', '#6B6B70', '#EAD59E', '#9A0007', '#3A3A3F', '#1FA855'];

  /* ---------- auth ---------- */
  function signOutLocal() { S.token = ''; S.user = null; S.flips = null; sessionStorage.removeItem('fl_token'); renderChrome(); }
  function boot() {
    if (S.token) return api('me').then(function (d) { S.user = d.user; }).catch(function () { signOutLocal(); });
    var last = localStorage.getItem('fl_last_email'), dt = last && localStorage.getItem(devKey(last));
    if (last && dt) {
      return api('deviceLogin', { email: last, deviceToken: dt }).then(function (d) { S.token = d.token; S.user = d.user; sessionStorage.setItem('fl_token', d.token); })
        .catch(function (e) { if (e.code === 'AUTH') localStorage.removeItem(devKey(last)); });
    }
    return Promise.resolve();
  }
  function renderLogin() {
    var qs = new URLSearchParams(location.search), pre = qs.get('email') || localStorage.getItem('fl_last_email') || '';
    $app.innerHTML = '<div class="login"><div class="card rule"><h1>Sign In</h1><p class="lead">Enter your email and we’ll send you a one-time code.</p>' +
      (CFG.API_URL ? '' : '<p class="note bad">The Investments service is not connected yet.</p>') +
      '<form id="f1"><div class="field"><label for="em">Email</label><input id="em" type="email" autocomplete="email" required value="' + esc(pre) + '"></div>' +
      '<button class="btn gold" type="submit">Email Me A Code</button></form>' +
      '<form id="f2" hidden><p class="sub2" id="sentto"></p><div class="field"><label for="cd">6-Digit Code</label><input id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></div>' +
      '<label class="check"><input type="checkbox" id="trust" checked> Trust This Device For 30 Days</label><div class="row" style="margin-top:14px"><button class="btn gold" type="submit">Sign In</button><button class="btn" type="button" id="back">Use A Different Email</button></div></form></div></div>';
    var f1 = document.getElementById('f1'), f2 = document.getElementById('f2'), em = document.getElementById('em');
    f1.onsubmit = function (ev) {
      ev.preventDefault(); var email = em.value.trim().toLowerCase(); var b = f1.querySelector('button'); b.disabled = true;
      var dt = localStorage.getItem(devKey(email));
      var p = dt ? api('deviceLogin', { email: email, deviceToken: dt }).then(function (d) { return finishLogin(email, d); }).catch(function () { localStorage.removeItem(devKey(email)); return null; }) : Promise.resolve(null);
      p.then(function (done) {
        if (done) return;
        return api('requestCode', { email: email }).then(function (d) {
          f1.hidden = true; f2.hidden = false; f2.dataset.email = email;
          document.getElementById('sentto').textContent = d.message + ' (' + email + ')'; document.getElementById('cd').focus();
        });
      }).catch(fail).then(function () { b.disabled = false; });
    };
    document.getElementById('back').onclick = function () { f2.hidden = true; f1.hidden = false; };
    f2.onsubmit = function (ev) {
      ev.preventDefault(); var b = f2.querySelector('button[type=submit]'); b.disabled = true;
      api('verifyCode', { email: f2.dataset.email, code: document.getElementById('cd').value, trust: document.getElementById('trust').checked })
        .then(function (d) { finishLogin(f2.dataset.email, d); }).catch(fail).then(function () { b.disabled = false; });
    };
  }
  function finishLogin(email, d) {
    S.token = d.token; S.user = d.user; sessionStorage.setItem('fl_token', d.token);
    localStorage.setItem('fl_last_email', email);
    if (d.deviceToken) localStorage.setItem(devKey(email), d.deviceToken);
    if (location.search) history.replaceState(null, '', location.pathname + location.hash);
    renderChrome(); location.hash = '#/'; route(); return true;
  }
  function logout(forget) {
    var email = S.user && S.user.email, dt = email && localStorage.getItem(devKey(email));
    api('logout', { deviceToken: dt, forget: !!forget }).catch(function () {}).then(function () {
      if (forget && email) localStorage.removeItem(devKey(email));
      signOutLocal(); route();
    });
  }

  /* ---------- chrome / routing ---------- */
  function renderChrome() {
    var tabs = document.getElementById('tabs'), who = document.getElementById('who');
    if (!S.user) { tabs.hidden = true; who.innerHTML = ''; return; }
    var items = [['#/', 'Dashboard'], ['#/flips', 'Flips'], ['#/holdings', 'Holdings'], ['#/calculator', 'Calculator'], ['#/estimates', isOwner() ? 'All Estimates' : 'My Estimates'], ['#/archive', 'Archive'], ['#/resources', 'Resources']];
    if (isOwner()) { items.push(['#/expenses', 'Expenses']); items.push(['#/admin', 'Admin']); }
    tabs.innerHTML = items.map(function (x) { return '<a href="' + x[0] + '" data-h="' + x[0] + '">' + x[1] + '</a>'; }).join('');
    tabs.hidden = false;
    who.innerHTML = '<span><b>' + esc(S.user.name || S.user.email) + '</b>' + (isOwner() ? ' · Owner' : '') + '</span><button class="btn sm" id="lo">Sign Out</button>';
    document.getElementById('lo').onclick = function () { confirmBox('Sign Out', '<p>Also forget this device? You’ll need an emailed code next time.</p>', 'Sign Out And Forget', function () { logout(true); }, 'Just Sign Out', function () { logout(false); }); };
  }
  function markTab(h) { document.querySelectorAll('#tabs a').forEach(function (a) { var on = a.dataset.h === h || (h.indexOf('#/flip/') === 0 && a.dataset.h === '#/flips') || (h.indexOf('#/estimate/') === 0 && a.dataset.h === '#/estimates'); a.classList.toggle('on', on); }); }
  function route() {
    if (!S.user) { renderChrome(); return renderLogin(); }
    var h = location.hash || '#/'; markTab(h.split('?')[0]);
    var m;
    if (h === '#/' || h === '#') return viewDashboard();
    if (h === '#/flips') return viewFlips(false);
    if (h === '#/archive') return viewFlips(true);
    if ((m = h.match(/^#\/flip\/([\w-]+)/))) return viewFlip(m[1]);
    if (h.indexOf('#/calculator') === 0) return viewCalculator(null);
    if (h === '#/estimates') return viewEstimates();
    if ((m = h.match(/^#\/estimate\/([\w-]+)/))) return viewEstimate(m[1]);
    if (h === '#/resources') return viewResources();
    if (h === '#/holdings') return viewHoldings();
    if (h === '#/expenses') return isOwner() ? viewExpenses() : (location.hash = '#/');
    if (h === '#/admin') return isOwner() ? viewAdmin() : (location.hash = '#/');
    location.hash = '#/';
  }
  window.addEventListener('hashchange', route);

  function loadFlips(force) { if (S.flips && !force) return Promise.resolve(S.flips); return api('listFlips').then(function (f) { S.flips = f; return f; }); }
  function loading() { $app.innerHTML = '<div class="loading">Loading…</div>'; }

  /* ---------- modal ---------- */
  function modal(html, onReady) { var m = document.getElementById('modal'); m.innerHTML = '<div class="box">' + html + '</div>'; m.hidden = false; m.onclick = function (e) { if (e.target === m) closeModal(); }; if (onReady) onReady(m); }
  function closeModal() { var m = document.getElementById('modal'); m.hidden = true; m.innerHTML = ''; }
  function confirmBox(title, body, okLabel, onOk, altLabel, onAlt) {
    modal('<h2>' + esc(title) + '</h2>' + body + '<div class="row" style="margin-top:16px"><button class="btn gold" id="ok">' + esc(okLabel) + '</button>' + (altLabel ? '<button class="btn" id="alt">' + esc(altLabel) + '</button>' : '') + '<button class="btn" id="cx">Cancel</button></div>', function () {
      document.getElementById('ok').onclick = function () { closeModal(); onOk(); };
      if (altLabel) document.getElementById('alt').onclick = function () { closeModal(); onAlt(); };
      document.getElementById('cx').onclick = closeModal;
    });
  }

  /* ---------- dashboard ---------- */
  function myStake(f, x) {
    if (isOwner()) return null;
    var me = firstName(S.user.name);
    return x.investors.filter(function (i) { return firstName(i.name) === me; })[0] || null;
  }
  function viewDashboard() {
    loading();
    loadFlips(true).then(function (all) {
      var today = todayISO();
      var flips = all.filter(function (f) { return !isHolding(f); }), holds = all.filter(function (f) { return isHolding(f) && f.status !== 'Sold'; });
      var rows = flips.map(function (f) { return { f: f, x: C.flip(f, today) }; });
      var sold = rows.filter(function (r) { return r.f.status === 'Sold'; }), open = rows.filter(function (r) { return r.f.status !== 'Sold'; });
      var sum = function (a, fn) { return a.reduce(function (s, r) { return s + fn(r); }, 0); };
      var capOpen = sum(open, function (r) { return Number(r.f.cashInvested) || 0; });
      var realized = sum(sold, function (r) { return r.x.profit; }), projected = sum(open, function (r) { return r.x.profit; });
      var capSold = sum(sold, function (r) { return Number(r.f.cashInvested) || 0; });
      var roiSold = capSold ? realized / capSold : null, roiOpen = capOpen ? projected / capOpen : null;
      var stakes = rows.map(function (r) { return myStake(r.f, r.x); }).filter(Boolean);
      var html = '<div class="spread"><div><h1>' + (isOwner() ? 'Portfolio Dashboard' : 'Your Flips') + '</h1><p class="lead">' + flips.length + ' flip' + (flips.length === 1 ? '' : 's') + ' · ' + open.length + ' open · ' + sold.length + ' sold</p></div>' +
        '<div class="row"><a class="btn gold" href="#/calculator">New Estimate</a></div></div>';
      html += '<div class="grid g4">' +
        kpi('Capital In Open Flips', money(capOpen, 0), 'Cash invested, excluding loans') +
        kpi('Projected Profit (Open)', sMoney(projected, 0), 'At today’s projected sale prices', projected < 0 ? 'bad' : 'good') +
        kpi('Realized Profit (Sold)', sMoney(realized, 0), sold.length + ' sold flip' + (sold.length === 1 ? '' : 's'), realized < 0 ? 'bad' : 'good') +
        kpi('Return On Cash (Sold)', sPct(roiSold), 'Profit ÷ cash invested') + '</div>';
      if (stakes.length) {
        var yc = stakes.reduce(function (s, i) { return s + i.capital; }, 0), yp = stakes.reduce(function (s, i) { return s + i.profitShare; }, 0);
        html += '<div class="label">Your Share</div><div class="grid g3">' + kpi('Your Capital In', money(yc, 0), 'Across ' + stakes.length + ' flip' + (stakes.length === 1 ? '' : 's')) +
          kpi('Your Profit Share', sMoney(yp, 0), 'Sold + projected', yp < 0 ? 'bad' : 'good') + kpi('Your Total Payout', money(yc + yp, 0), 'Capital returned first, then your split') + '</div>';
      }
      html += '<div class="label">Investment Circles</div><div class="grid g3">' +
        '<div class="card"><h2>Return On Cash · Sold</h2><p class="meta">Profit ÷ cash invested</p><div style="display:flex;justify-content:center;margin-top:10px">' + donut(roiSold || 0, 1, pct(roiSold, 0), 'Sold Flips', roiSold == null ? 'gold' : (roiSold >= 0 ? 'good' : 'bad')) + '</div></div>' +
        '<div class="card"><h2>Projected Return · Open</h2><p class="meta">Projected profit ÷ cash in</p><div style="display:flex;justify-content:center;margin-top:10px">' + donut(roiOpen || 0, 1, pct(roiOpen, 0), 'Open Flips', roiOpen == null ? 'gold' : (roiOpen >= 0 ? 'good' : 'bad')) + '</div></div>' +
        '<div class="card"><h2>Where The Cash Is</h2><p class="meta">Cash invested by flip</p><div class="row" style="justify-content:center;gap:18px;margin-top:10px">' +
        multiDonut(rows.map(function (r, i) { return { v: Number(r.f.cashInvested) || 0, color: PALETTE[i % PALETTE.length] }; }), '$' + Math.round((capOpen + capSold) / 1000).toLocaleString('en-US') + 'K', 'Total Cash In') +
        '<div class="legend">' + rows.map(function (r, i) { return '<span><i style="background:' + PALETTE[i % PALETTE.length] + '"></i>' + esc(r.f.address) + '</span>'; }).join('') + '</div></div></div></div>';
      html += '<div class="label">Open Flips</div>' + flipCards(open) + '<div class="label">Recently Sold</div>' + flipCards(sold.slice(0, 4));
      if (holds.length) {
        var hx = holds.map(function (f) { return C.holding(f); });
        var hs = function (k) { return hx.reduce(function (t, x) { return t + (x[k] || 0); }, 0); };
        html += '<div class="label">Holdings</div><div class="grid g4">' + kpi('Holdings Value', money(hs('value'), 0), holds.length + ' propert' + (holds.length === 1 ? 'y' : 'ies')) +
          kpi('Equity', sMoney(hs('equity'), 0), 'Value minus loan balances', 'good') + kpi('Monthly Rent', money(hs('rent'), 0), hx.some(function (x) { return x.hasIncome; }) ? sMoney(hs('monthlyCashFlow'), 0) + ' cash flow' : 'Cash flow needs monthly expenses') +
          kpi('Cash In Holdings', money(hs('cashInvested'), 0), 'Purchase cash plus improvements') + '</div>' + holdingCards(holds);
      }
      $app.innerHTML = html; bindCards(); animate();
    }).catch(fail);
  }
  function kpi(k, v, sub, tone) { return '<div class="card kpi' + (tone ? ' ' + tone : '') + '"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="meta">' + esc(sub || '') + '</div></div>'; }
  function flipCards(rows) {
    if (!rows.length) return '<p class="empty">Nothing here yet.</p>';
    return '<div class="grid g2">' + rows.map(function (r) {
      var f = r.f, x = r.x, roi = x.roiCash;
      return '<div class="card flipcard rule" data-id="' + esc(f.id) + '" tabindex="0"><div class="spread"><div><div class="addr">' + esc(f.address) + '</div><div class="meta">' + esc(f.city) + '</div></div>' +
        '<div class="row"><span class="pill s-' + esc(f.status.replace(/\s/g, '')) + '">' + esc(f.status) + '</span>' + (f.myRole === 'admin' ? '<span class="pill admin">Flip Admin</span>' : '') + '</div></div>' +
        '<div class="spread" style="margin-top:10px;align-items:center"><div class="mini" style="flex:1"><div>Purchase<b>' + money(f.purchasePrice, 0) + '</b></div><div>' + (f.status === 'Sold' ? 'Sold For' : 'Projected Sale') + '<b>' + money(f.salePrice, 0) + '</b></div><div>' + (f.status === 'Sold' ? 'Profit' : 'Proj. Profit') + '<b>' + sMoney(x.profit, 0) + '</b></div>' +
        '<div>Rehab Spent<b>' + money(f.rehabSpent, 0) + '</b></div><div>Cash In<b>' + money(f.cashInvested, 0) + '</b></div><div>Days Held<b>' + (x.needsSaleDate ? (soldYear(f) ? 'Sold ' + soldYear(f) + ' ' : '') + '<span class="pill warn">Needs Date</span>' : (x.daysHeld || '—')) + '</b></div></div>' +
        donut(roi || 0, 1, pct(roi, 0), 'Return On Cash', roi == null ? 'gold' : (roi >= 0 ? 'good' : 'bad'), 96) + '</div></div>';
    }).join('') + '</div>';
  }
  function bindCards() { document.querySelectorAll('.flipcard').forEach(function (c) { c.onclick = function () { location.hash = '#/flip/' + c.dataset.id; }; c.onkeydown = function (e) { if (e.key === 'Enter') c.onclick(); }; }); }

  /* ---------- flips list / archive ---------- */
  function viewFlips(archive) {
    loading();
    loadFlips(true).then(function (flips) {
      var today = todayISO();
      var rows = flips.filter(function (f) { return !isHolding(f) && (archive ? f.status === 'Sold' : f.status !== 'Sold'); }).map(function (f) { return { f: f, x: C.flip(f, today) }; });
      var html = '<div class="spread"><div><h1>' + (archive ? 'Archive' : 'Flips') + '</h1><p class="lead">' + (archive ? 'Every sold flip, with final profit and return.' : 'Open flips by status. Sold flips move to the Archive.') + '</p></div>' +
        (isOwner() && !archive ? '<button class="btn gold" id="nf">New Flip</button>' : '') + '</div>';
      if (!archive) {
        STATUSES.filter(function (s) { return s !== 'Sold'; }).forEach(function (s) {
          var g = rows.filter(function (r) { return r.f.status === s; });
          if (g.length) html += '<div class="label">' + esc(s) + '</div>' + flipCards(g);
        });
        if (!rows.length) html += '<p class="empty">No open flips.</p>';
      } else {
        html += rows.length ? '<div class="card tblwrap"><table class="t"><thead><tr><th>Property</th><th>Purchased</th><th>Sold</th><th class="r">Purchase</th><th class="r">Sale</th><th class="r">Profit</th><th class="r">ROI On Cash</th><th class="r">Annualized</th></tr></thead><tbody>' +
          rows.map(function (r) { var f = r.f, x = r.x; return '<tr class="flipcard" data-id="' + esc(f.id) + '"><td><b>' + esc(f.address) + '</b><div class="meta">' + esc(f.city) + '</div></td><td>' + (fmtDate(f.purchaseDate) || '<span class="pill warn">Needs Date</span>') + '</td><td>' + soldCell(f) + '</td><td class="r num">' + money(f.purchasePrice, 0) + '</td><td class="r num">' + money(f.salePrice, 0) + '</td><td class="r num">' + sMoney(x.profit) + '</td><td class="r">' + sPct(x.roiCash) + '</td><td class="r">' + (x.simpleAnnual == null ? '—' : sPct(x.simpleAnnual)) + '</td></tr>'; }).join('') +
          '</tbody></table></div>' : '<p class="empty">No sold flips yet.</p>';
      }
      $app.innerHTML = html; bindCards(); animate();
      var nf = document.getElementById('nf'); if (nf) nf.onclick = function () { editFlip(null); };
    }).catch(fail);
  }

  /* ---------- flip detail ---------- */
  function viewFlip(id) {
    loading();
    api('getFlip', { id: id }).then(function (f) {
      if (isHolding(f)) return renderHolding(f);
      var x = C.flip(f, todayISO()), sold = f.status === 'Sold', can = f.canManage, own = isOwner();
      var ln = function (k, v, cls) { return '<div class="ln' + (cls ? ' ' + cls : '') + '"><span>' + k + '</span><span class="num">' + v + '</span></div>'; };
      var budgetPct = f.rehabBudget ? Math.min(1.5, f.rehabSpent / f.rehabBudget) : 0;
      var html = '<p class="meta"><a href="#/' + (sold ? 'archive' : 'flips') + '">← ' + (sold ? 'Archive' : 'Flips') + '</a></p>' +
        '<div class="spread"><div><h1>' + esc(f.address) + '</h1><p class="lead">' + esc(f.city) + (f.partners ? ' · ' + esc(f.partners) : '') + '</p></div><div class="row">' +
        (can ? '<select id="st" class="btn" aria-label="Status">' + STATUSES.map(function (s) { return '<option' + (s === f.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' : '<span class="pill s-' + esc(f.status.replace(/\s/g, '')) + '">' + esc(f.status) + '</span>') +
        (can ? '<button class="btn" id="ed">Edit Numbers</button>' : '') + (can ? '<button class="btn gold" id="inv">Invite User</button>' : '') + '</div></div>';
      if (f.datesNote) html += '<p class="note' + (/Needs Date/.test(f.datesNote) ? ' bad' : '') + '">' + esc(f.datesNote) + '</p>';
      html += '<div class="grid g4" style="margin-top:18px">' +
        kpi(sold ? 'Profit' : 'Projected Profit', sMoney(x.profit, 0), sold ? 'Sale minus every cost' : 'At a ' + money(f.salePrice, 0) + ' sale', x.profit < 0 ? 'bad' : 'good') +
        kpi('Return On Cash', sPct(x.roiCash), 'On ' + money(f.cashInvested, 0) + ' cash in') +
        kpi('Return On Total Cost', sPct(x.roiCost), 'On ' + money(x.totalCost, 0) + ' all-in') +
        kpi(sold ? 'Annualized (Simple / Compound)' : 'Days Held So Far', sold ? (x.simpleAnnual == null ? '<span class="pill warn">Needs Date</span>' : sPct(x.simpleAnnual) + ' <span class="meta">/ ' + pct(x.compoundAnnual) + '</span>') : (x.daysHeld || '—'),
          sold ? (x.daysHeld ? x.daysHeld + ' days, purchase to sale' : 'Add the sale close date') : 'Since ' + (fmtDate(f.purchaseDate) || 'purchase')) + '</div>';
      html += '<div class="grid g2" style="margin-top:22px"><div class="card rule"><h2>The Numbers</h2><p class="meta">Every dollar from purchase to sale</p><div class="lines">' +
        ln('Purchase Price', money(f.purchasePrice)) + ln('Loan' + (f.lender ? ' · ' + esc(f.lender) : ''), money(f.loanAmount)) +
        ln('Buying Closing Costs', money(f.buyClosingCosts)) + ln('Rehab Spent', money(f.rehabSpent)) + ln('Holding Costs (Interest, Taxes, Insurance)', money(f.holdingCosts)) +
        ln('Selling Costs', money(f.sellingCosts)) + (f.otherCosts ? ln(esc(f.otherCostsLabel || 'Other Costs'), money(f.otherCosts)) : '') +
        (f.adjustments ? ln(esc(f.adjustmentsLabel || 'Credits'), '<span class="pos">' + money(f.adjustments) + '</span>') : '') +
        ln('Total Cost', money(x.totalCost), 'tot') + ln(sold ? 'Sale Price' : 'Projected Sale Price', money(f.salePrice), 'tot') + ln(sold ? 'Profit' : 'Projected Profit', sMoney(x.profit), 'tot') + '</div></div>';
      html += '<div class="card rule"><h2>Rehab Budget Vs Spent</h2><p class="meta">' + money(f.rehabSpent, 0) + ' of ' + money(f.rehabBudget, 0) + '</p><div class="bar" style="margin:10px 0 6px"><i class="' + (budgetPct > 1 ? 'over' : '') + '" style="width:' + Math.min(100, budgetPct * 100).toFixed(1) + '%"></i></div>' +
        '<p class="sub2">' + (x.rehabVariance > 0 ? '<span class="neg">' + money(x.rehabVariance) + '</span> over budget' : x.rehabVariance < 0 ? '<span class="pos">' + money(-x.rehabVariance) + '</span> under budget' : 'On budget') + '</p>' +
        '<hr class="sep"><h2>Investors</h2><p class="meta">Capital returned first, then the profit split</p>' +
        (x.investors.length ? '<table class="t"><thead><tr><th>Investor</th><th class="r">Capital</th><th class="r">Split</th><th class="r">Profit Share</th><th class="r">Payout</th></tr></thead><tbody>' + x.investors.map(function (i) { return '<tr><td>' + esc(i.name) + '</td><td class="r num">' + money(i.capital, 0) + '</td><td class="r">' + pct(i.split, 1) + '</td><td class="r num">' + sMoney(i.profitShare, 0) + '</td><td class="r num"><b>' + money(i.distribution, 0) + '</b></td></tr>'; }).join('') + '</tbody></table>' : '<p class="empty">No investors listed.</p>') +
        '<hr class="sep"><div class="mini"><div>Purchased<b>' + (fmtDate(f.purchaseDate) || '<span class="pill warn">Needs Date</span>') + '</b></div><div>Sold<b>' + (sold ? soldCell(f) : '—') + '</b></div><div>Cash In<b>' + money(f.cashInvested, 0) + '</b></div></div></div></div>';
      if (f.notes) html += '<div class="label">How These Numbers Were Built</div><div class="card"><p style="margin:0;white-space:pre-wrap" class="sub2">' + esc(f.notes) + '</p></div>';
      html += '<div class="label">Inventory Needs List</div><div id="invlist"></div>';
      if (f.access) {
        html += '<div class="label">Who Can See This Flip</div><div class="card tblwrap"><table class="t"><thead><tr><th>User</th><th>Role</th><th>Invited</th><th>Last Sign-In</th><th></th></tr></thead><tbody>' +
          (f.access.length ? f.access.map(function (a) {
            return '<tr><td><b>' + esc(a.name || a.email) + '</b><div class="meta">' + esc(a.email) + '</div></td><td>' + (own ? '<div class="seg" data-u="' + esc(a.userId) + '"><button data-r="member" class="' + (a.role === 'member' ? 'on' : '') + '">Member</button><button data-r="admin" class="' + (a.role === 'admin' ? 'on' : '') + '">Admin</button></div>' : '<span class="pill' + (a.role === 'admin' ? ' admin' : '') + '">' + (a.role === 'admin' ? 'Admin' : 'Member') + '</span>') + '</td>' +
              '<td class="meta">' + (a.invitedAt ? new Date(a.invitedAt).toLocaleDateString() : 'Not emailed') + '</td><td class="meta">' + (a.lastLogin ? new Date(a.lastLogin).toLocaleDateString() : 'Never') + '</td>' +
              '<td class="r"><div class="row" style="justify-content:flex-end"><button class="btn sm" data-resend="' + esc(a.userId) + '">Resend Invite</button>' + (own || a.role !== 'admin' ? '<button class="btn sm danger" data-rm="' + esc(a.userId) + '">Remove</button>' : '') + '</div></td></tr>';
          }).join('') : '<tr><td colspan="5" class="empty">Only you. Use Invite User to add someone.</td></tr>') + '</tbody></table></div>';
      }
      if (f.estimates && f.estimates.length) html += '<div class="label">Estimates Tied To This Flip</div>' + estTable(f.estimates);
      $app.innerHTML = html; animate();
      renderInventory('flip', f.id, f.inventory || [], can);
      var st = document.getElementById('st');
      if (st) st.onchange = function () {
        var s = st.value;
        var go = function (saleDate) { api('setStatus', { id: f.id, status: s, saleDate: saleDate || '' }).then(function () { toast('Status set to ' + s + (s === 'Sold' ? '. Moved to the Archive.' : '.')); S.flips = null; viewFlip(f.id); }).catch(function (e) { fail(e); st.value = f.status; }); };
        if (s === 'Sold') {
          modal('<h2>Mark As Sold</h2><p class="sub2">Sold flips move to the Archive. Add the sale close date so hold time and annualized return can be computed, or leave it blank to flag it as Needs Date.</p><div class="field"><label>Sale Close Date</label><input type="date" id="sd" value="' + esc(f.saleDate || '') + '"></div><div class="row"><button class="btn gold" id="ok">Mark Sold</button><button class="btn" id="cx">Cancel</button></div>', function () {
            document.getElementById('ok').onclick = function () { var v = document.getElementById('sd').value; closeModal(); go(v); };
            document.getElementById('cx').onclick = function () { closeModal(); st.value = f.status; };
          });
        } else go();
      };
      var ed = document.getElementById('ed'); if (ed) ed.onclick = function () { editFlip(f); };
      var inv = document.getElementById('inv'); if (inv) inv.onclick = function () { inviteModal(f); };
      document.querySelectorAll('.seg[data-u]').forEach(function (sg) { sg.querySelectorAll('button').forEach(function (b) { b.onclick = function () { api('setAccessRole', { flipId: f.id, userId: sg.dataset.u, role: b.dataset.r }).then(function () { toast('Role updated.'); viewFlip(f.id); }).catch(fail); }; }); });
      document.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { confirmBox('Remove Access', '<p>This user will no longer see ' + esc(f.address) + '.</p>', 'Remove', function () { api('removeAccess', { flipId: f.id, userId: b.dataset.rm }).then(function () { toast('Access removed.'); viewFlip(f.id); }).catch(fail); }); }; });
      document.querySelectorAll('[data-resend]').forEach(function (b) { b.onclick = function () { b.disabled = true; api('resendInvite', { flipId: f.id, userId: b.dataset.resend }).then(function () { toast('Invite emailed.'); }).catch(fail).then(function () { b.disabled = false; }); }; });
      bindEstRows();
    }).catch(function (e) { $app.innerHTML = '<p class="empty">' + esc(e.message) + '</p>'; });
  }

  function inviteModal(f) {
    modal('<h2>Invite User To ' + esc(f.address) + '</h2><p class="sub2">They’ll get an email invite and sign in with a one-time code. They only see the properties they’re invited to.</p>' +
      '<div class="field"><label>Email</label><input type="email" id="iem" required></div><div class="field"><label>Name (Optional)</label><input id="inm"></div>' +
      (isOwner() ? '<div class="field"><label>Role On This Flip</label><select id="irl"><option value="member">Member — View Only</option><option value="admin">Admin — Status, Numbers, Invites On This Property</option></select></div>' : '') +
      '<div class="row"><button class="btn gold" id="ok">Send Invite</button><button class="btn" id="cx">Cancel</button></div>', function () {
      document.getElementById('cx').onclick = closeModal;
      document.getElementById('ok').onclick = function () {
        var b = this; b.disabled = true; var rl = document.getElementById('irl');
        api('inviteUser', { flipId: f.id, email: document.getElementById('iem').value, name: document.getElementById('inm').value, role: rl ? rl.value : 'member' })
          .then(function () { closeModal(); toast('Invite sent.'); viewFlip(f.id); }).catch(fail).then(function () { b.disabled = false; });
      };
    });
  }

  var FLIP_FIELDS = [['address', 'Property Address', 'text'], ['city', 'City, State Zip', 'text'], ['purchaseDate', 'Purchase Close Date', 'date'], ['saleDate', 'Sale Close Date', 'date'],
    ['purchasePrice', 'Purchase Price', 'num'], ['loanAmount', 'Loan Amount', 'num'], ['lender', 'Lender', 'text'], ['buyClosingCosts', 'Buying Closing Costs (Net Of Credits)', 'num'],
    ['rehabBudget', 'Rehab Budget', 'num'], ['rehabSpent', 'Rehab Spent', 'num'], ['holdingCosts', 'Holding Costs', 'num'], ['sellingCosts', 'Selling Costs', 'num'],
    ['otherCosts', 'Other Costs', 'num'], ['otherCostsLabel', 'Other Costs Label', 'text'], ['adjustments', 'Credits (Reduce Cost)', 'num'], ['adjustmentsLabel', 'Credits Label', 'text'],
    ['salePrice', 'Sale Price (Or Projected)', 'num'], ['cashInvested', 'Cash Invested', 'num'], ['partners', 'Partners', 'text'], ['datesNote', 'Dates Note', 'text']];
  var HOLD_FIELDS = [['address', 'Property Address', 'text'], ['city', 'City, State Zip', 'text'], ['purchaseDate', 'Purchase Close Date', 'date'], ['saleDate', 'Sale Close Date (If Sold)', 'date'],
    ['purchasePrice', 'Purchase Price', 'num'], ['buyClosingCosts', 'Closing Costs', 'num'], ['loanAmount', 'Original Loan', 'num'], ['lender', 'Lender', 'text'], ['loanBalance', 'Current Loan Balance', 'num'],
    ['rehabBudget', 'Improvements Budget', 'num'], ['rehabSpent', 'Improvements Spent', 'num'], ['cashInvested', 'Cash Invested', 'num'], ['currentValue', 'Current Value', 'num'],
    ['monthlyIncome', 'Monthly Income (Rent)', 'num'], ['monthlyExpenses', 'Monthly Expenses (Mortgage, Tax, Insurance, HOA, Utilities)', 'num'], ['salePrice', 'Sale Price (If Sold)', 'num'],
    ['partners', 'Partners', 'text'], ['datesNote', 'Dates Note', 'text']];
  function editFlip(f, kind) {
    var isNew = !f; f = f || { investors: [], kind: kind || 'flip' };
    var hold = isHolding(f), FIELDS = hold ? HOLD_FIELDS : FLIP_FIELDS, SL = statusesOf(f);
    var inv = (f.investors || []).map(function (i) { return i.name + ' | ' + i.capital + ' | ' + (Math.round(i.split * 10000) / 100); }).join('\n');
    modal('<h2>' + (isNew ? (hold ? 'New Holding' : 'New Flip') : 'Edit ' + esc(f.address)) + '</h2><div class="calcgrid">' + FIELDS.map(function (x) {
      return '<div class="field"><label>' + x[1] + '</label><input data-k="' + x[0] + '" type="' + (x[2] === 'date' ? 'date' : 'text') + '" ' + (x[2] === 'num' ? 'inputmode="decimal"' : '') + ' value="' + esc(f[x[0]] == null ? '' : f[x[0]]) + '"></div>';
    }).join('') + '</div>' + (isNew ? '<div class="field"><label>Status</label><select id="nst">' + SL.map(function (s) { return '<option' + (s === (hold ? 'Owned' : 'Active') ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' : '') +
      '<div class="field"><label>Investors (One Per Line: Name | Capital | Split %)</label><textarea id="invs" rows="3">' + esc(inv) + '</textarea></div>' +
      '<div class="field"><label>Notes</label><textarea data-k="notes" rows="3">' + esc(f.notes || '') + '</textarea></div><div class="row"><button class="btn gold" id="ok">Save</button><button class="btn" id="cx">Cancel</button></div>', function () {
      document.getElementById('cx').onclick = closeModal;
      document.getElementById('ok').onclick = function () {
        var body = {}; document.querySelectorAll('#modal [data-k]').forEach(function (el) { body[el.dataset.k] = el.value; });
        body.investors = document.getElementById('invs').value.split('\n').map(function (l) { var p = l.split('|').map(function (s) { return s.trim(); }); return p[0] ? { name: p[0], capital: C.n(p[1]), split: C.n(p[2]) / 100 } : null; }).filter(Boolean);
        var nst = document.getElementById('nst'); if (nst) body.status = nst.value;
        if (isNew) body.kind = hold ? 'holding' : 'flip';
        var p = isNew ? api('createFlip', { flip: body }) : api('updateFlip', { id: f.id, flip: body });
        p.then(function (r) { closeModal(); S.flips = null; toast('Saved.'); location.hash = '#/flip/' + r.id; if (!isNew) viewFlip(r.id); }).catch(fail);
      };
    });
  }

  /* ---------- inventory ---------- */
  function renderInventory(type, pid, items, can) {
    var box = document.getElementById('invlist'); if (!box) return;
    var total = items.reduce(function (s, i) { return s + i.quantity * i.unitPrice; }, 0);
    box.innerHTML = '<div class="card">' + (items.length ? '<div class="tblwrap"><table class="t"><thead><tr><th>Material</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Total</th><th>Item #</th><th>Notes</th>' + (can ? '<th></th>' : '') + '</tr></thead><tbody>' +
      items.map(function (i) { return '<tr><td>' + (i.link ? '<a href="' + esc(i.link) + '" target="_blank" rel="noopener">' + esc(i.material) + '</a>' : esc(i.material)) + '</td><td class="r num">' + i.quantity + '</td><td class="r num">' + money(i.unitPrice) + '</td><td class="r num">' + money(i.quantity * i.unitPrice) + '</td><td class="meta">' + esc(i.sku) + '</td><td class="meta">' + esc([i.status, i.notes].filter(Boolean).join(' · ')) + '</td>' +
        (can ? '<td class="r"><button class="btn sm" data-ie="' + esc(i.id) + '">Edit</button> <button class="btn sm danger" data-id2="' + esc(i.id) + '">Delete</button></td>' : '') + '</tr>'; }).join('') +
      '</tbody></table></div><p class="sub2" style="margin:10px 0 0">Total <b class="num">' + money(total) + '</b></p>' : '<p class="empty">No items yet.</p>') +
      (can ? '<div class="row" style="margin-top:12px"><button class="btn gold" id="addinv">Add Inventory Needs List Item</button></div>' : '') + '</div>';
    var edit = function (item) {
      item = item || {};
      modal('<h2>' + (item.id ? 'Edit Item' : 'Add Inventory Needs List Item') + '</h2><div class="calcgrid">' +
        [['material', 'Material'], ['quantity', 'Quantity'], ['unitPrice', 'Price Per Unit'], ['sku', 'Item / Internet #'], ['link', 'Link (https://…)'], ['status', 'Status (e.g. Purchased)']].map(function (x) { return '<div class="field"><label>' + x[1] + '</label><input data-k="' + x[0] + '" value="' + esc(item[x[0]] == null ? '' : item[x[0]]) + '"></div>'; }).join('') +
        '</div><div class="field"><label>Notes</label><input data-k="notes" value="' + esc(item.notes || '') + '"></div><div class="row"><button class="btn gold" id="ok">Save</button><button class="btn" id="cx">Cancel</button></div>', function () {
        document.getElementById('cx').onclick = closeModal;
        document.getElementById('ok').onclick = function () {
          var b = { id: item.id || '', parentType: type, parentId: pid }; document.querySelectorAll('#modal [data-k]').forEach(function (el) { b[el.dataset.k] = el.value; });
          api('saveInventory', { item: b }).then(function () { closeModal(); return api('listInventory', { parentType: type, parentId: pid }); }).then(function (list) { renderInventory(type, pid, list, can); toast('Saved.'); }).catch(fail);
        };
      });
    };
    var add = document.getElementById('addinv'); if (add) add.onclick = function () { edit(null); };
    box.querySelectorAll('[data-ie]').forEach(function (b) { b.onclick = function () { edit(items.filter(function (i) { return i.id === b.dataset.ie; })[0]); }; });
    box.querySelectorAll('[data-id2]').forEach(function (b) { b.onclick = function () { api('deleteInventory', { id: b.dataset.id2 }).then(function () { return api('listInventory', { parentType: type, parentId: pid }); }).then(function (list) { renderInventory(type, pid, list, can); }).catch(fail); }; });
  }

  /* ---------- calculator ---------- */
  var CALC_FIELDS = [
    ['Property', [['name', 'Estimate Name', 'text'], ['address', 'Property Address', 'text']]],
    ['Purchase', [['purchasePrice', 'Purchase Price ($)'], ['loanAmount', 'Loan Amount ($)'], ['interestRate', 'Interest Rate (%/yr)'], ['pointsPct', 'Points (%)'], ['originationFee', 'Origination / Lender Fees ($)'], ['lender', 'Lender', 'text'], ['fundingDate', 'Loan Funded Date', 'date'], ['payoffDate', 'Payoff / Sale Date', 'date'], ['daysHeld', 'Or Days Held']]],
    ['Buying Closing Costs', [['buyClosing', 'Escrow / Title / Recording / Misc ($)'], ['insurancePrepaid', 'Prepaid Insurance ($)'], ['taxProration', 'Tax Proration ($)'], ['taxIsCredit', 'Tax Proration Is A Credit', 'bool'], ['hoaAtPurchase', 'HOA At Purchase ($)'], ['purchaseRefund', 'Escrow Refund After Close ($)']]],
    ['Rehab', [['rehabBudget', 'Rehab Budget ($)'], ['contingencyPct', 'Contingency (%)']]],
    ['Holding', [['propertyTaxes', 'Property Taxes ($)'], ['insuranceHold', 'Insurance During Hold ($)'], ['utilities', 'Utilities ($)'], ['hoaHold', 'HOA During Hold ($)'], ['otherHold', 'Other Holding ($)'], ['interestOutOfPocket', 'Interest Paid Monthly Out Of Pocket', 'bool']]],
    ['Selling', [['salePrice', 'Sale Price / ARV ($)'], ['listingPct', 'Listing Commission (%)'], ['buyerPct', 'Buyer Commission (%)'], ['sellEscrow', 'Escrow / Title / Transfer Tax ($)'], ['buyerCredits', 'Buyer Credits ($)'], ['homeWarranty', 'Home Warranty ($)'], ['miscSelling', 'Marketing / Misc ($)']]]
  ];
  var CALC_DEFAULTS = { interestRate: 8, pointsPct: 0, taxIsCredit: true, contingencyPct: 10, listingPct: 0, buyerPct: 2 };
  function viewCalculator(est) {
    var inputs = Object.assign({}, CALC_DEFAULTS, est ? est.inputs : {});
    if (est) { inputs.name = est.name; inputs.address = est.address; }
    var html = '<div class="spread"><div><h1>' + (est ? 'Estimate: ' + esc(est.name || est.address) : 'Flip Calculator') + '</h1><p class="lead">' + (est ? 'Saved ' + new Date(est.createdAt).toLocaleDateString() + ' · Auto-deletes ' + new Date(est.expiresAt).toLocaleDateString() + ' (90 days)' + (est.owner && !est.mine ? ' · Created by ' + esc(est.owner.name || est.owner.email) : '') : 'Estimates you save are kept for 90 days, then deleted automatically.') + '</p></div>' +
      (est ? '<a class="btn" href="#/estimates">← Estimates</a>' : '') + '</div><div class="grid g2" style="align-items:start"><div class="card rule"><form id="cf">';
    CALC_FIELDS.forEach(function (sec) {
      html += '<div class="label" style="margin-top:6px">' + sec[0] + '</div><div class="calcgrid">' + sec[1].map(function (x) {
        var k = x[0], v = inputs[k] == null ? '' : inputs[k];
        if (x[2] === 'bool') return '<label class="check" style="margin-bottom:12px"><input type="checkbox" data-k="' + k + '"' + (v === true || v === 'true' ? ' checked' : '') + '> ' + x[1] + '</label>';
        return '<div class="field"><label>' + x[1] + '</label><input data-k="' + k + '" type="' + (x[2] === 'date' ? 'date' : 'text') + '"' + (x[2] ? '' : ' inputmode="decimal"') + ' value="' + esc(v) + '"></div>';
      }).join('') + '</div>';
    });
    html += '<div class="field"><label>Tie To A Flip (Optional)</label><select data-k="flipId" id="cflip"><option value="">None</option></select></div></form></div><div><div class="card rule" id="cres"></div><div class="row" style="margin-top:16px">' +
      '<button class="btn gold" id="save">' + (est ? 'Save Changes' : 'Save Estimate') + '</button>' +
      (est ? '<button class="btn" id="addi">Add Inventory Needs List</button>' : '') +
      (est && isOwner() && !est.convertedFlipId ? '<button class="btn dark" id="conv">Turn Into Active Flip</button>' : '') +
      (est && est.convertedFlipId ? '<a class="btn" href="#/flip/' + esc(est.convertedFlipId) + '">Open Flip</a>' : '') +
      (est ? '<button class="btn danger" id="del">Delete</button>' : '') + '</div>' +
      (est && !isOwner() ? '<p class="meta" style="margin-top:10px">Only the owner can turn an estimate into an active flip.</p>' : '') + '</div></div>' +
      (est ? '<div class="label">Inventory Needs List</div><div id="invlist"></div>' : '');
    $app.innerHTML = html;
    loadFlips().then(function (fl) { var sel = document.getElementById('cflip'); if (!sel) return; sel.innerHTML += fl.map(function (f) { return '<option value="' + esc(f.id) + '"' + (est && est.flipId === f.id ? ' selected' : '') + '>' + esc(f.address) + '</option>'; }).join(''); }).catch(function () {});
    var read = function () { var o = {}; document.querySelectorAll('#cf [data-k]').forEach(function (el) { o[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; }); return o; };
    var paint = function () {
      var i = read(), r = C.estimate(i), ln = function (k, v, cls) { return '<div class="ln' + (cls ? ' ' + cls : '') + '"><span>' + k + '</span><span class="num">' + v + '</span></div>'; };
      var tone = r.rating === 'green' ? 'good' : r.rating === 'red' ? 'bad' : 'gold';
      document.getElementById('cres').innerHTML = '<h2>Results</h2><p class="meta">' + (r.daysHeld ? r.daysHeld + ' days held · interest by actual days / 365' : 'Add dates or days held to compute interest and annualized return') + '</p>' +
        '<div class="row" style="justify-content:space-around;margin:12px 0">' + donut(r.roiCash || 0, 1, pct(r.roiCash, 0), 'Return On Cash', tone, 120) + donut(r.simpleAnnual || 0, 1, r.simpleAnnual == null ? '—' : pct(r.simpleAnnual, 0), 'Annualized (Simple)', tone, 120) + '</div>' +
        '<div class="lines">' + ln('Loan / LTV', money(r.loanAmount, 0) + ' · ' + pct(r.ltv)) + ln('Cash To Close', money(r.cashToClose)) + ln('Buying Costs (Net)', money(r.buyingCosts)) + ln('Rehab (With Contingency)', money(r.rehabUsed)) +
        ln('Loan Interest', money(r.interest)) + ln('Holding Costs', money(r.holdingCosts)) + ln('Selling Costs', money(r.sellingCosts)) + ln('Total Cost', money(r.totalCost), 'tot') +
        ln('Profit', sMoney(r.profit), 'tot') + ln('Cash Invested', money(r.cashInvested)) + ln('Return On Cash', sPct(r.roiCash)) + ln('Return On Total Cost', sPct(r.roiCost)) +
        ln('Annualized Simple / Compound', r.simpleAnnual == null ? '—' : sPct(r.simpleAnnual) + ' / ' + sPct(r.compoundAnnual)) + ln('Max Offer (80% Of ARV − Rehab)', money(r.maxOffer, 0)) + '</div>' +
        (r.over80 ? '<p class="note bad" style="margin-top:12px">Purchase price is over 80% of the sale price.</p>' : '');
      animate(); return { i: i, r: r };
    };
    document.getElementById('cf').addEventListener('input', paint); document.getElementById('cf').addEventListener('change', paint); paint();
    document.getElementById('save').onclick = function () {
      var b = this, x = paint(), i = x.i; b.disabled = true;
      var inputs2 = Object.assign({}, i); delete inputs2.name; delete inputs2.address; delete inputs2.flipId;
      api('saveEstimate', { estimate: { id: est ? est.id : '', name: i.name, address: i.address, flipId: i.flipId, inputs: inputs2, results: x.r } })
        .then(function (e) { toast('Estimate saved. It auto-deletes ' + new Date(e.expiresAt).toLocaleDateString() + '.'); location.hash = '#/estimate/' + e.id; if (est) viewEstimate(e.id); }).catch(fail).then(function () { b.disabled = false; });
    };
    if (est) {
      renderInventory('estimate', est.id, est.inventory || [], true);
      document.getElementById('addi').onclick = function () { var a = document.getElementById('addinv'); if (a) { a.scrollIntoView({ behavior: 'smooth' }); a.click(); } };
      document.getElementById('del').onclick = function () { confirmBox('Delete Estimate', '<p>This deletes the estimate and its inventory needs list.</p>', 'Delete', function () { api('deleteEstimate', { id: est.id }).then(function () { toast('Deleted.'); location.hash = '#/estimates'; }).catch(fail); }); };
      var cv = document.getElementById('conv');
      if (cv) cv.onclick = function () { confirmBox('Turn Into Active Flip', '<p>This creates a new Active flip from this estimate (with its inventory needs list). The person who made the estimate is added as a Member.</p>', 'Create Flip', function () { api('convertEstimate', { id: est.id }).then(function (f) { S.flips = null; toast('Flip created.'); location.hash = '#/flip/' + f.id; }).catch(fail); }); };
    }
  }
  function viewEstimate(id) { loading(); api('getEstimate', { id: id }).then(viewCalculator).catch(function (e) { $app.innerHTML = '<p class="empty">' + esc(e.message) + '</p>'; }); }
  function estTable(list) {
    return '<div class="card tblwrap"><table class="t"><thead><tr><th>Estimate</th>' + (isOwner() || list.some(function (e) { return !e.mine; }) ? '<th>Created By</th>' : '') + '<th class="r">Purchase</th><th class="r">Sale / ARV</th><th class="r">Profit</th><th class="r">ROI On Cash</th><th>Expires</th><th></th></tr></thead><tbody>' +
      list.map(function (e) {
        var r = e.results || {};
        return '<tr class="estrow" data-id="' + esc(e.id) + '" style="cursor:pointer"><td><b>' + esc(e.name || e.address || 'Untitled') + '</b><div class="meta">' + esc(e.address) + '</div></td>' + (isOwner() || list.some(function (x) { return !x.mine; }) ? '<td>' + esc(e.owner.name || e.owner.email) + (e.mine ? ' <span class="meta">(You)</span>' : '') + '<div class="meta">' + esc(e.owner.email) + '</div></td>' : '') +
          '<td class="r num">' + money(e.inputs.purchasePrice, 0) + '</td><td class="r num">' + money(e.inputs.salePrice, 0) + '</td><td class="r num">' + sMoney(r.profit || 0, 0) + '</td><td class="r">' + sPct(r.roiCash) + '</td><td class="meta">' + new Date(e.expiresAt).toLocaleDateString() + '</td><td>' + (e.convertedFlipId ? '<span class="pill s-Active">Flip</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function bindEstRows() { document.querySelectorAll('.estrow').forEach(function (r) { r.onclick = function () { location.hash = '#/estimate/' + r.dataset.id; }; }); }
  function viewEstimates() {
    loading();
    api('listEstimates').then(function (list) {
      $app.innerHTML = '<div class="spread"><div><h1>' + (isOwner() ? 'All Estimates' : 'My Estimates') + '</h1><p class="lead">' + (isOwner() ? 'Every estimate from every user, with who created it.' : 'Only you can see your estimates.') + ' Estimates auto-delete 90 days after they’re saved.</p></div><a class="btn gold" href="#/calculator">New Estimate</a></div>' +
        (list.length ? estTable(list) : '<p class="empty">No saved estimates.</p>');
      bindEstRows();
    }).catch(fail);
  }

  /* ---------- resources ---------- */
  function viewResources() {
    loading();
    api('listResources').then(function (list) {
      var groups = [['contractor', 'Contractors & Handymen'], ['lender', 'Hard Money Lenders'], ['supplier', 'Suppliers']];
      var html = '<div class="spread"><div><h1>Resources</h1><p class="lead">Contractors, hard money lenders and suppliers we’ve used.</p></div>' + (isOwner() ? '<button class="btn gold" id="addr">Add Resource</button>' : '') + '</div>';
      groups.forEach(function (g) {
        var items = list.filter(function (r) { return r.type === g[0]; });
        html += '<div class="label">' + g[1] + '</div>' + (items.length ? '<div class="card tblwrap"><table class="t"><thead><tr><th>Name</th><th>Phone</th><th>' + (g[0] === 'lender' ? 'Email' : 'Company') + '</th><th>' + (g[0] === 'supplier' ? 'Address' : 'Licensed') + '</th><th>Details</th>' + (isOwner() ? '<th></th>' : '') + '</tr></thead><tbody>' +
          items.map(function (r) { return '<tr><td><b>' + esc(r.name) + '</b>' + (r.kind ? '<div class="meta">' + esc(r.kind) + '</div>' : '') + '</td><td><a href="tel:' + esc(String(r.phone).split('/')[0].replace(/[^\d+]/g, '')) + '">' + esc(r.phone) + '</a></td><td>' + (g[0] === 'lender' ? (r.email ? '<a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>' : '') : esc(r.company)) + '</td><td class="meta">' + esc(g[0] === 'supplier' ? r.address : r.license) + '</td><td class="sub2">' + esc(r.details) + '</td>' +
            (isOwner() ? '<td class="r"><button class="btn sm" data-re="' + esc(r.id) + '">Edit</button></td>' : '') + '</tr>'; }).join('') + '</tbody></table></div>' : '<p class="empty">None yet.</p>');
      });
      $app.innerHTML = html;
      var edit = function (r) {
        r = r || { type: 'contractor' };
        modal('<h2>' + (r.id ? 'Edit Resource' : 'Add Resource') + '</h2><div class="field"><label>Type</label><select data-k="type">' + groups.map(function (g) { return '<option value="' + g[0] + '"' + (r.type === g[0] ? ' selected' : '') + '>' + g[1] + '</option>'; }).join('') + '</select></div><div class="calcgrid">' +
          [['name', 'Name'], ['phone', 'Phone'], ['email', 'Email'], ['company', 'Company'], ['license', 'License'], ['kind', 'Contractor / Handyman'], ['address', 'Address']].map(function (x) { return '<div class="field"><label>' + x[1] + '</label><input data-k="' + x[0] + '" value="' + esc(r[x[0]] || '') + '"></div>'; }).join('') +
          '</div><div class="field"><label>Details</label><textarea data-k="details" rows="2">' + esc(r.details || '') + '</textarea></div><div class="row"><button class="btn gold" id="ok">Save</button>' + (r.id ? '<button class="btn danger" id="dl">Delete</button>' : '') + '<button class="btn" id="cx">Cancel</button></div>', function () {
          document.getElementById('cx').onclick = closeModal;
          document.getElementById('ok').onclick = function () { var b = { id: r.id || '' }; document.querySelectorAll('#modal [data-k]').forEach(function (el) { b[el.dataset.k] = el.value; }); api('saveResource', { resource: b }).then(function () { closeModal(); viewResources(); }).catch(fail); };
          var dl = document.getElementById('dl'); if (dl) dl.onclick = function () { api('deleteResource', { id: r.id }).then(function () { closeModal(); viewResources(); }).catch(fail); };
        });
      };
      var ad = document.getElementById('addr'); if (ad) ad.onclick = function () { edit(null); };
      document.querySelectorAll('[data-re]').forEach(function (b) { b.onclick = function () { edit(list.filter(function (r) { return r.id === b.dataset.re; })[0]); }; });
    }).catch(fail);
  }

  /* ---------- holdings ---------- */
  function holdingCards(list) {
    if (!list.length) return '<p class="empty">No holdings yet.</p>';
    return '<div class="grid g2">' + list.map(function (f) {
      var x = C.holding(f);
      return '<div class="card flipcard rule" data-id="' + esc(f.id) + '" tabindex="0"><div class="spread"><div><div class="addr">' + esc(f.address) + '</div><div class="meta">' + esc(f.city) + '</div></div>' +
        '<div class="row"><span class="pill">' + esc(f.status) + '</span>' + (f.myRole === 'admin' ? '<span class="pill admin">Property Admin</span>' : '') + '</div></div>' +
        '<div class="spread" style="margin-top:10px;align-items:center"><div class="mini" style="flex:1"><div>Value<b>' + (x.value ? money(x.value, 0) : '<span class="pill warn">Needs Value</span>') + '</b></div><div>Equity<b>' + sMoney(x.equity, 0) + '</b></div>' +
        '<div>Rent / Mo<b>' + (x.rent ? money(x.rent, 0) : '<span class="pill warn">Needs Data</span>') + '</b></div><div>Cash Flow / Mo<b>' + (x.hasIncome ? sMoney(x.monthlyCashFlow, 0) : '<span class="pill warn">Needs Data</span>') + '</b></div><div>Cash In<b>' + money(x.cashInvested, 0) + '</b></div><div>Loan Balance<b>' + money(x.loanBalance, 0) + '</b></div><div>Purchased<b>' + (fmtDate(f.purchaseDate) || '<span class="pill warn">Needs Date</span>') + '</b></div></div>' +
        donut(x.totalRoi || 0, 1, pct(x.totalRoi, 0), 'Total Return', x.totalRoi == null ? 'gold' : (x.totalRoi >= 0 ? 'good' : 'bad'), 96) + '</div></div>';
    }).join('') + '</div>';
  }
  function viewHoldings() {
    loading();
    loadFlips(true).then(function (all) {
      var list = all.filter(isHolding), open = list.filter(function (f) { return f.status !== 'Sold'; }), sold = list.filter(function (f) { return f.status === 'Sold'; });
      var html = '<div class="spread"><div><h1>Holdings</h1><p class="lead">Properties LANA HOMES keeps: value, equity, cash flow and return.</p></div>' + (isOwner() ? '<button class="btn gold" id="nh">New Holding</button>' : '') + '</div>';
      html += holdingCards(open) + (sold.length ? '<div class="label">Sold Holdings</div>' + holdingCards(sold) : '');
      $app.innerHTML = html; bindCards(); animate();
      var nh = document.getElementById('nh'); if (nh) nh.onclick = function () { editFlip(null, 'holding'); };
    }).catch(fail);
  }
  function accessBlock(f, noun) {
    if (!f.access) return '';
    var own = isOwner();
    return '<div class="label">Who Can See This ' + noun + '</div><div class="card tblwrap"><table class="t"><thead><tr><th>User</th><th>Role</th><th>Invited</th><th>Last Sign-In</th><th></th></tr></thead><tbody>' +
      (f.access.length ? f.access.map(function (a) {
        return '<tr><td><b>' + esc(a.name || a.email) + '</b><div class="meta">' + esc(a.email) + '</div></td><td>' + (own ? '<div class="seg" data-u="' + esc(a.userId) + '"><button data-r="member" class="' + (a.role === 'member' ? 'on' : '') + '">Member</button><button data-r="admin" class="' + (a.role === 'admin' ? 'on' : '') + '">Admin</button></div>' : '<span class="pill' + (a.role === 'admin' ? ' admin' : '') + '">' + (a.role === 'admin' ? 'Admin' : 'Member') + '</span>') + '</td>' +
          '<td class="meta">' + (a.invitedAt ? new Date(a.invitedAt).toLocaleDateString() : 'Not emailed') + '</td><td class="meta">' + (a.lastLogin ? new Date(a.lastLogin).toLocaleDateString() : 'Never') + '</td>' +
          '<td class="r"><div class="row" style="justify-content:flex-end"><button class="btn sm" data-resend="' + esc(a.userId) + '">Resend Invite</button>' + (own || a.role !== 'admin' ? '<button class="btn sm danger" data-rm="' + esc(a.userId) + '">Remove</button>' : '') + '</div></td></tr>';
      }).join('') : '<tr><td colspan="5" class="empty">Only you. Use Invite User to add someone.</td></tr>') + '</tbody></table></div>';
  }
  function bindAccess(f) {
    document.querySelectorAll('.seg[data-u]').forEach(function (sg) { sg.querySelectorAll('button').forEach(function (b) { b.onclick = function () { api('setAccessRole', { flipId: f.id, userId: sg.dataset.u, role: b.dataset.r }).then(function () { toast('Role updated.'); viewFlip(f.id); }).catch(fail); }; }); });
    document.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { confirmBox('Remove Access', '<p>This user will no longer see ' + esc(f.address) + '.</p>', 'Remove', function () { api('removeAccess', { flipId: f.id, userId: b.dataset.rm }).then(function () { toast('Access removed.'); viewFlip(f.id); }).catch(fail); }); }; });
    document.querySelectorAll('[data-resend]').forEach(function (b) { b.onclick = function () { b.disabled = true; api('resendInvite', { flipId: f.id, userId: b.dataset.resend }).then(function () { toast('Invite emailed.'); }).catch(fail).then(function () { b.disabled = false; }); }; });
  }
  function renderHolding(f) {
    markTab('#/holdings');
    var x = C.holding(f), can = f.canManage;
    var ln = function (k, v, cls) { return '<div class="ln' + (cls ? ' ' + cls : '') + '"><span>' + k + '</span><span class="num">' + v + '</span></div>'; };
    var html = '<p class="meta"><a href="#/holdings">← Holdings</a></p><div class="spread"><div><h1>' + esc(f.address) + '</h1><p class="lead">' + esc(f.city) + (f.partners ? ' · ' + esc(f.partners) : '') + '</p></div><div class="row">' +
      (can ? '<select id="st" class="btn" aria-label="Status">' + HSTATUSES.map(function (s) { return '<option' + (s === f.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' : '<span class="pill">' + esc(f.status) + '</span>') +
      (can ? '<button class="btn" id="ed">Edit Numbers</button><button class="btn gold" id="inv">Invite User</button>' : '') + '</div></div>';
    if (f.datesNote) html += '<p class="note' + (/Needs Date/.test(f.datesNote) ? ' bad' : '') + '">' + esc(f.datesNote) + '</p>';
    html += '<div class="grid g4" style="margin-top:18px">' +
      kpi('Equity', sMoney(x.equity, 0), (x.value ? money(x.value, 0) + ' value' : 'Needs value') + ' − ' + money(x.loanBalance, 0) + ' loan', x.equity < 0 ? 'bad' : 'good') +
      kpi('Monthly Cash Flow', x.hasIncome ? sMoney(x.monthlyCashFlow, 0) : '<span class="pill warn">Needs Data</span>', x.hasIncome ? sMoney(x.annualCashFlow, 0) + ' a year' : (x.rent ? money(x.rent, 0) + ' rent; add monthly expenses' : 'Add rent and monthly expenses')) +
      kpi('Cash-On-Cash', x.hasIncome ? sPct(x.cashOnCash) : '—', 'Annual cash flow ÷ cash in') +
      kpi('Total Return', sPct(x.totalRoi), '(Equity − cash in + cash flow to date) ÷ cash in') + '</div>';
    html += '<div class="grid g2" style="margin-top:22px"><div class="card rule"><h2>The Numbers</h2><p class="meta">Purchase, financing and what it earns</p><div class="lines">' +
      ln('Purchase Price', money(f.purchasePrice)) + ln('Closing Costs', money(f.buyClosingCosts)) + ln('Improvements Spent', money(f.rehabSpent)) + ln('All-In Cost', money(x.allIn), 'tot') +
      ln('Original Loan' + (f.lender ? ' · ' + esc(f.lender) : ''), money(f.loanAmount)) + ln('Current Loan Balance', money(x.loanBalance)) + ln('Cash Invested', money(x.cashInvested), 'tot') +
      ln('Current Value', x.value ? money(x.value) : '<span class="pill warn">Needs Value</span>') + ln('Equity', sMoney(x.equity), 'tot') +
      ln('Monthly Rent', x.rent ? money(x.rent) : '<span class="pill warn">Needs Data</span>') + ln('Monthly Expenses', x.expenses ? money(x.expenses) : '<span class="pill warn">Needs Data</span>') + ln('Monthly Cash Flow', x.hasIncome ? sMoney(x.monthlyCashFlow) : '<span class="pill warn">Needs Data</span>', 'tot') + (depositsHeld(f) ? ln('Security Deposits Held (Owed To Tenants)', money(depositsHeld(f))) : '') + '</div></div>' +
      '<div class="card rule"><h2>Return</h2><p class="meta">Equity gain plus cash flow on the cash you put in</p><div style="display:flex;justify-content:center;gap:18px;margin-top:10px">' +
      donut(x.equityRoi || 0, 1, pct(x.equityRoi, 0), 'Equity Gain', x.equityRoi == null ? 'gold' : (x.equityRoi >= 0 ? 'good' : 'bad')) + donut(x.cashOnCash || 0, 0.2, x.hasIncome ? pct(x.cashOnCash, 1) : '—', 'Cash-On-Cash', 'gold') + '</div>' +
      '<hr class="sep"><div class="mini"><div>Purchased<b>' + (fmtDate(f.purchaseDate) || '<span class="pill warn">Needs Date</span>') + '</b></div><div>Months Held<b>' + (x.monthsHeld == null ? '—' : x.monthsHeld) + '</b></div><div>Value Vs All-In<b>' + sMoney(x.value ? x.value - x.allIn : 0, 0) + '</b></div></div></div></div>';
    if (f.notes) html += '<div class="label">How These Numbers Were Built</div><div class="card"><p style="margin:0;white-space:pre-wrap" class="sub2">' + esc(f.notes) + '</p></div>';
    html += '<div class="label">Inventory Needs List</div><div id="invlist"></div>' + accessBlock(f, 'Holding');
    if (f.estimates && f.estimates.length) html += '<div class="label">Estimates Tied To This Holding</div>' + estTable(f.estimates);
    $app.innerHTML = html; animate();
    renderInventory('flip', f.id, f.inventory || [], can);
    var st = document.getElementById('st');
    if (st) st.onchange = function () { api('setStatus', { id: f.id, status: st.value }).then(function () { toast('Status set to ' + st.value + '.'); S.flips = null; viewFlip(f.id); }).catch(function (e) { fail(e); st.value = f.status; }); };
    var ed = document.getElementById('ed'); if (ed) ed.onclick = function () { editFlip(f); };
    var inv = document.getElementById('inv'); if (inv) inv.onclick = function () { inviteModal(f); };
    bindAccess(f); if (typeof bindEstRows === 'function') bindEstRows();
  }

  /* ---------- LANA HOMES Expenses (owner only) ---------- */
  var EX = { items: [], cats: [], f: { link: '', cat: '', from: '', to: '', q: '' } };
  function exLinkLabel(e) { return e.linkType === 'general' || !e.linkId ? 'General LLC' : (e.linkName || e.linkId); }
  function exFiltered() {
    var f = EX.f, q = f.q.toLowerCase();
    return EX.items.filter(function (e) {
      if (f.link === 'general' && !(e.linkType === 'general' || !e.linkId)) return false;
      if (f.link && f.link !== 'general' && e.linkId !== f.link) return false;
      if (f.cat && e.category !== f.cat) return false;
      if (f.from && (!e.date || e.date < f.from)) return false;
      if (f.to && (!e.date || e.date > f.to)) return false;
      if (q && (e.payee + ' ' + e.notes + ' ' + e.method).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) { return (b.date || '0') < (a.date || '0') ? -1 : 1; });
  }
  function viewExpenses() {
    loading();
    Promise.all([api('listExpenses'), loadFlips(true)]).then(function (res) { EX.items = res[0].items; EX.cats = res[0].categories; EX.props = res[1]; drawExpenses(); }).catch(fail);
  }
  function drawExpenses() {
    var rows = exFiltered(), f = EX.f;
    var total = rows.reduce(function (s, e) { return s + e.amount; }, 0);
    var byCat = {}; rows.forEach(function (e) { byCat[e.category || 'Other'] = (byCat[e.category || 'Other'] || 0) + e.amount; });
    var byLink = {}; rows.forEach(function (e) { var k = exLinkLabel(e); byLink[k] = (byLink[k] || 0) + e.amount; });
    var need = rows.filter(function (e) { return /Needs (Date|Amount)/.test(e.notes); }).length;
    var opt = function (v, l, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(l) + '</option>'; };
    var html = '<div class="spread"><div><h1>LANA HOMES Expenses</h1><p class="lead">Every LLC expense, tied to a flip, a holding or General LLC. Only you can see this.</p></div><div class="row"><button class="btn" id="csv">Export CSV</button><button class="btn gold" id="nx">Add Expense</button></div></div>';
    html += '<div class="card"><div class="calcgrid">' +
      '<div class="field"><label>Property</label><select id="xl">' + opt('', 'All', f.link) + opt('general', 'General LLC', f.link) + EX.props.map(function (p) { return opt(p.id, (isHolding(p) ? 'Holding · ' : 'Flip · ') + p.address, f.link); }).join('') + '</select></div>' +
      '<div class="field"><label>Category</label><select id="xc">' + opt('', 'All', f.cat) + EX.cats.map(function (c) { return opt(c, c, f.cat); }).join('') + '</select></div>' +
      '<div class="field"><label>From</label><input type="date" id="xf" value="' + esc(f.from) + '"></div><div class="field"><label>To</label><input type="date" id="xt" value="' + esc(f.to) + '"></div>' +
      '<div class="field"><label>Search</label><input id="xq" value="' + esc(f.q) + '" placeholder="Payee, notes, method"></div></div></div>';
    html += '<div class="grid g4" style="margin-top:22px">' + kpi('Total', money(total), rows.length + ' entr' + (rows.length === 1 ? 'y' : 'ies')) +
      kpi('General LLC', money(byLink['General LLC'] || 0), 'Not tied to a property') + kpi('Tied To Properties', money(total - (byLink['General LLC'] || 0)), 'Flips and holdings') +
      kpi('Needs Info', String(need), 'Missing a date or amount', need ? 'bad' : '') + '</div>';
    html += '<div class="grid g2" style="margin-top:22px"><div class="card"><h2>By Category</h2><div class="lines">' + Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; }).map(function (k) { return '<div class="ln"><span>' + esc(k) + '</span><span class="num">' + money(byCat[k]) + '</span></div>'; }).join('') + '</div></div>' +
      '<div class="card"><h2>By Property</h2><div class="lines">' + Object.keys(byLink).sort(function (a, b) { return byLink[b] - byLink[a]; }).map(function (k) { return '<div class="ln"><span>' + esc(k) + '</span><span class="num">' + money(byLink[k]) + '</span></div>'; }).join('') + '</div></div></div>';
    html += '<div class="label">Entries</div><div class="card tblwrap"><table class="t"><thead><tr><th>Date</th><th>Payee</th><th>Category</th><th>Property</th><th>Method</th><th class="r">Amount</th><th>Receipt</th><th></th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (e) {
        return '<tr><td>' + (fmtDate(e.date) || '<span class="pill warn">Needs Date</span>') + '</td><td><b>' + esc(e.payee) + '</b>' + (e.notes ? '<div class="meta">' + esc(e.notes) + '</div>' : '') + '</td><td>' + esc(e.category) + '</td><td>' + esc(exLinkLabel(e)) + '</td><td class="meta">' + esc(e.method) + '</td>' +
          '<td class="r num">' + money(e.amount) + '</td><td>' + (e.receiptUrl ? '<a href="' + esc(e.receiptUrl) + '" target="_blank" rel="noopener">View</a>' : '<span class="meta">—</span>') + '</td>' +
          '<td class="r"><button class="btn sm" data-xe="' + esc(e.id) + '">Edit</button> <button class="btn sm danger" data-xd="' + esc(e.id) + '">Delete</button></td></tr>';
      }).join('') : '<tr><td colspan="8" class="empty">No expenses match.</td></tr>') + '</tbody></table></div>';
    $app.innerHTML = html;
    var bindF = function (id, k) { var el = document.getElementById(id); el.onchange = function () { EX.f[k] = el.value; drawExpenses(); }; };
    bindF('xl', 'link'); bindF('xc', 'cat'); bindF('xf', 'from'); bindF('xt', 'to');
    var xq = document.getElementById('xq'); xq.onchange = function () { EX.f.q = xq.value; drawExpenses(); };
    document.getElementById('nx').onclick = function () { editExpense(null); };
    document.getElementById('csv').onclick = function () { exportCsv(rows); };
    document.querySelectorAll('[data-xe]').forEach(function (b) { b.onclick = function () { editExpense(EX.items.filter(function (e) { return e.id === b.dataset.xe; })[0]); }; });
    document.querySelectorAll('[data-xd]').forEach(function (b) { b.onclick = function () { confirmBox('Delete Expense', '<p>Remove this entry from the ledger? Its receipt stays in Drive.</p>', 'Delete', function () { api('deleteExpense', { id: b.dataset.xd }).then(function () { toast('Deleted.'); viewExpenses(); }).catch(fail); }); }; });
  }
  function csvCell(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function exportCsv(rows) {
    var head = ['Date', 'Payee', 'Category', 'Amount', 'Method', 'Property', 'Notes', 'Receipt'];
    var lines = [head.join(',')].concat(rows.map(function (e) { return [e.date, e.payee, e.category, e.amount.toFixed(2), e.method, exLinkLabel(e), e.notes, e.receiptUrl].map(csvCell).join(','); }));
    var blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'LANA HOMES Expenses ' + todayISO() + '.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function readB64(file) { return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(',')[1] || ''); }; r.onerror = no; r.readAsDataURL(file); }); }
  function editExpense(e) {
    var isNew = !e; e = e || { date: todayISO(), linkType: 'general', linkId: '', category: '', amount: '', method: 'LLC Card' };
    var cur = e.linkType === 'general' || !e.linkId ? 'general' : e.linkId;
    modal('<h2>' + (isNew ? 'Add Expense' : 'Edit Expense') + '</h2><div class="calcgrid">' +
      '<div class="field"><label>Date</label><input type="date" id="ed1" value="' + esc(e.date) + '"></div><div class="field"><label>Payee</label><input id="ed2" value="' + esc(e.payee || '') + '"></div>' +
      '<div class="field"><label>Category</label><select id="ed3">' + EX.cats.map(function (c) { return '<option' + (c === e.category ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>Amount (Negative For A Refund)</label><input id="ed4" inputmode="decimal" value="' + esc(e.amount) + '"></div>' +
      '<div class="field"><label>Method</label><input id="ed5" value="' + esc(e.method || '') + '" placeholder="LLC Card, Zelle, Check"></div>' +
      '<div class="field"><label>Property</label><select id="ed6"><option value="general">General LLC</option>' + EX.props.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === cur ? ' selected' : '') + '>' + (isHolding(p) ? 'Holding · ' : 'Flip · ') + esc(p.address) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="field"><label>Notes</label><textarea id="ed7" rows="2">' + esc(e.notes || '') + '</textarea></div>' +
      '<div class="field"><label>Receipt (PDF Or Photo, Under 10 MB)' + (e.receiptUrl ? ' · <a href="' + esc(e.receiptUrl) + '" target="_blank" rel="noopener">Current</a>' : '') + '</label><input type="file" id="ed8" accept="application/pdf,image/jpeg,image/png,image/heic,image/webp"></div>' +
      '<div class="row"><button class="btn gold" id="ok">Save</button><button class="btn" id="cx">Cancel</button></div>', function () {
      document.getElementById('cx').onclick = closeModal;
      document.getElementById('ok').onclick = function () {
        var b = this; b.disabled = true;
        var link = document.getElementById('ed6').value;
        var body = { id: e.id || '', date: document.getElementById('ed1').value, payee: document.getElementById('ed2').value, category: document.getElementById('ed3').value,
          amount: C.n(document.getElementById('ed4').value), method: document.getElementById('ed5').value, notes: document.getElementById('ed7').value,
          linkType: link === 'general' ? 'general' : 'flip', linkId: link === 'general' ? '' : link };
        var file = document.getElementById('ed8').files[0];
        var up = file ? (file.size > 10 * 1024 * 1024 ? Promise.reject(new Error('Receipts must be under 10 MB.')) : readB64(file).then(function (d) { return api('uploadReceipt', { name: file.name, mime: file.type, data: d }); })) : Promise.resolve(null);
        up.then(function (r) { if (r) { body.receiptId = r.receiptId; body.receiptName = r.receiptName; } return api('saveExpense', { expense: body }); })
          .then(function () { closeModal(); toast('Saved.'); viewExpenses(); }).catch(fail).then(function () { b.disabled = false; });
      };
    });
  }

  /* ---------- admin ---------- */
  function viewAdmin() {
    loading();
    Promise.all([api('listUsers'), loadFlips(true)]).then(function (res) {
      var users = res[0], flips = res[1];
      var html = '<div class="spread"><div><h1>Admin</h1><p class="lead">Invite people to specific flips and holdings. They only see what they’re invited to. Only you can grant Admin on a property.</p></div><div class="row"><button class="btn gold" id="nf">New Flip</button><button class="btn" id="nh">New Holding</button><a class="btn" href="#/estimates">All Estimates</a></div></div>';
      html += '<div class="label">Invite Someone</div><div class="card rule"><div class="calcgrid"><div class="field"><label>Email</label><input id="aem" type="email"></div><div class="field"><label>Name (Optional)</label><input id="anm"></div>' +
        '<div class="field"><label>Flip Or Holding</label><select id="afl">' + flips.map(function (f) { return '<option value="' + esc(f.id) + '">' + (isHolding(f) ? 'Holding · ' : 'Flip · ') + esc(f.address) + ' · ' + esc(f.status) + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label>Role</label><select id="arl"><option value="member">Member — View Only</option><option value="admin">Admin On This Property</option></select></div></div><button class="btn gold" id="ainv">Send Invite</button></div>';
      html += '<div class="label">Users</div><div class="card tblwrap"><table class="t"><thead><tr><th>User</th><th>Flips &amp; Holdings</th><th class="r">Estimates</th><th>Last Sign-In</th><th></th></tr></thead><tbody>' +
        users.map(function (u) {
          return '<tr><td><b>' + esc(u.name || u.email) + '</b>' + (u.role === 'owner' ? ' <span class="pill admin">Owner</span>' : '') + (u.active ? '' : ' <span class="pill warn">Off</span>') + '<div class="meta">' + esc(u.email) + '</div></td>' +
            '<td>' + (u.role === 'owner' ? '<span class="meta">All flips and holdings</span>' : (u.flips.length ? u.flips.map(function (f) { return '<a class="pill' + (f.role === 'admin' ? ' admin' : '') + '" style="margin:2px;text-decoration:none" href="#/flip/' + esc(f.flipId) + '">' + esc(f.address) + (f.role === 'admin' ? ' · Admin' : '') + '</a>'; }).join('') : '<span class="meta">None</span>')) + '</td>' +
            '<td class="r num">' + u.estimates + '</td><td class="meta">' + (u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never') + '</td>' +
            '<td class="r">' + (u.role === 'owner' ? '' : '<button class="btn sm' + (u.active ? ' danger' : '') + '" data-act="' + esc(u.id) + '" data-on="' + (u.active ? '0' : '1') + '">' + (u.active ? 'Turn Off' : 'Turn On') + '</button>') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      $app.innerHTML = html;
      document.getElementById('nf').onclick = function () { editFlip(null); };
      document.getElementById('nh').onclick = function () { editFlip(null, 'holding'); };
      document.getElementById('ainv').onclick = function () {
        var b = this; b.disabled = true;
        api('inviteUser', { flipId: document.getElementById('afl').value, email: document.getElementById('aem').value, name: document.getElementById('anm').value, role: document.getElementById('arl').value })
          .then(function () { toast('Invite sent.'); viewAdmin(); }).catch(fail).then(function () { b.disabled = false; });
      };
      document.querySelectorAll('[data-act]').forEach(function (b) { b.onclick = function () { api('setUserActive', { userId: b.dataset.act, active: b.dataset.on === '1' }).then(viewAdmin).catch(fail); }; });
    }).catch(fail);
  }

  boot().then(function () { renderChrome(); route(); });
})();
