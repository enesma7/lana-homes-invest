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
  // Flips | Holdings mode. Only the owner (super-admin) ever gets Holdings; everyone else is always in Flips.
  function mode() { return isOwner() && localStorage.getItem('lh_mode') === 'holdings' ? 'holdings' : 'flips'; }
  function setMode(m) { if (!isOwner()) return; var was = mode(); localStorage.setItem('lh_mode', m === 'holdings' ? 'holdings' : 'flips'); if (was !== mode()) renderChrome(); }
  function inMode(f) { return mode() === 'holdings' ? isHolding(f) : !isHolding(f); }
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
  function animate() { requestAnimationFrame(function () { requestAnimationFrame(function () {
    document.querySelectorAll('circle.arc').forEach(function (a) { a.style.strokeDashoffset = a.getAttribute('data-off'); });
    document.querySelectorAll('.hbar .tr i[data-w]').forEach(function (i) { i.style.width = i.getAttribute('data-w'); });
    document.querySelectorAll('.vbars').forEach(function (v) { v.classList.add('on'); });
  }); }); }
  // Horizontal bars: [{label, value, display, tone}] scaled to the largest |value|.
  function hbars(items) {
    var mx = items.reduce(function (m, i) { return Math.max(m, Math.abs(i.value || 0)); }, 0) || 1;
    return '<div class="hbars">' + items.map(function (i) {
      return '<div class="hbar"><div class="hl"><span>' + esc(i.label) + '</span><span class="num"><b>' + i.display + '</b></span></div><div class="tr"><i class="' + (i.tone || '') + '" data-w="' + (Math.abs(i.value || 0) / mx * 100).toFixed(1) + '%"></i></div></div>';
    }).join('') + '</div>';
  }
  // Grouped vertical bars: groups [{label, a, b}] with series names/colors.
  function vbars(groups, sa, sb) {
    var W = 560, H = 220, P = { l: 46, r: 8, t: 12, b: 30 }, iw = W - P.l - P.r, ih = H - P.t - P.b;
    var vals = []; groups.forEach(function (g) { vals.push(g.a, g.b); });
    var mx = Math.max.apply(null, vals.concat([1])), mn = Math.min.apply(null, vals.concat([0]));
    var span = mx - mn || 1, y = function (v) { return P.t + ih * (mx - v) / span; }, y0 = y(0);
    var gw = iw / Math.max(1, groups.length), bw = Math.min(30, gw * 0.28);
    var ticks = '', k; for (k = 0; k <= 4; k++) { var tv = mn + span * k / 4, ty = y(tv); ticks += '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + ty.toFixed(1) + '" y2="' + ty.toFixed(1) + '" stroke="#EEEEF0" stroke-dasharray="3 4"/><text x="' + (P.l - 8) + '" y="' + (ty + 3.5).toFixed(1) + '" text-anchor="end">' + (Math.abs(tv) >= 1000 ? (tv < 0 ? '−' : '') + '$' + Math.round(Math.abs(tv) / 1000) + 'K' : '$' + Math.round(tv)) + '</text>'; }
    var bars = groups.map(function (g, i) {
      var cx = P.l + gw * i + gw / 2, out = '';
      [[g.a, sa, -1], [g.b, sb, 1]].forEach(function (s) {
        var v = s[0], top = Math.min(y(v), y0), h = Math.max(2, Math.abs(y(v) - y0)), x = cx + (s[2] < 0 ? -bw - 3 : 3);
        var fill = s[1].neg && v < 0 ? 'url(#vbR)' : 'url(#' + s[1].id + ')';
        out += '<rect class="bar-r" x="' + x.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="5" fill="' + fill + '"><title>' + esc(g.label + ' · ' + s[1].name + ': ' + money(v, 0)) + '</title></rect>';
      });
      return out + '<text x="' + cx.toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle">' + esc(g.label.length > 16 ? g.label.slice(0, 15) + '…' : g.label) + '</text>';
    }).join('');
    return '<div class="vbars"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(sa.name + ' and ' + sb.name) + '"><defs>' +
      '<linearGradient id="vbG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EAD59E"/><stop offset="1" stop-color="#D5BE87"/></linearGradient>' +
      '<linearGradient id="vbI" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3A3A3F"/><stop offset="1" stop-color="#000007"/></linearGradient>' +
      '<linearGradient id="vbE" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1FA855"/><stop offset="1" stop-color="#0B6B34"/></linearGradient>' +
      '<linearGradient id="vbR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EF0207"/><stop offset="1" stop-color="#9A0007"/></linearGradient></defs>' +
      ticks + '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y0.toFixed(1) + '" y2="' + y0.toFixed(1) + '" stroke="#D5D5DA"/>' + bars + '</svg>' +
      '<div class="keys"><span><i style="background:' + sa.key + '"></i>' + esc(sa.name) + '</span><span><i style="background:' + sb.key + '"></i>' + esc(sb.name) + '</span></div></div>';
  }
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
    document.body.classList.add('auth');
    var mark = '<span class="mk" aria-hidden="true">LH</span>';
    $app.innerHTML = '<div class="auth-split">' +
      '<section class="auth-brand" aria-hidden="true"><div class="ab-grid"></div><div class="ab-glow"></div>' +
        '<svg class="ab-rings" viewBox="0 0 400 400"><defs><linearGradient id="abg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EAD59E"/><stop offset="1" stop-color="#D5BE87"/></linearGradient></defs>' +
        '<circle cx="200" cy="200" r="170" fill="none" stroke="rgba(234,213,158,.10)" stroke-width="1"/><circle cx="200" cy="200" r="130" fill="none" stroke="rgba(234,213,158,.14)" stroke-width="1"/>' +
        '<circle class="ab-arc a1" cx="200" cy="200" r="170" fill="none" stroke="url(#abg)" stroke-width="3" stroke-linecap="round" stroke-dasharray="300 769"/>' +
        '<circle class="ab-arc a2" cx="200" cy="200" r="130" fill="none" stroke="url(#abg)" stroke-width="3" stroke-linecap="round" stroke-dasharray="150 667"/>' +
        '<circle cx="200" cy="200" r="90" fill="none" stroke="rgba(234,213,158,.18)" stroke-width="1" stroke-dasharray="2 6"/></svg>' +
        '<div class="ab-top"><div class="brand light">' + mark + '<span class="tx"><span class="wm">LANA HOMES</span><span class="sub">INVESTMENTS</span></span></div></div>' +
        '<div class="ab-copy"><div class="ab-kicker">Private Investor Portal</div><h2>Every flip and holding,<br><span class="goldtxt">down to the dollar.</span></h2>' +
        '<p>Live returns, cash in, rehab spend and investor payouts, in one secure place.</p>' +
        '<div class="ab-stats"><div><b>Flips</b><span>Purchase To Payout</span></div><div><b>Holdings</b><span>Cash Flow &amp; NOI</span></div><div><b>Secure</b><span>Email Code Sign-In</span></div></div></div>' +
        '<div class="ab-foot">© LANA HOMES LLC</div></section>' +
      '<section class="auth-main"><div class="auth-mobile-brand">' + mark + '<span class="tx"><span class="wm">LANA HOMES</span><span class="sub">INVESTMENTS</span></span></div>' +
        '<div class="auth-card"><div class="steps"><span class="on" id="s1">1 · Email</span><i></i><span id="s2">2 · Code</span></div>' +
        (CFG.API_URL ? '' : '<p class="note bad">The Investments service is not connected yet.</p>') +
        '<form id="f1"><h1>Welcome back</h1><p class="lead">Enter your email and we’ll send you a one-time sign-in code.</p>' +
          '<div class="field ic"><label for="em">Email</label><div class="inwrap"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg><input id="em" type="email" autocomplete="email" placeholder="you@example.com" required value="' + esc(pre) + '"></div></div>' +
          '<button class="btn gold block" type="submit">Email Me A Code <span aria-hidden="true">→</span></button>' +
          '<p class="fine">Trusted devices sign in without a code for 30 days.</p></form>' +
        '<form id="f2" hidden><h1>Check your email</h1><p class="lead" id="sentto"></p>' +
          '<div class="field"><label for="cd">6-Digit Code</label><input id="cd" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" required></div>' +
          '<label class="check sw"><input type="checkbox" id="trust" checked><span class="swi" aria-hidden="true"></span> Trust This Device For 30 Days</label>' +
          '<button class="btn gold block" type="submit" style="margin-top:16px">Sign In <span aria-hidden="true">→</span></button>' +
          '<button class="btn ghost block" type="button" id="back">Use A Different Email</button></form>' +
        '</div><div class="auth-mfoot">© LANA HOMES LLC</div></section></div>';
    var f1 = document.getElementById('f1'), f2 = document.getElementById('f2'), em = document.getElementById('em');
    f1.onsubmit = function (ev) {
      ev.preventDefault(); var email = em.value.trim().toLowerCase(); var b = f1.querySelector('button'); b.disabled = true;
      var dt = localStorage.getItem(devKey(email));
      var p = dt ? api('deviceLogin', { email: email, deviceToken: dt }).then(function (d) { return finishLogin(email, d); }).catch(function () { localStorage.removeItem(devKey(email)); return null; }) : Promise.resolve(null);
      p.then(function (done) {
        if (done) return;
        return api('requestCode', { email: email }).then(function (d) {
          f1.hidden = true; f2.hidden = false; f2.dataset.email = email;
          document.getElementById('s1').className = 'done'; document.getElementById('s2').className = 'on';
          document.getElementById('sentto').textContent = d.message + ' (' + email + ')'; document.getElementById('cd').focus();
        });
      }).catch(fail).then(function () { b.disabled = false; });
    };
    document.getElementById('back').onclick = function () { f2.hidden = true; f1.hidden = false; document.getElementById('s1').className = 'on'; document.getElementById('s2').className = ''; em.focus(); };
    var cdi = document.getElementById('cd'); cdi.oninput = function () { cdi.value = cdi.value.replace(/\D/g, '').slice(0, 6); };
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
  // Sign out right away on this device: drop the session and the 30-day trusted-device token
  // first, show the sign-in page, then tell the server in the background (keepalive survives navigation).
  function logout() {
    var tok = S.token, email = (S.user && S.user.email) || localStorage.getItem('fl_last_email') || '', dt = email && localStorage.getItem(devKey(email));
    if (email) localStorage.removeItem(devKey(email));
    try { sessionStorage.removeItem('fl_token'); } catch (e) {}
    signOutLocal(); location.hash = '#/'; route();
    if (CFG.API_URL && tok) {
      try { fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'logout', token: tok, deviceToken: dt || '', forget: true }), redirect: 'follow', credentials: 'omit', cache: 'no-store', keepalive: true }).catch(function () {}); } catch (e) {}
    }
  }

  /* ---------- chrome / routing ---------- */
  function renderChrome() {
    var tabs = document.getElementById('tabs'), who = document.getElementById('who');
    var mb = document.getElementById('modebar');
    document.body.classList.toggle('auth', !S.user);
    if (!S.user) { tabs.hidden = true; who.innerHTML = ''; mb.hidden = true; mb.innerHTML = ''; return; }
    var hm = mode() === 'holdings', items;
    if (hm) items = [['#/', 'Dashboard'], ['#/holdings', 'Holdings'], ['#/resources', 'Resources']];
    else {
      items = [['#/', 'Dashboard'], ['#/flips', 'Flips'], ['#/calculator', 'Calculator'], ['#/estimates', isOwner() ? 'All Estimates' : 'My Estimates'], ['#/archive', 'Archive'], ['#/resources', 'Resources']];
    }
    if (isOwner()) {
      mb.innerHTML = '<div class="toggle' + (hm ? ' h' : '') + '" role="tablist" aria-label="Flips or Holdings"><span class="knob"></span><button role="tab" data-m="flips" aria-selected="' + !hm + '" class="' + (hm ? '' : 'on') + '">Flips</button><button role="tab" data-m="holdings" aria-selected="' + hm + '" class="' + (hm ? 'on' : '') + '">Holdings</button></div>';
      mb.hidden = false;
      mb.querySelectorAll('button[data-m]').forEach(function (b) { b.onclick = function () { if (b.dataset.m === mode()) return; setMode(b.dataset.m); if (location.hash === '#/' || location.hash === '' || location.hash === '#') route(); else location.hash = '#/'; }; });
    } else { mb.hidden = true; mb.innerHTML = ''; }
    tabs.innerHTML = '<div class="nh">' + (hm ? 'Holdings' : 'Flips') + '</div>' + items.map(function (x) { return '<a href="' + x[0] + '" data-h="' + x[0] + '">' + (ICONS[x[1].split(' ').pop()] || '') + '<span>' + x[1] + '</span></a>'; }).join('');
    tabs.hidden = false;
    var nm = S.user.name || S.user.email, ini = nm.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join('');
    who.innerHTML = '<button class="avatar" id="av" aria-haspopup="menu" aria-expanded="false" aria-label="Account">' + esc(ini) + '</button>' +
      '<div class="menu" id="acct" role="menu" hidden><div class="mh"><b>' + esc(nm) + '</b><span>' + esc(S.user.email) + '</span><div><span class="pill' + (isOwner() ? ' admin' : '') + '">' + (isOwner() ? 'Owner' : 'Member') + '</span></div></div>' + (isOwner() ? '<button type="button" role="menuitem" id="mex">' + ICONS.Expenses + 'Expenses</button><button type="button" role="menuitem" id="adm">' + ICONS.Admin + 'Admin</button>' : '') + '<button type="button" role="menuitem" id="lo">Sign Out</button></div>';
    var av = document.getElementById('av'), mn = document.getElementById('acct');
    av.onclick = function (e) { e.stopPropagation(); mn.hidden = !mn.hidden; av.setAttribute('aria-expanded', String(!mn.hidden)); };
    if (!renderChrome.bound) {
      renderChrome.bound = true;
      var closeMenu = function (focus) { var m = document.getElementById('acct'), a = document.getElementById('av'); if (m && !m.hidden) { m.hidden = true; a.setAttribute('aria-expanded', 'false'); if (focus) a.focus(); } };
      document.addEventListener('click', function (e) { var m = document.getElementById('acct'); if (m && !m.contains(e.target)) closeMenu(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(true); });
      window.addEventListener('hashchange', function () { closeMenu(); });
    }
    requestAnimationFrame(function () { var t = document.querySelector('.top'); if (t) document.documentElement.style.setProperty('--toph', t.offsetHeight + 'px'); });
    var mex = document.getElementById('mex'); if (mex) mex.onclick = function () { mn.hidden = true; av.setAttribute('aria-expanded', 'false'); location.hash = '#/expenses'; };
    var adm = document.getElementById('adm'); if (adm) adm.onclick = function () { mn.hidden = true; av.setAttribute('aria-expanded', 'false'); setMode('flips'); location.hash = '#/admin'; };
    document.getElementById('lo').onclick = function (e) { e.preventDefault(); e.stopPropagation(); mn.hidden = true; logout(); };
  }
  function markTab(h) { document.querySelectorAll('#tabs a').forEach(function (a) { var on = a.dataset.h === h || (h.indexOf('#/flip/') === 0 && a.dataset.h === '#/flips') || (h.indexOf('#/estimate/') === 0 && a.dataset.h === '#/estimates'); a.classList.toggle('on', on); }); }
  function route() {
    if (!S.user) { renderChrome(); return renderLogin(); }
    var h = location.hash || '#/';
    var m, base = h.split('?')[0];
    if (!isOwner() && (base === '#/holdings' || base === '#/expenses')) { location.hash = '#/'; return; }
    if (base === '#/holdings') setMode('holdings');
    else if (/^#\/(flips|archive|calculator|estimates|estimate\/|admin)/.test(base)) setMode('flips');
    markTab(base);
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
    if (mode() === 'holdings') return viewHoldingsDashboard();
    loading();
    loadFlips(true).then(function (all) {
      var today = todayISO();
      var flips = all.filter(function (f) { return !isHolding(f); });
      var rows = flips.map(function (f) { return { f: f, x: C.flip(f, today) }; });
      var sold = rows.filter(function (r) { return r.f.status === 'Sold'; }), open = rows.filter(function (r) { return r.f.status !== 'Sold'; });
      var sum = function (a, fn) { return a.reduce(function (s, r) { return s + fn(r); }, 0); };
      var capOpen = sum(open, function (r) { return Number(r.f.cashInvested) || 0; });
      var realized = sum(sold, function (r) { return r.x.profit; }), projected = sum(open, function (r) { return r.x.profit; });
      var capSold = sum(sold, function (r) { return Number(r.f.cashInvested) || 0; });
      var roiSold = capSold ? realized / capSold : null, roiOpen = capOpen ? projected / capOpen : null;
      var stakes = rows.map(function (r) { return myStake(r.f, r.x); }).filter(Boolean);
      var ann = sold.filter(function (r) { return r.x.simpleAnnual != null; });
      var html = '<div class="spread"><div><h1>' + (isOwner() ? 'Flips Dashboard' : 'Your Flips') + '</h1><p class="lead">' + flips.length + ' flip' + (flips.length === 1 ? '' : 's') + ' · ' + open.length + ' open · ' + sold.length + ' sold</p></div>' +
        '<div class="row" style="margin-bottom:18px"><a class="btn gold" href="#/calculator">New Estimate</a></div></div>';
      html += '<div class="grid g4">' +
        kpi('Capital In Open Flips', money(capOpen, 0), 'Cash invested, excluding loans') +
        kpi('Projected Profit (Open)', sMoney(projected, 0), pct(roiOpen, 0) + ' on cash in open flips', projected < 0 ? 'bad' : 'good', { v: roiOpen, max: 1, tone: roiOpen < 0 ? 'bad' : 'good', label: pct(roiOpen, 0) }) +
        kpi('Realized Profit (Sold)', sMoney(realized, 0), sold.length + ' sold flip' + (sold.length === 1 ? '' : 's'), realized < 0 ? 'bad' : 'good') +
        kpi('Return On Cash (Sold)', sPct(roiSold), 'Profit ÷ cash invested', null, { v: roiSold, max: 1, tone: roiSold < 0 ? 'bad' : 'good', label: pct(roiSold, 0) }) + '</div>';
      if (stakes.length) {
        var yc = stakes.reduce(function (s, i) { return s + i.capital; }, 0), yp = stakes.reduce(function (s, i) { return s + i.profitShare; }, 0);
        html += '<div class="label">Your Share</div><div class="grid g3">' + kpi('Your Capital In', money(yc, 0), 'Across ' + stakes.length + ' flip' + (stakes.length === 1 ? '' : 's')) +
          kpi('Your Profit Share', sMoney(yp, 0), 'Sold + projected', yp < 0 ? 'bad' : 'good') + kpi('Your Total Payout', money(yc + yp, 0), 'Capital returned first, then your split') + '</div>';
      }
      html += '<div class="grid g21" style="margin-top:16px"><div class="card rule"><h2>Cash In Vs Profit</h2><p class="meta">By flip · sold and projected</p>' +
        vbars(rows.map(function (r) { return { label: r.f.address, a: Number(r.f.cashInvested) || 0, b: r.x.profit }; }), { id: 'vbI', name: 'Cash In', key: '#000007' }, { id: 'vbE', name: 'Profit', key: '#1FA855', neg: true }) + '</div>' +
        '<div class="card rule"><h2>Annualized Return · Sold</h2><p class="meta">Simple annualized, purchase to close</p>' +
        (ann.length ? hbars(ann.map(function (r) { return { label: r.f.address + ' · ' + r.x.daysHeld + ' days', value: r.x.simpleAnnual, display: sPct(r.x.simpleAnnual), tone: r.x.simpleAnnual < 0 ? 'bad' : 'good' }; })) : '<p class="empty">No sold flips with both dates yet.</p>') +
        '<div class="statgrid"><div>Total Cash In<b>' + money(capOpen + capSold, 0) + '</b></div><div>Open<b>' + open.length + '</b></div><div>Sold<b>' + sold.length + '</b></div></div></div></div>';
      html += '<div class="label">Open Flips</div>' + flipCards(open) + '<div class="label">Recently Sold</div>' + flipCards(sold.slice(0, 4));
      $app.innerHTML = html; bindCards(); animate();
    }).catch(fail);
  }
  function viewHoldingsDashboard() {
    loading();
    loadFlips(true).then(function (all) {
      var list = all.filter(function (f) { return isHolding(f) && f.status !== 'Sold'; });
      var hx = list.map(function (f) { return { f: f, x: C.holding(f) }; });
      var hs = function (k) { return hx.reduce(function (t, r) { return t + (r.x[k] || 0); }, 0); };
      var known = hx.filter(function (r) { return r.x.hasIncome; }), cashKnown = known.reduce(function (t, r) { return t + (r.x.cashInvested || 0); }, 0);
      var noi = known.reduce(function (t, r) { return t + r.x.noi; }, 0), coc = cashKnown ? noi / cashKnown : null;
      var cash = hs('cashInvested'), eq = hs('equity'), eqGain = cash ? (eq - cash) / cash : null;
      var deps = list.reduce(function (t, f) { return t + depositsHeld(f); }, 0);
      var html = '<div class="spread"><div><h1>Holdings Dashboard</h1><p class="lead">' + list.length + ' propert' + (list.length === 1 ? 'y' : 'ies') + ' held · rent, cash flow and equity</p></div>' +
        '<div class="row" style="margin-bottom:18px"><a class="btn" href="#/holdings">All Holdings</a></div></div>';
      html += '<div class="grid g4">' +
        kpi('Monthly Cash Flow', known.length ? sMoney(hs('monthlyCashFlow'), 0) : '<span class="pill warn">Needs Data</span>', money(hs('rent'), 0) + ' rent − ' + money(hs('expenses'), 0) + ' expenses', 'good') +
        kpi('Annual NOI', known.length ? sMoney(noi, 0) : '—', 'Rent minus operating expenses', 'good') +
        kpi('Cash-On-Cash', sPct(coc), 'Annual cash flow ÷ cash in', null, { v: coc, max: 1, tone: coc < 0 ? 'bad' : 'good', label: pct(coc, 0) }) +
        kpi('Equity', sMoney(eq, 0), pct(eqGain, 0) + ' gain on cash in', eq < 0 ? 'bad' : 'good', { v: eqGain, max: 1, tone: eqGain < 0 ? 'bad' : 'good', label: pct(eqGain, 0) }) + '</div>';
      html += '<div class="grid g21" style="margin-top:16px"><div class="card rule"><h2>Rent Vs Expenses</h2><p class="meta">Monthly, by property</p>' +
        vbars(hx.map(function (r) { return { label: r.f.address, a: r.x.rent || 0, b: r.x.expenses || 0 }; }), { id: 'vbE', name: 'Rent', key: '#1FA855' }, { id: 'vbG', name: 'Expenses', key: '#D5BE87' }) + '</div>' +
        '<div class="card rule"><h2>Snapshot</h2><p class="meta">Across all holdings</p><div class="lines">' +
        '<div class="ln"><span>Holdings Value</span><span class="num">' + money(hs('value'), 0) + '</span></div>' +
        '<div class="ln"><span>Cash In</span><span class="num">' + money(cash, 0) + '</span></div>' +
        '<div class="ln"><span>Loan Balances</span><span class="num">' + money(hs('loanBalance'), 0) + '</span></div>' +
        '<div class="ln"><span>Monthly Rent</span><span class="num">' + money(hs('rent'), 0) + '</span></div>' +
        '<div class="ln"><span>Deposits Held (Owed To Tenants)</span><span class="num">' + money(deps, 0) + '</span></div>' +
        '<div class="ln tot"><span>Cash Flow / Year</span><span class="num">' + sMoney(hs('annualCashFlow'), 0) + '</span></div></div></div></div>';
      html += '<div class="label">Holdings</div>' + holdingCards(list);
      $app.innerHTML = html; bindCards(); animate();
    }).catch(fail);
  }
  function kpi(k, v, sub, tone, ring) {
    var body = '<div class="k">' + k + '</div><div class="v">' + v + '</div><div class="meta">' + esc(sub || '') + '</div>';
    if (!ring) return '<div class="card kpi' + (tone ? ' ' + tone : '') + '">' + body + '</div>';
    return '<div class="card kpi ringk' + (tone ? ' ' + tone : '') + '"><div class="mring">' + mring(ring.v, ring.max, ring.tone, ring.label) + '</div><div class="kb">' + body + '</div></div>';
  }
  function mring(value, max, tone, label) {
    var size = 54, sw = 6, r = (size - sw) / 2, c = 2 * Math.PI * r, frac = value == null || !(max > 0) ? 0 : Math.max(0, Math.min(1, Math.abs(value) / max));
    var id = 'm' + Math.random().toString(36).slice(2, 8), st = tone === 'good' ? ['#1FA855', '#0B6B34'] : tone === 'bad' ? ['#EF0207', '#9A0007'] : ['#EAD59E', '#D5BE87'];
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + st[0] + '"/><stop offset="1" stop-color="' + st[1] + '"/></linearGradient></defs>' +
      '<circle cx="27" cy="27" r="' + r + '" fill="none" stroke="#EEEEF0" stroke-width="' + sw + '"/><circle class="arc" cx="27" cy="27" r="' + r + '" fill="none" stroke="url(#' + id + ')" stroke-width="' + sw + '" stroke-linecap="round" stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + c.toFixed(2) + '" data-off="' + (c * (1 - frac)).toFixed(2) + '" transform="rotate(-90 27 27)"/>' +
      '<text x="27" y="30.5" text-anchor="middle" font-family="Inter,sans-serif" font-size="10.5" font-weight="800" fill="#000007">' + esc(label || '') + '</text></svg>';
  }
  var ICO = function (d) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>'; };
  var ICONS = {
    Dashboard: ICO('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
    Flips: ICO('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
    Holdings: ICO('<path d="M3 21h18"/><path d="M5 21V8l7-5 7 5v13"/><path d="M9 21v-5h6v5"/><path d="M9 10h.01M15 10h.01"/>'),
    Calculator: ICO('<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h8"/>'),
    Estimates: ICO('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>'),
    Archive: ICO('<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v12h14V8M10 12h4"/>'),
    Resources: ICO('<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M17 11a3 3 0 1 0 0-6M22 21c0-3-2-5-5-5.5"/>'),
    Expenses: ICO('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>'),
    Admin: ICO('<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/>')
  };
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
      if (isHolding(f)) { setMode('holdings'); return renderHolding(f); }
      setMode('flips');
      var x = C.flip(f, todayISO()), sold = f.status === 'Sold', can = f.canManage, own = isOwner();
      markTab(sold ? '#/archive' : '#/flips');
      var ln = function (k, v, cls) { return '<div class="ln' + (cls ? ' ' + cls : '') + '"><span>' + k + '</span><span class="num">' + v + '</span></div>'; };
      var budgetPct = f.rehabBudget ? Math.min(1.5, f.rehabSpent / f.rehabBudget) : 0;
      var html = '<p class="meta"><a href="#/' + (sold ? 'archive' : 'flips') + '">← ' + (sold ? 'Archive' : 'Flips') + '</a></p>' +
        '<div class="spread"><div><h1>' + esc(f.address) + '</h1><p class="lead">' + esc(f.city) + (f.partners ? ' · ' + esc(f.partners) : '') + '</p></div><div class="row">' +
        (can ? '<select id="st" class="btn" aria-label="Status">' + STATUSES.map(function (s) { return '<option' + (s === f.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' : '<span class="pill s-' + esc(f.status.replace(/\s/g, '')) + '">' + esc(f.status) + '</span>') +
        (can ? '<button class="btn" id="ed">Edit Numbers</button>' : '') + (can ? '<button class="btn gold" id="inv">Invite User</button>' : '') + '</div></div>';
      html += '<div class="grid g4" style="margin-top:4px">' +
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
      if (x.payout) html += payoutCard(x.payout);
      if (own) html += '<div class="label">Expenses</div><div id="proex"></div>';
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
      renderInventory('flip', f.id, f.inventory || [], can); propExpenses(f);
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

  // Purchase To Payout: cash put in at purchase, who funded what, what the sale closing paid off, and who got paid.
  function payoutCard(p) {
    var ln = function (r, cls) { return '<div class="ln' + (cls ? ' ' + cls : '') + '"><span>' + esc(r[0]) + (r[2] ? '<em class="meta" style="display:block;font-style:normal">' + esc(r[2]) + '</em>' : '') + '</span><span class="num">' + (r[1] < 0 ? '<span class="neg">−' + money(-r[1]) + '</span>' : money(r[1])) + '</span></div>'; };
    var block = function (title, rows, tot) { return rows && rows.length ? '<div class="label" style="margin:14px 0 4px">' + esc(title) + '</div><div class="lines">' + rows.map(function (r) { return ln(r); }).join('') + (tot ? ln(tot, 'tot') : '') + '</div>' : ''; };
    return '<div class="label">' + esc(p.title || 'Purchase To Payout') + '</div><div class="grid g2"><div class="card rule"><h2>Invested</h2><p class="meta">' + esc(p.investedSub || 'Cash put in to buy, fix and hold') + '</p>' +
      block('At Purchase', p.purchase, p.purchaseTotal) + block('Cash Invested By Partner', p.capital, p.capitalTotal) + '</div>' +
      '<div class="card rule"><h2>' + esc(p.saleTitle || 'Paid Out') + '</h2><p class="meta">' + esc(p.saleSub || 'Sale closing, payoffs and partner payouts') + '</p>' +
      block(p.saleLabel || 'At Sale Closing', p.sale, p.saleTotal) + block(p.paidLabel || 'Paid Out To', p.paid, p.paidTotal) + '</div></div>' +
      (p.source ? '<p class="meta" style="margin-top:10px">Source: ' + esc(p.source) + '</p>' : '');
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
    var inv = (f.investors || []).filter(function (i) { return !i.payout; }).map(function (i) { return i.name + ' | ' + i.capital + ' | ' + (Math.round(i.split * 10000) / 100); }).join('\n');
    modal('<h2>' + (isNew ? (hold ? 'New Holding' : 'New Flip') : 'Edit ' + esc(f.address)) + '</h2><div class="calcgrid">' + FIELDS.map(function (x) {
      return '<div class="field"><label>' + x[1] + '</label><input data-k="' + x[0] + '" type="' + (x[2] === 'date' ? 'date' : 'text') + '" ' + (x[2] === 'num' ? 'inputmode="decimal"' : '') + ' value="' + esc(f[x[0]] == null ? '' : f[x[0]]) + '"></div>';
    }).join('') + '</div>' + (isNew ? '<div class="field"><label>Status</label><select id="nst">' + SL.map(function (s) { return '<option' + (s === (hold ? 'Owned' : 'Active') ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' : '') +
      '<div class="field"><label>Investors (One Per Line: Name | Capital | Split %)</label><textarea id="invs" rows="3">' + esc(inv) + '</textarea></div>' +
      '<div class="field"><label>Notes</label><textarea data-k="notes" rows="3">' + esc(f.notes || '') + '</textarea></div><div class="row"><button class="btn gold" id="ok">Save</button><button class="btn" id="cx">Cancel</button></div>', function () {
      document.getElementById('cx').onclick = closeModal;
      document.getElementById('ok').onclick = function () {
        var body = {}; document.querySelectorAll('#modal [data-k]').forEach(function (el) { body[el.dataset.k] = el.value; });
        var invTxt = document.getElementById('invs').value;
        // Only send investors when edited, so the stored Purchase To Payout breakdown is kept.
        if (isNew || invTxt.trim() !== inv.trim()) body.investors = invTxt.split('\n').map(function (l) { var p = l.split('|').map(function (s) { return s.trim(); }); return p[0] ? { name: p[0], capital: C.n(p[1]), split: C.n(p[2]) / 100 } : null; }).filter(Boolean);
        if (body.investors) { var pm = (f.investors || []).filter(function (i) { return i.payout; })[0]; if (pm) body.investors.push(pm); }
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
    ['Financing & Dates', [['loanAmount', 'Loan Amount ($)'], ['interestRate', 'Interest Rate (%/yr)'], ['pointsPct', 'Points (%)'], ['originationFee', 'Origination / Lender Fees ($)'], ['lender', 'Lender', 'text'], ['fundingDate', 'Purchase / Close Date', 'date'], ['holdMonths', 'Hold (Months)'], ['payoffDate', 'Projected Sale Date', 'date', 'Auto'], ['daysHeld', 'Or Days Held']]],
    ['Buying Closing Costs', [['buyEscrowPct', 'Escrow Fee (% Of Price)', '', '', 'pp'], ['buyTitlePct', 'Title / Lender Policy (% Of Price)', '', '', 'pp'], ['buyLoanDocs', 'Loan Docs / Processing ($)'], ['buyRecording', 'Recording ($)'], ['buyCourier', 'Courier ($)'], ['buyNotary', 'Notary ($)'], ['wireFees', 'Wire Fees ($)'], ['buyClosing', 'Other Buying Costs ($)'], ['insurancePrepaid', 'Prepaid Insurance, 12 Mo ($)', '', 'Auto'], ['taxProration', 'Tax Proration At Purchase ($)', '', 'Auto'], ['taxIsCredit', 'Typed Purchase Proration Is A Credit', 'bool'], ['hoaAtPurchase', 'HOA At Purchase ($)'], ['purchaseRefund', 'Escrow Refund After Close ($)']]],
    ['Rehab', [['rehabBudget', 'Rehab Budget ($)'], ['contingencyPct', 'Contingency (%)']]],
    ['Holding Costs', [['taxRatePct', 'Property Tax Rate (%/yr)'], ['insuranceAnnual', 'Insurance ($/yr)'], ['utilitiesMonthly', 'Utilities ($/mo)'], ['propertyTaxes', 'Property Taxes Override ($)', '', 'Auto'], ['insuranceHold', 'Insurance Override ($)', '', 'Auto'], ['utilities', 'Utilities Override ($)', '', 'Auto'], ['hoaHold', 'HOA During Hold ($)'], ['otherHold', 'Other Holding ($)'], ['interestOutOfPocket', 'Interest Paid Monthly Out Of Pocket', 'bool']]],
    ['Selling Costs', [['listingPct', 'Listing Commission (%)', '', '', 'sp'], ['buyerPct', 'Buyer Commission (%)', '', '', 'sp'], ['sellEscrowPct', 'Escrow Fee (% Of Sale)', '', '', 'sp'], ['sellTitlePct', 'Owner’s Title Policy (% Of Sale)', '', '', 'sp'], ['sellRecording', 'Recording ($)'], ['nhd', 'NHD Report ($)'], ['homeWarranty', 'Home Warranty ($)'], ['sellNotary', 'Notary ($)'], ['countyTTper1k', 'County Transfer Tax ($ Per $1,000)', '', '', 'tt'], ['cityTTper1k', 'City Transfer Tax ($ Per $1,000)', '', '', 'tt'], ['sellWire', 'Wire Fees ($)'], ['sellEscrow', 'Other Selling Closing ($)'], ['buyerCredits', 'Buyer Credits ($)'], ['miscSelling', 'Marketing / Misc ($)'], ['sellTaxProration', 'Tax Proration At Sale ($, Negative = Credit)', '', 'Auto']]]
  ];
  // The two numbers that drive a deal sit on top of the calculator; everything else is grouped below.
  var CALC_TOP = [['purchasePrice', 'Purchase Price'], ['salePrice', 'ARV Sales Price']];
  // Holding defaults: tax 1.2%/yr of price; insurance $2,382/yr (Argonne's Bamboo policy, 4/10/2026 statement); utilities $150/mo (Argonne SCE ~$136 + water).
  var CALC_DEFAULTS = { interestRate: 8, pointsPct: 1.5, taxIsCredit: true, autoProrations: true, holdMonths: 6, contingencyPct: 10, listingPct: 0, buyerPct: 2, taxRatePct: 1.2, insuranceAnnual: 2382, utilitiesMonthly: 150 };
  // Itemized closing-cost defaults from Enrique's deals. Buying: Argonne buyer final statement (4/10/2026, $845,000):
  // escrow $2,462.50 (0.29%), lender policy + binder $372 (0.044%), loan docs + processing $500, recording $106, courier $120, Zina's wires $60.
  // Selling: Argonne Safeguard estimate (11/20/2026, $1,050,000): escrow $360 (0.034%), title $8,550.50 (0.814%), recording $100, NHD $150,
  // warranty $710, notary $250, buyer commission 2%. County transfer tax $1.10 per $1,000 (LA / San Bernardino).
  var ITEM_DEFAULTS = { buyEscrowPct: 0.29, buyTitlePct: 0.044, buyLoanDocs: 500, buyRecording: 106, buyCourier: 120, buyNotary: 0, wireFees: 60,
    sellEscrowPct: 0.034, sellTitlePct: 0.814, sellRecording: 100, nhd: 150, homeWarranty: 710, sellNotary: 250, countyTTper1k: 1.1, cityTTper1k: 0, sellWire: 0 };
  function viewCalculator(est) {
    var legacy = est && est.inputs && !('buyEscrowPct' in est.inputs), zero = {};
    if (legacy) Object.keys(ITEM_DEFAULTS).forEach(function (k) { zero[k] = k === 'homeWarranty' ? (est.inputs.homeWarranty || 0) : 0; });
    // Estimates saved before auto prorations keep their old math (no auto prorations, prepaid insurance or hold months).
    if (est && est.inputs && !('autoProrations' in est.inputs)) { zero.autoProrations = false; zero.holdMonths = ''; }
    var inputs = Object.assign({}, CALC_DEFAULTS, legacy ? zero : ITEM_DEFAULTS, est ? est.inputs : {});
    if (est) { inputs.name = est.name; inputs.address = est.address; }
    var html = '<div class="spread"><div><h1>' + (est ? 'Estimate: ' + esc(est.name || est.address) : 'Flip Calculator') + '</h1><p class="lead">' + (est ? 'Saved ' + new Date(est.createdAt).toLocaleDateString() + ' · Auto-deletes ' + new Date(est.expiresAt).toLocaleDateString() + ' (90 days)' + (est.owner && !est.mine ? ' · Created by ' + esc(est.owner.name || est.owner.email) : '') : 'Estimates you save are kept for 90 days, then deleted automatically.') + '</p></div>' +
      (est ? '<a class="btn" href="#/estimates">← Estimates</a>' : '') + '</div>' +
      '<form id="ctop" class="card rule calchero" onsubmit="return false"><div class="ch-in">' + CALC_TOP.map(function (x) {
        return '<div class="field big"><label>' + x[1] + '</label><div class="dollar"><span>$</span><input data-k="' + x[0] + '" inputmode="decimal" placeholder="0" value="' + esc(inputs[x[0]] == null ? '' : inputs[x[0]]) + '"></div>' + (x[0] === 'purchasePrice' ? '<div class="sughint" id="maxhint"></div>' : '<div class="sughint">&nbsp;</div>') + '</div>';
      }).join('') + '</div><div class="ch-kpis" id="ckpi"></div></form>' +
      '<div class="grid g2" style="align-items:start;margin-top:22px"><div class="card rule"><form id="cf" onsubmit="return false">';
    CALC_FIELDS.forEach(function (sec) {
      html += '<div class="label" style="margin-top:6px">' + sec[0] + '</div><div class="calcgrid">' + sec[1].map(function (x) {
        var k = x[0], v = inputs[k] == null ? '' : inputs[k];
        if (x[2] === 'bool') return '<label class="check" style="margin-bottom:12px"><input type="checkbox" data-k="' + k + '"' + (v === true || v === 'true' ? ' checked' : '') + '> ' + x[1] + '</label>';
        return '<div class="field"><label>' + x[1] + (x[4] ? ' <em class="amt" data-amt="' + k + '"></em>' : '') + '</label><input data-k="' + k + '" type="' + (x[2] === 'date' ? 'date' : 'text') + '"' + (x[2] ? '' : ' inputmode="decimal"') + (x[3] ? ' placeholder="' + esc(x[3]) + '" data-auto="' + k + '"' : '') + ' value="' + esc(v) + '"></div>';
      }).join('') + '</div>';
    });
    html += '<input type="hidden" data-k="autoProrations" value="' + esc(String(inputs.autoProrations)) + '"><p class="meta" id="taxnote" style="margin-top:4px"></p></form></div><div><div class="card rule" id="cres"></div><div class="row" style="margin-top:16px">' +
      '<button class="btn gold" id="save">' + (est ? 'Save Changes' : 'Save Estimate') + '</button>' +
      (est ? '<button class="btn" id="addi">Add Inventory Needs List</button>' : '') +
      (est && isOwner() && !est.convertedFlipId ? '<button class="btn dark" id="conv">Turn Into Active Flip</button>' : '') +
      (est && est.convertedFlipId ? '<a class="btn" href="#/flip/' + esc(est.convertedFlipId) + '">Open Flip</a>' : '') +
      (est ? '<button class="btn danger" id="del">Delete</button>' : '') + '</div>' +
      (est && !isOwner() ? '<p class="meta" style="margin-top:10px">Only the owner can turn an estimate into an active flip.</p>' : '') + '</div></div>' +
      (est ? '<div class="label">Inventory Needs List</div><div id="invlist"></div>' : '');
    $app.innerHTML = html;
    var read = function () { var o = {}; document.querySelectorAll('#ctop [data-k], #cf [data-k]').forEach(function (el) { o[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; }); return o; };
    var paint = function () {
      var i = read(), r = C.estimate(i), ln = function (k, v, cls) { return '<div class="ln' + (cls ? ' ' + cls : '') + '"><span>' + k + '</span><span class="num">' + v + '</span></div>'; };
      var tone = r.rating === 'green' ? 'good' : r.rating === 'red' ? 'bad' : 'gold';
      var loss = r.profit < 0;
      document.getElementById('cres').innerHTML = '<div class="pl-hero' + (loss ? ' loss' : '') + '"><div class="k">' + (loss ? 'Estimated Loss' : 'Estimated Profit') + '</div><div class="v num">' + (loss ? '−' : '') + money(Math.abs(r.profit), 0) + '</div>' +
        '<div class="s">' + (C.n(i.salePrice) ? 'At a ' + money(C.n(i.salePrice), 0) + ' sale · ' + sPctTxt(r.roiCash) + ' on cash' : 'Add the ARV Sales Price') + '</div></div>' +
        '<h2 style="margin-top:18px">Results</h2><p class="meta">' + (r.daysHeld ? r.daysHeld + ' days held (' + r.monthsHeld + ' mo) · interest, taxes, insurance and utilities prorated by days / 365' : 'Add dates or days held to compute interest, holding costs and annualized return') + '</p>' +
        '<div class="row" style="justify-content:space-around;margin:12px 0">' + donut(r.roiCash || 0, 1, pct(r.roiCash, 0), 'Return On Cash', tone, 120) + donut(r.simpleAnnual || 0, 1, r.simpleAnnual == null ? '—' : pct(r.simpleAnnual, 0), 'Annualized (Simple)', tone, 120) + '</div>' +
        '<div class="lines">' + ln('Loan / LTV', money(r.loanAmount, 0) + ' · ' + pct(r.ltv)) + ln('Cash To Close', money(r.cashToClose)) + ln('Buying Costs (Net, With Points)', money(r.buyingCosts)) + ln('Rehab (With Contingency)', money(r.rehabUsed)) +
        ln('Loan Interest', money(r.interest)) + ln('Property Taxes' + (i.propertyTaxes === '' ? ' (Auto)' : ''), money(r.taxHold)) + ln('Insurance' + (i.insuranceHold === '' ? ' (Auto)' : ''), money(r.insuranceHold)) + ln('Utilities' + (i.utilities === '' ? ' (Auto)' : ''), money(r.utilitiesHold)) + ln('Holding Costs (Total)', money(r.holdingCosts)) + ln('Selling Costs', money(r.sellingCosts)) + ln('Total Cost', money(r.totalCost), 'tot') +
        ln('Profit', sMoney(r.profit), 'tot') + ln('Cash Invested', money(r.cashInvested)) + ln('Return On Cash', sPct(r.roiCash)) + ln('Return On Total Cost', sPct(r.roiCost)) +
        ln('Annualized Simple / Compound', r.simpleAnnual == null ? '—' : sPct(r.simpleAnnual) + ' / ' + sPct(r.compoundAnnual)) + '</div>' +
        (r.over80 ? '<p class="note bad" style="margin-top:12px">Purchase price is over 80% of the sale price.</p>' : '');
      var bi = r.items.buying, si = r.items.selling, byName = function (list, nm) { return (list.filter(function (x) { return x[0] === nm; })[0] || [0, 0])[1]; };
      var amap = { buyEscrowPct: byName(bi, 'Escrow Fee'), buyTitlePct: byName(bi, 'Title / Lender Policy'), listingPct: byName(si, 'Listing Commission'), buyerPct: byName(si, 'Buyer Commission'), sellEscrowPct: byName(si, 'Escrow Fee'), sellTitlePct: byName(si, 'Owner’s Title Policy'), countyTTper1k: byName(si, 'County Transfer Tax'), cityTTper1k: byName(si, 'City Transfer Tax') };
      document.querySelectorAll('#cf [data-amt]').forEach(function (el) { el.textContent = '= ' + money(amap[el.dataset.amt] || 0); });
      var brk = function (title, list, tot) { var rows = list.filter(function (x) { return x[1]; }); return '<details class="brk" open><summary>' + title + ' <span class="num">' + money(tot) + '</span></summary><div class="lines">' + rows.map(function (x) { return ln(esc(x[0]), money(x[1])); }).join('') + '</div></details>'; };
      document.getElementById('cres').insertAdjacentHTML('beforeend', brk('Buying Costs At Purchase (Itemized)', bi, r.buyClosingAll) + brk('Selling Costs (Itemized)', si, r.sellingCosts));
      var t = r.items.tax, auto = i.autoProrations === 'true' || i.autoProrations === true;
      var dn = function (iso) { return iso ? fmtDate(iso) : '—'; };
      document.getElementById('taxnote').innerHTML = !auto ? '' : t ? 'Taxes: ' + esc(i.taxRatePct) + '% of the purchase price = ' + money(t.annual) + '/yr, California fiscal year Jul 1–Jun 30, installments due Nov 1 and Feb 1, prorated over a 365-day year. ' +
        'At purchase (' + dn(t.close) + ') ' + (t.buyPaid ? 'the seller has paid this half, so you reimburse ' + t.buyDays + ' days.' : 'the seller has not paid this half, so the seller credits you ' + t.buyDays + ' days.') + ' ' +
        'At sale (' + dn(t.sale) + ') ' + (t.sellPaid ? 'you have paid this half, so the buyer credits you ' + t.sellDays + ' days.' : 'you have not paid this half, so you credit the buyer ' + t.sellDays + ' days.') + ' ' +
        (t.count ? 'Holding taxes are the ' + t.count + ' installment' + (t.count === 1 ? '' : 's') + ' (' + money(t.annual / 2) + ' each) due while you own it' : 'No installment comes due while you own it, so holding taxes are $0') + ', so nothing is counted twice. Prepaid insurance covers the first 12 months; holding insurance only counts time past that.'
        : 'Add a purchase / close date to auto-calculate tax prorations. Until then holding taxes are ' + esc(i.taxRatePct) + '% a year for the days held. Prepaid insurance covers the first 12 months; holding insurance only counts time past that.';
      var ph = { propertyTaxes: r.taxHold, insuranceHold: r.insuranceHold, utilities: r.utilitiesHold, insurancePrepaid: r.insurancePrepaid, taxProration: r.taxProrationBuy, sellTaxProration: r.taxProrationSell, payoffDate: r.saleDate }; document.querySelectorAll('#cf [data-auto]').forEach(function (el) { var k = el.dataset.auto; if (k === 'payoffDate') { el.title = ph.payoffDate ? 'Auto: ' + fmtDate(ph.payoffDate) : ''; return; } var v = ph[k] || 0; el.placeholder = 'Auto: ' + (k === 'taxProration' || k === 'sellTaxProration' ? money(Math.abs(v)) + (v < 0 ? ' credit to you' : v > 0 ? ' you pay' : '') : money(v)); });
      var kp = function (k, v, cls) { return '<div class="ck' + (cls ? ' ' + cls : '') + '"><div class="k">' + k + '</div><div class="v num">' + v + '</div></div>'; };
      var ratio = C.n(i.salePrice) && C.n(i.purchasePrice) ? C.n(i.purchasePrice) / C.n(i.salePrice) : null;
      document.getElementById('ckpi').innerHTML = kp('Projected Profit', sMoney(r.profit, 0), r.profit < 0 ? 'bad' : 'good') + kp('Return On Cash', sPct(r.roiCash)) +
        kp('Purchase / ARV', ratio == null ? '—' : pct(ratio, 1), r.over80 ? 'bad' : '') + kp('Total Cost', money(r.totalCost, 0));
      // Max offer (80% of ARV − rehab) lives in the Purchase Price field as a grayed suggestion, updated live.
      var sug = C.n(i.salePrice) ? 'Suggested max: ' + money(r.maxOffer, 0) + ' (80% ARV − Rehab)' : 'Suggested max: add the ARV (80% ARV − Rehab)';
      document.getElementById('maxhint').textContent = sug;
      animate(); return { i: i, r: r };
    };
    ['ctop', 'cf'].forEach(function (id) { var fm = document.getElementById(id); fm.addEventListener('input', paint); fm.addEventListener('change', paint); }); paint();
    document.getElementById('save').onclick = function () {
      var b = this, x = paint(), i = x.i; b.disabled = true;
      var inputs2 = Object.assign({}, i); delete inputs2.name; delete inputs2.address; delete inputs2.flipId;
      api('saveEstimate', { estimate: { id: est ? est.id : '', name: i.name, address: i.address, flipId: est ? est.flipId || '' : '', inputs: inputs2, results: x.r } })
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
  function sPctTxt(v) { return v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(1) + '%'; }
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
      (can ? '<button class="btn gold" id="ed">Edit Numbers</button>' : '') + '</div></div>';
    html += '<div class="grid g4" style="margin-top:4px">' +
      kpi('Equity', sMoney(x.equity, 0), (x.value ? money(x.value, 0) + ' value' : 'Needs value') + ' − ' + money(x.loanBalance, 0) + ' loan', x.equity < 0 ? 'bad' : 'good') +
      kpi('Monthly Cash Flow', x.hasIncome ? sMoney(x.monthlyCashFlow, 0) : '<span class="pill warn">Needs Data</span>', x.hasIncome ? money(x.noi, 0) + ' annual NOI' : (x.rent ? money(x.rent, 0) + ' rent; add monthly expenses' : 'Add rent and monthly expenses')) +
      kpi('Cash-On-Cash', x.hasIncome ? sPct(x.cashOnCash) : '—', 'Annual cash flow ÷ cash in') +
      kpi('Total Return', sPct(x.totalRoi), 'Equity gain plus a year of cash flow') + '</div>';
    html += '<div class="grid g2" style="margin-top:22px"><div class="card rule"><h2>The Numbers</h2><p class="meta">Purchase, financing and what it earns</p><div class="lines">' +
      ln('Purchase Price', money(f.purchasePrice)) + ln('Closing Costs', money(f.buyClosingCosts)) + ln('Improvements Spent', money(f.rehabSpent)) + ln('All-In Cost', money(x.allIn), 'tot') +
      ln('Original Loan' + (f.lender ? ' · ' + esc(f.lender) : ''), money(f.loanAmount)) + ln('Current Loan Balance', money(x.loanBalance)) + ln('Cash Invested', money(x.cashInvested), 'tot') +
      ln('Current Value', x.value ? money(x.value) : '<span class="pill warn">Needs Value</span>') + ln('Equity', sMoney(x.equity), 'tot') +
      ln('Monthly Rent', x.rent ? money(x.rent) : '<span class="pill warn">Needs Data</span>') + ln('Monthly Expenses', x.expenses ? money(x.expenses) : '<span class="pill warn">Needs Data</span>') + ln('Monthly Cash Flow', x.hasIncome ? sMoney(x.monthlyCashFlow) : '<span class="pill warn">Needs Data</span>', 'tot') + (x.hasIncome ? ln('Annual NOI (No Mortgage)', sMoney(x.noi), 'tot') : '') + (depositsHeld(f) ? ln('Security Deposits Held (Owed To Tenants)', money(depositsHeld(f))) : '') + '</div></div>' +
      '<div class="card rule"><h2>Return</h2><p class="meta">Equity gain plus cash flow on the cash you put in</p><div style="display:flex;justify-content:center;gap:18px;margin-top:10px">' +
      donut(x.equityRoi || 0, 1, pct(x.equityRoi, 0), 'Equity Gain', x.equityRoi == null ? 'gold' : (x.equityRoi >= 0 ? 'good' : 'bad')) + donut(x.cashOnCash || 0, 0.2, x.hasIncome ? pct(x.cashOnCash, 1) : '—', 'Cash-On-Cash', 'gold') + '</div>' +
      '<hr class="sep"><div class="mini"><div>Purchased<b>' + (fmtDate(f.purchaseDate) || '<span class="pill warn">Needs Date</span>') + '</b></div><div>Months Held<b>' + (x.monthsHeld == null ? '—' : x.monthsHeld) + '</b></div><div>Value Vs All-In<b>' + sMoney(x.value ? x.value - x.allIn : 0, 0) + '</b></div></div></div></div>';
    if (isOwner()) html += '<div class="label">Expenses</div><div id="proex"></div>';
    html += '<div class="label">Inventory Needs List</div><div id="invlist"></div>';
    if (f.estimates && f.estimates.length) html += '<div class="label">Estimates Tied To This Holding</div>' + estTable(f.estimates);
    $app.innerHTML = html; animate();
    renderInventory('flip', f.id, f.inventory || [], can); propExpenses(f);
    var st = document.getElementById('st');
    if (st) st.onchange = function () { api('setStatus', { id: f.id, status: st.value }).then(function () { toast('Status set to ' + st.value + '.'); S.flips = null; viewFlip(f.id); }).catch(function (e) { fail(e); st.value = f.status; }); };
    var ed = document.getElementById('ed'); if (ed) ed.onclick = function () { editFlip(f); };
    if (typeof bindEstRows === 'function') bindEstRows();
  }

  /* ---------- LANA HOMES Expenses (owner only) ---------- */
  var EX = { items: [], cats: [], f: { link: '', cat: '', from: '', to: '', q: '' } };
  function exLinkLabel(e) { return e.linkType === 'general' || !e.linkId ? 'General LLC' : (e.linkName || e.linkId); }
  function exFiltered() {
    var f = EX.f, q = f.q.toLowerCase();
    return EX.items.filter(function (e) {
      if (f.cat && e.category !== f.cat) return false;
      if (f.from && (!e.date || e.date < f.from)) return false;
      if (f.to && (!e.date || e.date > f.to)) return false;
      if (q && (e.payee + ' ' + e.notes + ' ' + e.method + ' ' + payerOf(e)).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) { return (b.date || '0') < (a.date || '0') ? -1 : 1; });
  }
  var PB_RE = /^Paid by:\s*([^·]+?)\s*(?:·\s*|$)/;
  function payerOf(e) { if (e.paidBy) return e.paidBy; var m = PB_RE.exec(e.notes || ''); return m ? m[1] : ''; }
  function notesOf(e) { return String(e.notes || '').replace(PB_RE, ''); }
  function isGeneralExp(e) { return !e.linkId || !e.linkType || e.linkType === 'general' || e.linkType === 'llc'; }
  function viewExpenses() {
    loading();
    Promise.all([api('listExpenses'), loadFlips(true)]).then(function (res) {
      // The ledger page holds only General LLC (misc) expenses; property expenses live on each flip or holding.
      EX.items = res[0].items.filter(isGeneralExp);
      EX.cats = res[0].categories; EX.props = res[1]; EX.after = viewExpenses;
      drawExpenses();
    }).catch(fail);
  }
  function drawExpenses() {
    var rows = exFiltered(), f = EX.f;
    var total = rows.reduce(function (s, e) { return s + e.amount; }, 0);
    var byCat = {}; rows.forEach(function (e) { byCat[e.category || 'Other'] = (byCat[e.category || 'Other'] || 0) + e.amount; });
    var byLink = {}; rows.forEach(function (e) { var k = exLinkLabel(e); byLink[k] = (byLink[k] || 0) + e.amount; });
    var need = rows.filter(function (e) { return /Needs (Date|Amount)/.test(e.notes); }).length;
    var opt = function (v, l, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(l) + '</option>'; };
    var html = '<div class="spread"><div><h1>LLC Expenses</h1><p class="lead">General and misc LANA HOMES LLC expenses not tied to a flip or holding. Property expenses live on each property. Only you can see this.</p></div><div class="row"><button class="btn" id="csv">Export CSV</button><button class="btn gold" id="nx">Add Expense</button></div></div>';
    html += '<div class="card"><div class="calcgrid">' +
      '<div class="field"><label>Category</label><select id="xc">' + opt('', 'All', f.cat) + EX.cats.map(function (c) { return opt(c, c, f.cat); }).join('') + '</select></div>' +
      '<div class="field"><label>From</label><input type="date" id="xf" value="' + esc(f.from) + '"></div><div class="field"><label>To</label><input type="date" id="xt" value="' + esc(f.to) + '"></div>' +
      '<div class="field"><label>Search</label><input id="xq" value="' + esc(f.q) + '" placeholder="Payee, notes, method"></div></div></div>';
    html += '<div class="grid g4" style="margin-top:22px">' + kpi('Total', money(total), rows.length + ' entr' + (rows.length === 1 ? 'y' : 'ies')) +
      kpi('This Year', money(rows.filter(function (e) { return (e.date || '').slice(0, 4) === todayISO().slice(0, 4); }).reduce(function (s, e) { return s + e.amount; }, 0)), todayISO().slice(0, 4) + ' entries') + kpi('Categories', String(Object.keys(byCat).length), 'In this view') +
      kpi('Needs Info', String(need), 'Missing a date or amount', need ? 'bad' : '') + '</div>';
    html += '<div class="grid g2" style="margin-top:22px"><div class="card"><h2>By Category</h2><div class="lines">' + Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; }).map(function (k) { return '<div class="ln"><span>' + esc(k) + '</span><span class="num">' + money(byCat[k]) + '</span></div>'; }).join('') + '</div></div>' +
      '<div class="card"><h2>Top Categories</h2>' + hbars(Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; }).slice(0, 6).map(function (k) { return { label: k, value: byCat[k], display: money(byCat[k], 0) }; })) + '</div></div>';
    html += '<div class="label">Entries</div><div class="card tblwrap"><table class="t"><thead><tr><th>Date</th><th>Payee</th><th>Category</th><th>Paid By</th><th>Method</th><th class="r">Amount</th><th>Receipt</th><th></th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (e) {
        return '<tr><td>' + (fmtDate(e.date) || '<span class="pill warn">' + (/Projected/.test(e.notes) ? 'At Sale' : 'Needs Date') + '</span>') + '</td><td><b>' + esc(e.payee) + '</b>' + (notesOf(e) ? '<div class="meta">' + esc(notesOf(e)) + '</div>' : '') + '</td><td>' + esc(e.category) + '</td><td>' + (payerOf(e) ? esc(payerOf(e)) : '<span class="meta">—</span>') + '</td><td class="meta">' + esc(e.method) + '</td>' +
          '<td class="r num">' + money(e.amount) + '</td><td>' + (e.receiptUrl ? '<a href="' + esc(e.receiptUrl) + '" target="_blank" rel="noopener">View</a>' : '<span class="meta">—</span>') + '</td>' +
          '<td class="r"><button class="btn sm" data-xe="' + esc(e.id) + '">Edit</button> <button class="btn sm danger" data-xd="' + esc(e.id) + '">Delete</button></td></tr>';
      }).join('') : '<tr><td colspan="8" class="empty">No expenses match.</td></tr>') + '</tbody></table></div>';
    $app.innerHTML = html;
    var bindF = function (id, k) { var el = document.getElementById(id); el.onchange = function () { EX.f[k] = el.value; drawExpenses(); }; };
    bindF('xc', 'cat'); bindF('xf', 'from'); bindF('xt', 'to');
    var xq = document.getElementById('xq'); xq.onchange = function () { EX.f.q = xq.value; drawExpenses(); };
    document.getElementById('nx').onclick = function () { editExpense(null); };
    document.getElementById('csv').onclick = function () { exportCsv(rows); };
    document.querySelectorAll('[data-xe]').forEach(function (b) { b.onclick = function () { editExpense(EX.items.filter(function (e) { return e.id === b.dataset.xe; })[0]); }; });
    document.querySelectorAll('[data-xd]').forEach(function (b) { b.onclick = function () { confirmBox('Delete Expense', '<p>Remove this entry from the ledger? Its receipt stays in Drive.</p>', 'Delete', function () { api('deleteExpense', { id: b.dataset.xd }).then(function () { toast('Deleted.'); (EX.after || viewExpenses)(); }).catch(fail); }); }; });
  }
  function csvCell(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  // Expenses tied to one flip or holding (owner only; the server rejects everyone else).
  function propExpenses(f) {
    var host = document.getElementById('proex'); if (!host || !isOwner()) return;
    host.innerHTML = '<div class="loading">Loading…</div>';
    Promise.all([api('listExpenses'), loadFlips()]).then(function (res) {
      EX.cats = res[0].categories; EX.props = res[1] || []; EX.after = function () { propExpenses(f); };
      var rows = res[0].items.filter(function (e) { return e.linkId === f.id; }).sort(function (a, b) { return (b.date || '0') < (a.date || '0') ? -1 : 1; });
      var total = rows.reduce(function (t, e) { return t + e.amount; }, 0), byCat = {};
      rows.forEach(function (e) { byCat[e.category || 'Other'] = (byCat[e.category || 'Other'] || 0) + e.amount; });
      var byPay = {}; rows.forEach(function (e) { var k = payerOf(e) || 'Not recorded'; byPay[k] = (byPay[k] || 0) + e.amount; });
      var pays = Object.keys(byPay).sort(function (a, b) { return byPay[b] - byPay[a]; }).map(function (k) { return '<span class="pill">' + esc(k) + ' ' + money(byPay[k], 0) + '</span>'; }).join(' ');
      var cats = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; }).slice(0, 3).map(function (k) { return esc(k) + ' ' + money(byCat[k], 0); }).join(' · ');
      host.innerHTML = '<div class="card tblwrap"><div class="spread" style="padding:16px 18px 14px;align-items:center"><div><div class="kpi"><div class="k">Total Expenses</div><div class="v" style="font-size:24px;margin-top:6px">' + money(total) + '</div><div class="meta">' + rows.length + ' entr' + (rows.length === 1 ? 'y' : 'ies') + (cats ? ' · ' + cats : '') + '</div>' + (rows.length ? '<div class="paidby" style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px"><span class="meta" style="align-self:center">Paid by</span> ' + pays + '</div>' : '') + '</div></div>' +
        '<div class="row"><button class="btn sm" id="pxcsv">Export CSV</button><button class="btn sm gold" id="pxadd">Add Expense</button></div></div>' +
        '<table class="t"><thead><tr><th>Date</th><th>Payee</th><th>Category</th><th>Paid By</th><th>Method</th><th class="r">Amount</th><th>Receipt</th><th></th></tr></thead><tbody>' +
        (rows.length ? rows.map(function (e) {
          return '<tr><td>' + (fmtDate(e.date) || '<span class="pill warn">' + (/Projected/.test(e.notes) ? 'At Sale' : 'Needs Date') + '</span>') + '</td><td><b>' + esc(e.payee) + '</b>' + (notesOf(e) ? '<div class="meta">' + esc(notesOf(e)) + '</div>' : '') + '</td><td>' + esc(e.category) + '</td><td>' + (payerOf(e) ? esc(payerOf(e)) : '<span class="meta">—</span>') + '</td><td class="meta">' + esc(e.method) + '</td>' +
            '<td class="r num">' + money(e.amount) + '</td><td>' + (e.receiptUrl ? '<a href="' + esc(e.receiptUrl) + '" target="_blank" rel="noopener">View</a>' : '<span class="meta">—</span>') + '</td>' +
            '<td class="r"><button class="btn sm" data-xe="' + esc(e.id) + '">Edit</button> <button class="btn sm danger" data-xd="' + esc(e.id) + '">Delete</button></td></tr>';
        }).join('') : '<tr><td colspan="8" class="empty">No expenses on this property yet.</td></tr>') + '</tbody></table></div>';
      document.getElementById('pxadd').onclick = function () { editExpense(null, f); };
      document.getElementById('pxcsv').onclick = function () { exportCsv(rows); };
      host.querySelectorAll('[data-xe]').forEach(function (b) { b.onclick = function () { editExpense(rows.filter(function (e) { return e.id === b.dataset.xe; })[0]); }; });
      host.querySelectorAll('[data-xd]').forEach(function (b) { b.onclick = function () { confirmBox('Delete Expense', '<p>Remove this entry from the ledger? Its receipt stays in Drive.</p>', 'Delete', function () { api('deleteExpense', { id: b.dataset.xd }).then(function () { toast('Deleted.'); propExpenses(f); }).catch(fail); }); }; });
    }).catch(function (e) { host.innerHTML = '<p class="empty">' + esc(e.message || 'Could not load expenses.') + '</p>'; });
  }
  function exportCsv(rows) {
    var head = ['Date', 'Payee', 'Category', 'Amount', 'Paid By', 'Method', 'Property', 'Notes', 'Receipt'];
    var lines = [head.join(',')].concat(rows.map(function (e) { return [e.date, e.payee, e.category, e.amount.toFixed(2), payerOf(e), e.method, exLinkLabel(e), notesOf(e), e.receiptUrl].map(csvCell).join(','); }));
    var blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'LANA HOMES Expenses ' + todayISO() + '.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function readB64(file) { return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(',')[1] || ''); }; r.onerror = no; r.readAsDataURL(file); }); }
  function editExpense(e, prop) {
    var isNew = !e; e = e || { date: todayISO(), linkType: prop ? (isHolding(prop) ? 'holding' : 'flip') : 'general', linkId: prop ? prop.id : '', category: '', amount: '', method: 'LLC Card' };
    var cur = e.linkType === 'general' || !e.linkId ? 'general' : e.linkId;
    modal('<h2>' + (isNew ? 'Add Expense' : 'Edit Expense') + '</h2><div class="calcgrid">' +
      '<div class="field"><label>Date</label><input type="date" id="ed1" value="' + esc(e.date) + '"></div><div class="field"><label>Payee</label><input id="ed2" value="' + esc(e.payee || '') + '"></div>' +
      '<div class="field"><label>Category</label><select id="ed3">' + EX.cats.map(function (c) { return '<option' + (c === e.category ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>Amount (Negative For A Refund)</label><input id="ed4" inputmode="decimal" value="' + esc(e.amount) + '"></div>' +
      '<div class="field"><label>Paid By</label><input id="ed9" list="ed9l" value="' + esc(payerOf(e)) + '" placeholder="Enrique, Zina, Aldo, Escrow"><datalist id="ed9l"><option>Enrique</option><option>Zina</option><option>Aldo</option><option>Escrow (at sale)</option><option>LANA HOMES LLC</option></datalist></div>' +
      '<div class="field"><label>Method</label><input id="ed5" value="' + esc(e.method || '') + '" placeholder="LLC Card, Zelle, Check"></div>' +
      '<div class="field"><label>Property</label><select id="ed6"><option value="general">General LLC</option>' + EX.props.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === cur ? ' selected' : '') + '>' + (isHolding(p) ? 'Holding · ' : 'Flip · ') + esc(p.address) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="field"><label>Notes</label><textarea id="ed7" rows="2">' + esc(notesOf(e)) + '</textarea></div>' +
      '<div class="field"><label>Receipt (PDF Or Photo, Under 10 MB)' + (e.receiptUrl ? ' · <a href="' + esc(e.receiptUrl) + '" target="_blank" rel="noopener">Current</a>' : '') + '</label><input type="file" id="ed8" accept="application/pdf,image/jpeg,image/png,image/heic,image/webp"></div>' +
      '<div class="row"><button class="btn gold" id="ok">Save</button><button class="btn" id="cx">Cancel</button></div>', function () {
      document.getElementById('cx').onclick = closeModal;
      document.getElementById('ok').onclick = function () {
        var b = this; b.disabled = true;
        var link = document.getElementById('ed6').value;
        var body = { id: e.id || '', date: document.getElementById('ed1').value, payee: document.getElementById('ed2').value, category: document.getElementById('ed3').value,
          amount: C.n(document.getElementById('ed4').value), method: document.getElementById('ed5').value, paidBy: document.getElementById('ed9').value.trim(), notes: document.getElementById('ed7').value,
          linkType: link === 'general' ? 'general' : 'flip', linkId: link === 'general' ? '' : link };
        // Keep the payer in the notes too, so it shows even before the backend stores paidBy natively.
        body.notes = (body.paidBy ? 'Paid by: ' + body.paidBy + (body.notes.trim() ? ' · ' : '') : '') + body.notes.trim();
        var file = document.getElementById('ed8').files[0];
        var up = file ? (file.size > 10 * 1024 * 1024 ? Promise.reject(new Error('Receipts must be under 10 MB.')) : readB64(file).then(function (d) { return api('uploadReceipt', { name: file.name, mime: file.type, data: d }); })) : Promise.resolve(null);
        up.then(function (r) { if (r) { body.receiptId = r.receiptId; body.receiptName = r.receiptName; } return api('saveExpense', { expense: body }); })
          .then(function () { closeModal(); toast('Saved.'); (EX.after || viewExpenses)(); }).catch(fail).then(function () { b.disabled = false; });
      };
    });
  }

  /* ---------- admin ---------- */
  function viewAdmin() {
    loading();
    Promise.all([api('listUsers'), loadFlips(true)]).then(function (res) {
      var users = res[0], flips = res[1].filter(function (f) { return !isHolding(f); });
      var html = '<div class="spread"><div><h1>Admin</h1><p class="lead">Invite people to specific flips. They only see what they’re invited to. Holdings stay private to you. Only you can grant Admin on a flip.</p></div><div class="row" style="margin-bottom:18px"><button class="btn gold" id="nf">New Flip</button><a class="btn" href="#/estimates">All Estimates</a></div></div>';
      html += '<div class="label">Invite Someone</div><div class="card rule"><div class="calcgrid"><div class="field"><label>Email</label><input id="aem" type="email"></div><div class="field"><label>Name (Optional)</label><input id="anm"></div>' +
        '<div class="field"><label>Flip</label><select id="afl">' + flips.map(function (f) { return '<option value="' + esc(f.id) + '">' + esc(f.address) + ' · ' + esc(f.status) + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label>Role</label><select id="arl"><option value="member">Member — View Only</option><option value="admin">Admin On This Flip</option></select></div></div><button class="btn gold" id="ainv">Send Invite</button></div>';
      html += '<div class="label">Users</div><div class="card tblwrap"><table class="t"><thead><tr><th>User</th><th>Flips</th><th class="r">Estimates</th><th>Last Sign-In</th><th></th></tr></thead><tbody>' +
        users.map(function (u) {
          return '<tr><td><b>' + esc(u.name || u.email) + '</b>' + (u.role === 'owner' ? ' <span class="pill admin">Owner</span>' : '') + (u.active ? '' : ' <span class="pill warn">Off</span>') + '<div class="meta">' + esc(u.email) + '</div></td>' +
            '<td>' + (u.role === 'owner' ? '<span class="meta">Everything</span>' : (u.flips.filter(function (f) { return f.kind !== 'holding'; }).length ? u.flips.filter(function (f) { return f.kind !== 'holding'; }).map(function (f) { return '<a class="pill' + (f.role === 'admin' ? ' admin' : '') + '" style="margin:2px;text-decoration:none" href="#/flip/' + esc(f.flipId) + '">' + esc(f.address) + (f.role === 'admin' ? ' · Admin' : '') + '</a>'; }).join('') : '<span class="meta">None</span>')) + '</td>' +
            '<td class="r num">' + u.estimates + '</td><td class="meta">' + (u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never') + '</td>' +
            '<td class="r">' + (u.role === 'owner' ? '' : '<button class="btn sm' + (u.active ? ' danger' : '') + '" data-act="' + esc(u.id) + '" data-on="' + (u.active ? '0' : '1') + '">' + (u.active ? 'Turn Off' : 'Turn On') + '</button>') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      $app.innerHTML = html;
      document.getElementById('nf').onclick = function () { editFlip(null); };
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
