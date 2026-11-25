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

  var gradCache = {};
  function gradImg(w, h, r, cols) {
    var key = [w, h, r].concat(cols).join('|'); if (gradCache[key]) return gradCache[key];
    try {
      var S = 3, c = document.createElement('canvas'); c.width = Math.round(w * S); c.height = Math.round(h * S);
      var g = c.getContext('2d'), W2 = c.width, H2 = c.height, R = r * S;
      var gr = g.createLinearGradient(0, 0, W2, H2 * 1.6); gr.addColorStop(0, cols[0]); gr.addColorStop(1, cols[1]);
      g.beginPath(); g.moveTo(R, 0); g.arcTo(W2, 0, W2, H2, R); g.arcTo(W2, H2, 0, H2, R); g.arcTo(0, H2, 0, 0, R); g.arcTo(0, 0, W2, 0, R); g.closePath();
      g.fillStyle = gr; g.fill();
      return (gradCache[key] = c.toDataURL('image/png'));
    } catch (e) { return null; }
  }
  function Doc(kind, title, sub, who, status) {
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
      if (status) { // small gold status label under the generated stamp
        var st = t(String(status).toUpperCase()); doc.setFont('helvetica', 'bold'); doc.setFontSize(7); var tw = doc.getTextWidth(st) + 0.8 * (st.length - 1), sw = tw + 14;
        doc.setFillColor.apply(doc, GOLD1); doc.roundedRect(W - M - sw, 56, sw, 13, 6.5, 6.5, 'F'); doc.setTextColor.apply(doc, BLACK); doc.text(st, W - M - sw + 7, 65.2, { charSpace: 0.8 });
      }
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
      self.ensure(78); var bw = W - 2 * M;
      // Smooth background: one hi-res canvas gradient (PNG, rounded corners baked in) instead of stepped jsPDF rects.
      var img = gradImg(bw, 66, 8, loss ? ['#EF0207', '#9A0007'] : ['#1FA463', '#0B6B3A']);
      if (img) doc.addImage(img, 'PNG', M, self.y, bw, 66, loss ? 'heroLoss' : 'heroGain', 'FAST');
      else { doc.setFillColor.apply(doc, loss ? RED1 : [22, 132, 76]); doc.roundedRect(M, self.y, bw, 66, 8, 8, 'F'); }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255); doc.text(t(label.toUpperCase()), M + 16, self.y + 20, { charSpace: 1.5 });
      doc.setFontSize(26); doc.setTextColor(255, 255, 255); doc.text(t(value), M + 16, self.y + 48);
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
        startY: self.y, head: head ? [head.map(t)] : undefined, body: body.map(function (r) { return r.map(function (c) {
          if (c && typeof c === 'object' && c.note) return Object.assign({}, c, { content: t(c.content) + '\n' + t(c.note), _label: t(c.content), _note: t(c.note) });
          return c && typeof c === 'object' ? Object.assign({}, c, { content: t(c.content) }) : t(c); }); }),
        margin: { left: M, right: M, top: 104, bottom: 50 }, theme: 'plain',
        styles: { font: 'helvetica', fontSize: 9, textColor: INK, cellPadding: { top: 4, bottom: 4, left: 6, right: 6 }, lineColor: LINE, lineWidth: { bottom: 0.5 } },
        headStyles: { fillColor: BLACK, textColor: GOLD1, fontStyle: 'bold', fontSize: 8, lineWidth: 0 },
        alternateRowStyles: { fillColor: WHITE },
        didParseCell: function (d) { var cs = (opts.columnStyles || {})[d.column.index]; if (d.section === 'head' && cs && cs.halign) d.cell.styles.halign = cs.halign; },
        // Notes beside a number print gray and smaller under their label (height is reserved by the combined text).
        willDrawCell: function (d) { var r = d.cell.raw; if (r && r._note) { var w = d.cell.width - d.cell.padding('left') - d.cell.padding('right'); d.cell._lab = doc.splitTextToSize(r._label, w); d.cell.text = d.cell._lab; } },
        didDrawCell: function (d) {
          var r = d.cell.raw; if (!(r && r._note)) return;
          var fs = d.cell.styles.fontSize, lh = fs * 1.15, w = d.cell.width - d.cell.padding('left') - d.cell.padding('right');
          doc.setFont('helvetica', 'normal'); doc.setFontSize(fs - 0.5); doc.setTextColor.apply(doc, MUTED);
          doc.text(doc.splitTextToSize(r._note, w), d.cell.x + d.cell.padding('left'), d.cell.y + d.cell.padding('top') + (d.cell._lab || []).length * lh + fs * 0.85);
        },
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
      return [e.date ? fdate(e.date) : (e.atSale ? 'At sale' : '-'), e.payee, e.category || '', e.payer || '-', e.method || '', { content: money(e.amount), styles: { halign: 'right' } }];
    }), { styles: { fontSize: 7.5, textColor: INK, cellPadding: 3, lineColor: LINE, lineWidth: { bottom: 0.4 } }, columnStyles: { 0: { cellWidth: 52 }, 2: { cellWidth: 74 }, 3: { cellWidth: 70 }, 4: { cellWidth: 58 }, 5: { cellWidth: 62, halign: 'right' } } });
  }
  function payoutSection(R, p) {
    if (!p) return;
    R.section(p.title || 'Purchase To Payout');
    var blk = function (title, rows, tot) { if (!rows || !rows.length) return; R.table([title, ''], rows.map(function (r) { return [r[0], { content: money(r[1]), styles: { halign: 'right', fontStyle: 'bold' } }]; }).concat(tot ? [[{ content: tot[0], styles: { fontStyle: 'bold', textColor: BLACK } }, { content: money(tot[1]), styles: { halign: 'right', fontStyle: 'bold', textColor: BLACK } }]] : []), { columnStyles: { 1: { cellWidth: 150 } } }); };
    blk('At Purchase', p.purchase, p.purchaseTotal); blk('Cash Invested By Partner', p.capital, p.capitalTotal);
    blk(p.saleLabel || 'At Sale Closing', p.sale, p.saleTotal); blk(p.paidLabel || 'Paid Out To', p.paid, p.paidTotal);
  }

  function flip(d) {
    var f = d.f, x = d.x, sold = f.status === 'Sold';
    var R = Doc('Flip Report', f.address, f.city || '', d.who, f.status);
    R.hero(sold ? (x.profit < 0 ? 'Loss' : 'Profit') : (x.profit < 0 ? 'Projected Loss' : 'Projected Profit'), money(x.profit, 0), (sold ? 'Sold for ' : 'At a ') + money(f.salePrice, 0) + (sold ? '' : ' sale'), x.profit < 0);
    R.kpis([['Return On Cash', pct(x.roiCash), x.roiCash < 0 ? 'bad' : ''], ['Return On Total Cost', pct(x.roiCost), x.roiCost < 0 ? 'bad' : ''], ['Cash Invested', money(f.cashInvested, 0)], [sold ? 'Annualized (Simple)' : 'Days Held So Far', sold ? pct(x.simpleAnnual) : String(x.daysHeld || '-')]]);
    R.section('The Numbers');
    var rows = [['Purchase Price', money(f.purchasePrice)], ['Loan' + (f.lender ? ' · ' + f.lender : ''), money(f.loanAmount)], ['Buying Closing Costs', money(f.buyClosingCosts)], ['Rehab Spent (Budget ' + money(f.rehabBudget, 0) + ')', money(f.rehabSpent)], ['Holding Costs (Interest, Taxes, Insurance)', money(f.holdingCosts)], ['Selling Costs', money(f.sellingCosts)]];
    if (n(f.otherCosts)) rows.push([f.otherCostsLabel || 'Other Costs', money(f.otherCosts)]);
    if (n(f.adjustments)) rows.push([f.adjustmentsLabel || 'Credits', '-' + money(f.adjustments)]);
    rows.push(['Total Cost', money(x.totalCost), true], [sold ? 'Sale Price' : 'Projected Sale Price', money(f.salePrice), true], [sold ? 'Profit' : 'Projected Profit', money(x.profit), true, x.profit < 0 ? 'bad' : '']);
    R.lines(rows);
    R.note('Purchased ' + (fdate(f.purchaseDate) || '(needs date)') + (sold ? ' · Sold ' + (fdate(f.saleDate) || '(needs date)') : '') + '');
    if (x.investors && x.investors.length) { R.section('Partners'); R.table(['Partner', 'Capital', 'Split', 'Profit Share', 'Payout'], x.investors.map(function (i) { return [i.name, money(i.capital, 0), pct(i.split, 1), money(i.profitShare, 0), money(i.distribution, 0)]; }), { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' } } }); }
    payoutSection(R, x.payout);
    expensesSection(R, d.expenses);

    return R.finish();
  }
  function holding(d) {
    var f = d.f, x = d.x;
    var R = Doc('Holding Report', f.address, f.city || '', d.who, f.status);
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

  // Full-screen preview: every page drawn with pdf.js (iOS iframes only show page 1), plus Share / Download / Close.
  var pdfjsP = null;
  function loadPdfjs() {
    if (pdfjsP) return pdfjsP;
    var v = (document.querySelector('script[src*="report.js"]') || {}).src || ''; v = (v.split('?')[1] || '');
    pdfjsP = loadScript('vendor/pdf.min.js?' + v).then(function () { root.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js?' + v; return root.pdfjsLib; });
    pdfjsP.catch(function () { pdfjsP = null; });
    return pdfjsP;
  }
  function openBlob(url) { var w = window.open(url, '_blank'); if (!w) location.href = url; }
  function preview(doc, name, title) {
    var blob = doc.output('blob'), url = URL.createObjectURL(blob), file = null;
    try { file = new File([blob], name, { type: 'application/pdf' }); } catch (e) {}
    var canShare = !!(file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] }));
    var ov = document.createElement('div'); ov.className = 'pdfv'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', title + ' preview');
    ov.innerHTML = '<div class="pdfv-bar"><div class="pdfv-t"><b></b><span></span></div><div class="pdfv-a">' +
      '<button type="button" class="btn sm gold" data-a="share">Share</button><button type="button" class="btn sm" data-a="dl">Download</button><button type="button" class="btn sm" data-a="x">Close</button></div></div><div class="pdfv-pages"><div class="loading">Loading preview…</div></div>';
    ov.querySelector('.pdfv-t b').textContent = title; ov.querySelector('.pdfv-t span').textContent = name;
    document.body.appendChild(ov); document.documentElement.classList.add('pdfv-open');
    var close = function () { document.documentElement.classList.remove('pdfv-open'); ov.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 60000); document.removeEventListener('keydown', onKey); };
    var onKey = function (e) { if (e.key === 'Escape') close(); }; document.addEventListener('keydown', onKey);
    ov.querySelector('[data-a=x]').onclick = close;
    // Share runs straight from the tap with the PDF already built, so iOS keeps the user gesture.
    ov.querySelector('[data-a=share]').onclick = function () {
      if (!canShare) { openBlob(url); return; }
      navigator.share({ files: [file], title: title }).catch(function (e) { if (!e || e.name !== 'AbortError') openBlob(url); });
    };
    ov.querySelector('[data-a=dl]').onclick = function () { var a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 1000); };
    var host = ov.querySelector('.pdfv-pages');
    loadPdfjs().then(function (lib) { return blob.arrayBuffer().then(function (buf) { return lib.getDocument({ data: new Uint8Array(buf) }).promise; }); }).then(function (pdf) {
      host.innerHTML = ''; var dpr = Math.min(2.5, window.devicePixelRatio || 1), chain = Promise.resolve();
      for (var p = 1; p <= pdf.numPages; p++) (function (p) {
        chain = chain.then(function () { return pdf.getPage(p); }).then(function (page) {
          var w = Math.min(host.clientWidth - 24, 900), v0 = page.getViewport({ scale: 1 }), sc = w / v0.width, vp = page.getViewport({ scale: sc * dpr });
          var c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height); c.style.width = Math.floor(v0.width * sc) + 'px'; c.style.height = Math.floor(v0.height * sc) + 'px'; c.className = 'pdfv-page'; c.setAttribute('aria-label', 'Page ' + p);
          host.appendChild(c); return page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        });
      })(p);
      return chain;
    }).catch(function () { host.innerHTML = '<p class="empty" style="color:#fff">Preview could not load. Use Share or Download to open the PDF.</p>'; });
    return ov;
  }
  function fileName(kind, addr) { return String(addr || 'Report').replace(/[\\/:*?"<>|#,.]+/g, ' ').trim().replace(/\s+/g, '-').slice(0, 70) + '-' + kind.replace(/\s+/g, '-') + '.pdf'; }

  root.LanaPDF = { load: load, loadPdfjs: loadPdfjs, flip: flip, holding: holding, estimate: estimate, preview: preview, fileName: fileName };
})(this);
