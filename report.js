/* LANA HOMES LLC — branded PDF reports (jsPDF + AutoTable, loaded on demand). Uses only data already on screen,
   so a member's PDF never holds more than they can see. */
(function (root) {
  var BLACK = [0, 0, 7], WHITE = [251, 251, 251], GOLD1 = [234, 213, 158], GOLD2 = [213, 190, 135], RED1 = [239, 2, 7], RED2 = [154, 0, 7], INK = [40, 40, 46], MUTED = [120, 120, 128], LINE = [228, 226, 220];
  var libs = null;
  function loadScript(src) { return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { no(new Error('Could not load the PDF tools. Check your connection and try again.')); }; document.head.appendChild(s); }); }
  function load() {
    if (libs) return libs;
    var v = (document.querySelector('script[src*="report.js"]') || {}).src || ''; v = (v.split('?')[1] || '');
    libs = loadScript('vendor/jspdf.umd.min.js?' + v).then(function () { return loadScript('vendor/jspdf.plugin.autotable.min.js?' + v); });
    libs.catch(function () { libs = null; });
    return libs;
  }
  function n(v) { var x = Number(String(v == null ? '' : v).replace(/[$,\s%]/g, '')); return isFinite(x) ? x : 0; }
  // Helvetica only covers WinAnsi, so swap the few characters it can't draw.
  function t(s) { return String(s == null ? '' : s).replace(/[\u2212\u2012\u2013\u2014]/g, function (c) { return c === '\u2014' ? '-' : '-'; }).replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u2026/g, '...').replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, ''); }
  function money(v, d) { var x = n(v), s = Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); return (x < 0 ? '-$' : '$') + s; }
  function pct(v, d) { return v == null || !isFinite(v) ? '-' : (v * 100).toFixed(d == null ? 1 : d) + '%'; }
  function fdate(iso) { if (!iso) return ''; var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? (+m[2]) + '/' + (+m[3]) + '/' + m[1] : String(iso); }
  function stamp() { return new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }

  function Doc(kind, title, sub, who) {
    var J = root.jspdf.jsPDF, doc = new J({ unit: 'pt', format: 'letter' }), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
    var self = { doc: doc, W: W, H: H, M: M, y: 0 };
    var headered = {};
    function header() {
      headered[doc.internal.getCurrentPageInfo().pageNumber] = 1;
      doc.setFillColor.apply(doc, BLACK); doc.rect(0, 0, W, 78, 'F');
      doc.setFillColor.apply(doc, GOLD1); doc.rect(0, 78, W / 2, 3, 'F'); doc.setFillColor.apply(doc, GOLD2); doc.rect(W / 2, 78, W / 2, 3, 'F');
      doc.setFillColor.apply(doc, GOLD1); doc.roundedRect(M, 22, 34, 34, 6, 6, 'F');
      doc.setTextColor.apply(doc, BLACK); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('LH', M + 17, 44, { align: 'center' });
      doc.setTextColor.apply(doc, GOLD1); doc.setFontSize(15); doc.text('LANA HOMES LLC', M + 46, 37, { charSpace: 1.2 });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(200, 200, 205); doc.text('INVESTMENTS', M + 46, 50, { charSpace: 2 });
      doc.setTextColor.apply(doc, WHITE); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(t(kind.toUpperCase()), W - M, 37, { align: 'right', charSpace: 1 });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(200, 200, 205); doc.text(t('Generated ' + stamp()), W - M, 50, { align: 'right' });
    }
    self.header = header;
    header();
    doc.setTextColor.apply(doc, BLACK); doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text(t(title), M, 116);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor.apply(doc, MUTED);
    var subl = doc.splitTextToSize(t(sub || ''), W - 2 * M); doc.text(subl, M, 133);
    self.y = 133 + subl.length * 12 + 8;
    self.ensure = function (h) { if (self.y + h > H - 50) { doc.addPage(); header(); self.y = 104; } };
    self.section = function (label) {
      self.ensure(40); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor.apply(doc, GOLD2); doc.text(t(label.toUpperCase()), M, self.y + 10, { charSpace: 1.4 });
      doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.6); doc.line(M + doc.getTextWidth(t(label.toUpperCase())) + label.length * 1.4 + 8, self.y + 7, W - M, self.y + 7); self.y += 20;
    };
    self.hero = function (label, value, note, loss) {
      self.ensure(78); var c1 = loss ? RED1 : BLACK, c2 = loss ? RED2 : [27, 26, 23];
      doc.setFillColor.apply(doc, c1); doc.roundedRect(M, self.y, W - 2 * M, 66, 8, 8, 'F');
      // A soft fade toward the right edge (gold glow on black, darker red on red).
      var bw = W - 2 * M, x0 = M + bw * 0.5, step = (W - M - 8 - x0) / 16, col;
      for (var s = 0; s < 16; s++) { col = c1.map(function (v, k) { return Math.round(v + ((loss ? c2 : [52, 46, 34])[k] - v) * (s + 1) / 16); }); doc.setFillColor.apply(doc, col); doc.rect(x0 + step * s, self.y, step + 0.6, 66, 'F'); }
      doc.roundedRect(W - M - 16, self.y, 16, 66, 8, 8, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, loss ? [255, 255, 255] : GOLD1); doc.text(t(label.toUpperCase()), M + 16, self.y + 20, { charSpace: 1.5 });
      doc.setFontSize(26); doc.setTextColor.apply(doc, loss ? [255, 255, 255] : GOLD1); doc.text(t(value), M + 16, self.y + 48);
      if (note) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(235, 235, 238); doc.text(t(note), W - M - 16, self.y + 48, { align: 'right' }); }
      self.y += 80;
    };
    self.kpis = function (list) {
      self.ensure(60); var gap = 10, w = (W - 2 * M - gap * (list.length - 1)) / list.length;
      list.forEach(function (k, i) {
        var x = M + i * (w + gap); doc.setFillColor.apply(doc, WHITE); doc.setDrawColor.apply(doc, LINE); doc.roundedRect(x, self.y, w, 48, 6, 6, 'FD');
        doc.setFillColor.apply(doc, k[2] === 'bad' ? RED1 : GOLD1); doc.rect(x + 8, self.y, w - 16, 2, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, MUTED); doc.text(t(k[0].toUpperCase()), x + 10, self.y + 17, { charSpace: 0.8 });
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor.apply(doc, k[2] === 'bad' ? RED2 : BLACK); doc.text(t(k[1]), x + 10, self.y + 36);
      });
      self.y += 60;
    };
    self.table = function (head, body, opts) {
      opts = opts || {};
      doc.autoTable(Object.assign({
        startY: self.y, head: head ? [head.map(t)] : undefined, body: body.map(function (r) { return r.map(function (c) { return c && typeof c === 'object' ? Object.assign({}, c, { content: t(c.content) }) : t(c); }); }),
        margin: { left: M, right: M, top: 104, bottom: 50 }, theme: 'plain',
        styles: { font: 'helvetica', fontSize: 9, textColor: INK, cellPadding: { top: 4, bottom: 4, left: 6, right: 6 }, lineColor: LINE, lineWidth: { bottom: 0.5 } },
        headStyles: { fillColor: BLACK, textColor: GOLD1, fontStyle: 'bold', fontSize: 8, lineWidth: 0 },
        alternateRowStyles: { fillColor: WHITE },
        didParseCell: function (d) { var cs = (opts.columnStyles || {})[d.column.index]; if (d.section === 'head' && cs && cs.halign) d.cell.styles.halign = cs.halign; },
        willDrawPage: function () { if (!headered[doc.internal.getCurrentPageInfo().pageNumber]) header(); }
      }, opts));
      self.y = doc.lastAutoTable.finalY + 16;
    };
    self.lines = function (rows, opts) {
      // rows: [label, value, bold?]
      self.table(null, rows.map(function (r) { return [{ content: r[0], styles: r[2] ? { fontStyle: 'bold', textColor: BLACK } : {} }, { content: r[1], styles: Object.assign({ halign: 'right' }, r[2] ? { fontStyle: 'bold', textColor: BLACK } : {}, r[3] === 'bad' ? { textColor: RED2 } : {}) }]; }), Object.assign({ columnStyles: { 1: { cellWidth: 150 } } }, opts || {}));
    };
    self.note = function (s) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, MUTED);
      var l = doc.splitTextToSize(t(s), W - 2 * M); self.ensure(l.length * 11 + 6); doc.text(l, M, self.y); self.y += l.length * 11 + 8;
    };
    self.finish = function () {
      var pages = doc.getNumberOfPages();
      for (var p = 1; p <= pages; p++) {
        doc.setPage(p); doc.setDrawColor.apply(doc, GOLD2); doc.setLineWidth(0.8); doc.line(M, H - 34, W - M, H - 34);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, MUTED);
        doc.text(t('LANA HOMES LLC · Confidential' + (who ? ' · Prepared for ' + who : '')), M, H - 22); doc.text('Page ' + p + ' of ' + pages, W - M, H - 22, { align: 'right' });
      }
      return doc;
    };
    return self;
  }

  function expensesSection(R, rows) {
    if (!rows) return;
    R.section('Expenses');
    if (!rows.length) { R.note('No expenses recorded on this property.'); return; }
    var total = 0, by = {}; rows.forEach(function (e) { total += n(e.amount); var k = e.payer || 'Not recorded'; by[k] = (by[k] || 0) + n(e.amount); });
    R.lines(Object.keys(by).sort(function (a, b) { return by[b] - by[a]; }).map(function (k) { return ['Paid by ' + k, money(by[k])]; }).concat([['Total (' + rows.length + ' entries)', money(total), true]]));
    R.table(['Date', 'Payee', 'Category', 'Paid By', 'Method', 'Amount'], rows.map(function (e) {
      return [e.date ? fdate(e.date) : (/Projected/.test(e.notes || '') ? 'At sale' : '-'), e.payee + (e.note ? '\n' + e.note : ''), e.category || '', e.payer || '-', e.method || '', { content: money(e.amount), styles: { halign: 'right' } }];
    }), { styles: { fontSize: 7.5, textColor: INK, cellPadding: 3, lineColor: LINE, lineWidth: { bottom: 0.4 } }, columnStyles: { 0: { cellWidth: 52 }, 2: { cellWidth: 74 }, 3: { cellWidth: 70 }, 4: { cellWidth: 58 }, 5: { cellWidth: 62, halign: 'right' } } });
  }
  function payoutSection(R, p) {
    if (!p) return;
    R.section(p.title || 'Purchase To Payout');
    var blk = function (title, rows, tot) { if (!rows || !rows.length) return; R.table([title, ''], rows.map(function (r) { return [r[0] + (r[2] ? '\n' + r[2] : ''), { content: money(r[1]), styles: { halign: 'right' } }]; }).concat(tot ? [[{ content: tot[0], styles: { fontStyle: 'bold', textColor: BLACK } }, { content: money(tot[1]), styles: { halign: 'right', fontStyle: 'bold', textColor: BLACK } }]] : []), { columnStyles: { 1: { cellWidth: 150 } } }); };
    blk('At Purchase', p.purchase, p.purchaseTotal); blk('Cash Invested By Partner', p.capital, p.capitalTotal);
    blk(p.saleLabel || 'At Sale Closing', p.sale, p.saleTotal); blk(p.paidLabel || 'Paid Out To', p.paid, p.paidTotal);
    if (p.source) R.note('Source: ' + p.source);
  }

  function flip(d) {
    var f = d.f, x = d.x, sold = f.status === 'Sold';
    var R = Doc('Flip Report', f.address, [f.city, f.partners, 'Status: ' + f.status].filter(Boolean).join(' · '), d.who);
    R.hero(sold ? (x.profit < 0 ? 'Loss' : 'Profit') : (x.profit < 0 ? 'Projected Loss' : 'Projected Profit'), money(x.profit, 0), (sold ? 'Sold for ' : 'At a ') + money(f.salePrice, 0) + (sold ? '' : ' sale'), x.profit < 0);
    R.kpis([['Return On Cash', pct(x.roiCash), x.roiCash < 0 ? 'bad' : ''], ['Return On Total Cost', pct(x.roiCost), x.roiCost < 0 ? 'bad' : ''], ['Cash Invested', money(f.cashInvested, 0)], [sold ? 'Annualized (Simple)' : 'Days Held So Far', sold ? pct(x.simpleAnnual) : String(x.daysHeld || '-')]]);
    R.section('The Numbers');
    var rows = [['Purchase Price', money(f.purchasePrice)], ['Loan' + (f.lender ? ' · ' + f.lender : ''), money(f.loanAmount)], ['Buying Closing Costs', money(f.buyClosingCosts)], ['Rehab Spent (Budget ' + money(f.rehabBudget, 0) + ')', money(f.rehabSpent)], ['Holding Costs (Interest, Taxes, Insurance)', money(f.holdingCosts)], ['Selling Costs', money(f.sellingCosts)]];
    if (n(f.otherCosts)) rows.push([f.otherCostsLabel || 'Other Costs', money(f.otherCosts)]);
    if (n(f.adjustments)) rows.push([f.adjustmentsLabel || 'Credits', '-' + money(f.adjustments)]);
    rows.push(['Total Cost', money(x.totalCost), true], [sold ? 'Sale Price' : 'Projected Sale Price', money(f.salePrice), true], [sold ? 'Profit' : 'Projected Profit', money(x.profit), true, x.profit < 0 ? 'bad' : '']);
    R.lines(rows);
    R.note('Purchased ' + (fdate(f.purchaseDate) || '(needs date)') + (sold ? ' · Sold ' + (fdate(f.saleDate) || '(needs date)') : '') + (f.datesNote ? ' · ' + f.datesNote : ''));
    if (x.investors && x.investors.length) { R.section('Investors'); R.table(['Investor', 'Capital', 'Split', 'Profit Share', 'Payout'], x.investors.map(function (i) { return [i.name, money(i.capital, 0), pct(i.split, 1), money(i.profitShare, 0), money(i.distribution, 0)]; }), { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' } } }); }
    payoutSection(R, x.payout);
    expensesSection(R, d.expenses);
    if (f.notes) { R.section('Notes'); R.note(f.notes); }
    return R.finish();
  }
  function holding(d) {
    var f = d.f, x = d.x;
    var R = Doc('Holding Report', f.address, [f.city, f.partners, 'Status: ' + f.status].filter(Boolean).join(' · '), d.who);
    R.hero('Equity', money(x.equity, 0), (x.value ? money(x.value, 0) + ' value' : 'Needs value') + ' - ' + money(x.loanBalance, 0) + ' loan', x.equity < 0);
    R.kpis([['Monthly Cash Flow', x.hasIncome ? money(x.monthlyCashFlow, 0) : 'Needs data', x.monthlyCashFlow < 0 ? 'bad' : ''], ['Cash-On-Cash', x.hasIncome ? pct(x.cashOnCash) : '-'], ['Equity Gain', pct(x.equityRoi)], ['Total Return', pct(x.totalRoi)]]);
    R.section('The Numbers');
    var rows = [['Purchase Price', money(f.purchasePrice)], ['Closing Costs', money(f.buyClosingCosts)], ['Improvements Spent', money(f.rehabSpent)], ['All-In Cost', money(x.allIn), true],
      ['Original Loan' + (f.lender ? ' · ' + f.lender : ''), money(f.loanAmount)], ['Current Loan Balance', money(x.loanBalance)], ['Cash Invested', money(x.cashInvested), true],
      ['Current Value', x.value ? money(x.value) : 'Needs value'], ['Equity', money(x.equity), true], ['Monthly Rent', x.rent ? money(x.rent) : 'Needs data'], ['Monthly Expenses', x.expenses ? money(x.expenses) : 'Needs data'], ['Monthly Cash Flow', x.hasIncome ? money(x.monthlyCashFlow) : 'Needs data', true]];
    if (x.hasIncome) rows.push(['Annual NOI (No Mortgage)', money(x.noi), true]);
    R.lines(rows);
    R.note('Purchased ' + (fdate(f.purchaseDate) || '(needs date)') + (x.monthsHeld != null ? ' · ' + x.monthsHeld + ' months held' : ''));
    expensesSection(R, d.expenses);
    if (f.notes) { R.section('Notes'); R.note(f.notes); }
    return R.finish();
  }
  function estimate(d) {
    var i = d.inputs, r = d.results, it = d.items || {}, loss = r.profit < 0;
    var R = Doc('Flip Estimate', i.address || 'Flip Estimate', d.savedLine || 'Unsaved estimate', d.who);
    R.hero(loss ? 'Estimated Loss' : 'Estimated Profit', money(r.profit, 0), 'At a ' + money(i.salePrice, 0) + ' ARV sale', loss);
    R.kpis([['Return On Cash', pct(r.roiCash), r.roiCash < 0 ? 'bad' : ''], ['Annualized (Simple)', pct(r.simpleAnnual)], ['Purchase / ARV', n(i.salePrice) && n(i.purchasePrice) ? pct(n(i.purchasePrice) / n(i.salePrice)) : '-', r.over80 ? 'bad' : ''], ['Suggested Max Offer', money(r.maxOffer, 0)]]);
    R.section('The Deal');
    R.lines([['Purchase Price', money(i.purchasePrice)], ['ARV Sales Price', money(i.salePrice)], ['Loan / LTV', money(r.loanAmount, 0) + ' · ' + pct(r.ltv)], ['Interest Rate / Points', (i.interestRate || 0) + '% / ' + (i.pointsPct || 0) + '%'],
      ['Purchase / Close Date', fdate(i.fundingDate) || '-'], ['Projected Sale Date', fdate(i.payoffDate || r.saleDate) || '-'], ['Days Held', String(r.daysHeld || '-')], ['Suggested Max Offer (80% ARV - Rehab)', money(r.maxOffer, 0)]]);
    R.section('Results');
    R.lines([['Cash To Close', money(r.cashToClose)], ['Buying Costs (Net, With Points)', money(r.buyingCosts)], ['Rehab (With Contingency)', money(r.rehabUsed)], ['Loan Interest', money(r.interest)], ['Property Taxes', money(r.taxHold)], ['Insurance', money(r.insuranceHold)], ['Utilities', money(r.utilitiesHold)],
      ['Holding Costs (Total)', money(r.holdingCosts)], ['Selling Costs', money(r.sellingCosts)], ['Total Cost', money(r.totalCost), true], [loss ? 'Loss' : 'Profit', money(r.profit), true, loss ? 'bad' : ''], ['Cash Invested', money(r.cashInvested)], ['Return On Cash', pct(r.roiCash)], ['Return On Total Cost', pct(r.roiCost)],
      ['Annualized Simple / Compound', r.simpleAnnual == null ? '-' : pct(r.simpleAnnual) + ' / ' + pct(r.compoundAnnual)]]);
    var itm = function (title, list, tot) { var rows = (list || []).filter(function (x) { return x[1]; }); if (!rows.length) return; R.table([title, money(tot)], rows.map(function (x) { return [x[0], { content: money(x[1]), styles: { halign: 'right' } }]; }), { columnStyles: { 1: { cellWidth: 150 } }, headStyles: { fillColor: BLACK, textColor: GOLD1, fontStyle: 'bold', fontSize: 8, halign: 'left' } }); };
    R.section('Itemized Costs'); itm('Buying Costs At Purchase', it.buying, r.buyClosingAll); itm('Selling Costs', it.selling, r.sellingCosts);
    if (d.taxNote) R.note(d.taxNote);
    return R.finish();
  }

  // Save: iPhone/iPad gets the share sheet (Save to Files); desktop downloads; anything else opens the PDF.
  function save(doc, name) {
    var blob = doc.output('blob'), file;
    try { file = new File([blob], name, { type: 'application/pdf' }); } catch (e) { file = null; }
    var mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
    var download = function () { var u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 4000); return Promise.resolve('download'); };
    var open = function () { var u = URL.createObjectURL(blob); var w = window.open(u, '_blank'); if (!w) location.href = u; return Promise.resolve('open'); };
    if (mobile && file && navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], title: name.replace(/\.pdf$/, '') }).then(function () { return 'share'; }, function (e) { if (e && e.name === 'AbortError') return 'cancel'; return Promise.reject(Object.assign(new Error('share'), { retry: true, blob: blob, file: file })); });
    }
    return mobile ? open() : download();
  }
  function fileName(kind, addr) { return ('LANA HOMES ' + kind + ' - ' + (addr || 'Report')).replace(/[\\/:*?"<>|#]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 90) + ' ' + new Date().toISOString().slice(0, 10) + '.pdf'; }

  root.LanaPDF = { load: load, flip: flip, holding: holding, estimate: estimate, save: save, fileName: fileName };
})(this);
