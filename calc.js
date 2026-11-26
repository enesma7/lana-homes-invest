/* LANA HOMES Investments — calculator math (Star's spec). Pure functions; also loaded by node tests. */
(function (root) {
  function n(v) { var x = Number(String(v == null ? '' : v).replace(/[$,\s%]/g, '')); return isFinite(x) ? x : 0; }
  function r2(x) { return Math.round(x * 100) / 100; }
  function daysBetween(a, b) {
    if (!a || !b) return 0;
    var d1 = Date.parse(a + 'T00:00:00Z'), d2 = Date.parse(b + 'T00:00:00Z');
    if (!isFinite(d1) || !isFinite(d2)) return 0;
    return Math.round((d2 - d1) / 86400000);
  }
  function isoAdd(iso, k) { var t = Date.parse(iso + 'T00:00:00Z'); return isFinite(t) ? new Date(t + k * 86400000).toISOString().slice(0, 10) : ''; }
  // California property-tax half-years (fiscal year Jul 1 - Jun 30): Jul-Dec installment due Nov 1, Jan-Jun due Feb 1.
  function taxHalf(iso) {
    var y = +iso.slice(0, 4), m = +iso.slice(5, 7);
    return m >= 7 ? { s: y + '-07-01', end: (y + 1) + '-01-01', due: y + '-11-01' } : { s: y + '-01-01', end: y + '-07-01', due: y + '-02-01' };
  }
  /** Tax prorations: annual tax = price x rate, 365-day year; an installment counts as paid on its due date by whoever owns the home then. */
  function taxProrations(annual, close, sale) {
    var daily = annual / 365, out = { annual: annual, buy: 0, sell: 0, installments: 0, count: 0, close: close, sale: sale };
    if (!close || !sale || sale <= close) return null;
    var p0 = taxHalf(close), pn = taxHalf(sale);
    out.buyPaid = close >= p0.due;  // seller already paid this half: you reimburse close -> end; else seller credits start -> close
    out.buyDays = out.buyPaid ? daysBetween(close, p0.end) : daysBetween(p0.s, close);
    out.buy = (out.buyPaid ? 1 : -1) * daily * out.buyDays;
    out.sellPaid = sale >= pn.due;   // you paid this half: the next buyer credits you sale -> end; else you credit them start -> sale
    out.sellDays = out.sellPaid ? daysBetween(sale, pn.end) : daysBetween(pn.s, sale);
    out.sell = (out.sellPaid ? -1 : 1) * daily * out.sellDays;
    for (var p = p0, guard = 0; p.s <= pn.s && guard < 40; p = taxHalf(p.end), guard++) if (close < p.due && p.due <= sale) out.count++;
    out.installments = out.count * annual / 2;
    return out;
  }
  function annualize(roi, days) {
    if (!days || days <= 0 || !isFinite(roi)) return { simple: null, compound: null };
    var c = 1 + roi > 0 ? Math.pow(1 + roi, 365 / days) - 1 : -1;
    return { simple: roi * 365 / days, compound: c };
  }

  /** Estimate calculator. Percent inputs are entered as percents (8 = 8%). */
  function estimate(i) {
    var price = n(i.purchasePrice), sale = n(i.salePrice);
    var loan = i.loanAmount === '' || i.loanAmount == null ? 0 : n(i.loanAmount);
    var rate = n(i.interestRate) / 100, points = n(i.pointsPct) / 100;
    var auto = i.autoProrations === true || i.autoProrations === 'true';
    var days = n(i.daysHeld) || daysBetween(i.fundingDate, i.payoffDate) || (auto ? Math.round(n(i.holdMonths) * 365 / 12) : 0);
    var saleDate = auto ? (i.payoffDate || (i.fundingDate && days ? isoAdd(i.fundingDate, days) : '')) : '';
    var loanFee = loan * points + n(i.originationFee);
    var down = price - loan;
    // Itemized closing costs (Enrique's real deals): % of price for escrow/title, flat for fixed fees, transfer tax per $1,000.
    var buyItems = [
      ['Escrow Fee', price * n(i.buyEscrowPct) / 100], ['Title / Lender Policy', price * n(i.buyTitlePct) / 100],
      ['Loan Docs / Processing', n(i.buyLoanDocs)], ['Recording', n(i.buyRecording)], ['Courier', n(i.buyCourier)],
      ['Notary', n(i.buyNotary)], ['Wire Fees', n(i.wireFees)], ['Other Buying Costs', n(i.buyClosing)]];
    var buying = buyItems.reduce(function (t, x) { return t + x[1]; }, 0);
    var blank = function (v) { return v === '' || v == null; };
    // Prepaid insurance: the 12-month hazard premium collected at purchase (Auto = one year of the insurance assumption).
    var insPre = auto && blank(i.insurancePrepaid) ? n(i.insuranceAnnual) : n(i.insurancePrepaid);
    var annualTax = price * n(i.taxRatePct) / 100;
    var tp = auto ? taxProrations(annualTax, i.fundingDate, saleDate) : null;
    var taxSigned = blank(i.taxProration) ? (tp ? tp.buy : 0) : (i.taxIsCredit === false || i.taxIsCredit === 'false' ? n(i.taxProration) : -n(i.taxProration));
    var sellPror = blank(i.sellTaxProration) ? (tp ? tp.sell : 0) : n(i.sellTaxProration);
    var hoaBuy = n(i.hoaAtPurchase), refund = n(i.purchaseRefund);
    var cashToClose = down + loanFee + buying + insPre + taxSigned + hoaBuy - refund;
    var rehabUsed = n(i.rehabBudget) * (1 + n(i.contingencyPct) / 100);
    var interest = loan * rate * days / 365;
    // Holding costs auto-calc from the hold period; any override ($) field that is filled in wins.
    var yr = days / 365;
    // With dates, holding taxes = installments you pay while you own it; the prorations cover the rest, so nothing is counted twice.
    var taxAuto = tp ? tp.installments : annualTax * yr;
    var insAuto = Math.max(0, n(i.insuranceAnnual) * yr - insPre);
    var utilAuto = n(i.utilitiesMonthly) * yr * 12;
    var taxHold = blank(i.propertyTaxes) ? taxAuto : n(i.propertyTaxes);
    var insHold = blank(i.insuranceHold) ? insAuto : n(i.insuranceHold);
    var utilHold = blank(i.utilities) ? utilAuto : n(i.utilities);
    var holdOther = taxHold + insHold + utilHold + n(i.hoaHold) + n(i.otherHold);
    var holding = interest + holdOther;
    var listing = sale * n(i.listingPct) / 100, buyerComm = sale * n(i.buyerPct) / 100;
    var sellItems = [
      ['Listing Commission', listing], ['Buyer Commission', buyerComm], ['Escrow Fee', sale * n(i.sellEscrowPct) / 100],
      ['Owner’s Title Policy', sale * n(i.sellTitlePct) / 100], ['Recording', n(i.sellRecording)], ['NHD Report', n(i.nhd)],
      ['Home Warranty', n(i.homeWarranty)], ['Notary', n(i.sellNotary)], ['County Transfer Tax', sale / 1000 * n(i.countyTTper1k)],
      ['City Transfer Tax', sale / 1000 * n(i.cityTTper1k)], ['Wire Fees', n(i.sellWire)], ['Other Selling Closing', n(i.sellEscrow)],
      ['Buyer Credits', n(i.buyerCredits)], ['Marketing / Misc', n(i.miscSelling)], ['Tax Proration At Sale', sellPror]];
    var selling = sellItems.reduce(function (t, x) { return t + x[1]; }, 0);
    var buyingCosts = loanFee + buying + insPre + taxSigned + hoaBuy - refund;
    var totalCost = price + buyingCosts + rehabUsed + holding + selling;
    var profit = sale - totalCost;
    var cashInvested = cashToClose + rehabUsed + holdOther + (i.interestOutOfPocket ? interest : 0);
    var roiCash = cashInvested > 0 ? profit / cashInvested : null;
    var roiCost = totalCost > 0 ? profit / totalCost : null;
    var ann = annualize(roiCash, days);
    var maxOffer = 0.8 * sale - rehabUsed;
    var over80 = sale > 0 && price > 0.8 * sale;
    var rating = profit >= 50000 && !over80 ? 'green' : (profit >= 25000 && !over80 ? 'gold' : 'red');
    var out = {
      loanAmount: r2(loan), ltv: price ? loan / price : 0, downPayment: r2(down), loanFee: r2(loanFee), daysHeld: days,
      cashToClose: r2(cashToClose), buyingCosts: r2(buyingCosts), rehabUsed: r2(rehabUsed), interest: r2(interest),
      holdingCosts: r2(holding), sellingCosts: r2(selling), totalCost: r2(totalCost), profit: r2(profit),
      cashInvested: r2(cashInvested), roiCash: roiCash, roiCost: roiCost, simpleAnnual: ann.simple, compoundAnnual: ann.compound,
      maxOffer: r2(maxOffer), over80: over80, rating: rating,
      buyClosingItemized: r2(buying), buyClosingAll: r2(buying + insPre + taxSigned + hoaBuy - refund), insurancePrepaid: r2(insPre), taxProrationBuy: r2(taxSigned), taxProrationSell: r2(sellPror), saleDate: saleDate, taxHold: r2(taxHold), insuranceHold: r2(insHold), utilitiesHold: r2(utilHold), monthsHeld: Math.round(yr * 12 * 10) / 10
    };
    Object.defineProperty(out, 'items', { value: { tax: tp, buying: buyItems.concat([['Prepaid Insurance (12 Mo)', insPre], ['Tax Proration At Purchase', taxSigned], ['HOA At Purchase', hoaBuy], ['Escrow Refund After Close', -refund]]).map(function (x) { return [x[0], r2(x[1])]; }), selling: sellItems.map(function (x) { return [x[0], r2(x[1])]; }) }, enumerable: false });
    return out;
  }

  /* LEDGER-BEGIN (shared with backend Code.gs; keep identical) */
  /** Expense ledger: every number on a flip or holding is derived from its expense entries.
      phase: Buying | Rehab | Holding | Selling | After Sale (in the deal P&L) · Operating | Excluded (not in the deal P&L).
      atSale: paid out of the sale proceeds through escrow (projected until the sale closes), so nobody's capital. */
  var LEDGER_PHASES = ['Buying', 'Rehab', 'Holding', 'Selling', 'After Sale', 'Operating', 'Excluded', 'Purchase Cash'];
  // 'Purchase Cash': a partner's money toward the purchase price itself (down payment, EMD, wires, refunds). It is that
  // partner's capital, but not a cost (the price is already in the numbers), so it is outside the deal P&L and the expense total.
  var LEDGER_DEAL = ['Buying', 'Rehab', 'Holding', 'Selling', 'After Sale'];
  var LEDGER_PB = /^Paid by:\s*([^·]+?)\s*(?:·\s*|$)/;
  function ledgerNum(v) { var x = Number(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(x) ? x : 0; }
  function ledgerPayer(e) { if (e.paidBy) return String(e.paidBy).trim(); var m = LEDGER_PB.exec(e.notes || ''); return m ? m[1].trim() : ''; }
  function ledgerAtSale(e) {
    var a = String(e.atSale == null ? '' : e.atSale).toLowerCase();
    if (a === '1' || a === 'true' || a === 'yes') return true;
    if (a === '0' || a === 'false' || a === 'no') return false;
    return /at sale|sale proceeds/i.test(ledgerPayer(e)) || /(^|·)\s*(Projected|At Sale)\s*(·|$)/i.test(String(e.notes || ''));
  }
  function ledgerPhase(e) {
    if (LEDGER_PHASES.indexOf(e.phase) >= 0) return e.phase;
    var notes = String(e.notes || ''), payee = String(e.payee || ''), cat = String(e.category || '');
    if (/(?:^|·)\s*Purchase Cash\s*(?:·|$)/.test(notes.replace(LEDGER_PB, '')) || cat === 'Purchase Cash') return 'Purchase Cash';
    if (/Not in the (flip|deal) P&L/i.test(notes)) return 'Excluded';
    var m = /(?:^|·)\s*(Buying|Rehab|Holding|Selling|After Sale|Operating|Excluded)\s*(?:·|$)/.exec(notes.replace(LEDGER_PB, ''));
    if (m) return m[1];
    if (/wire fee/i.test(payee)) return 'Buying';
    if (/mortgage payment/i.test(payee)) return 'Holding';
    if (/^Source:|Material log|Labor log/.test(notes.replace(LEDGER_PB, ''))) return 'Rehab';   // imported rehab logs
    if (/Loan Interest|Utilities|Insurance|Property Tax/i.test(cat)) return 'Holding';
    if (/Closing Costs/i.test(cat)) return ledgerAtSale(e) ? 'Selling' : 'Buying';
    if (/Marketing|Commission/i.test(cat)) return 'Selling';
    return 'Rehab';
  }
  /** items: the expense rows linked to one property. Returns bucket sums, who paid what during the deal, and what escrow pays at sale. */
  function ledger(items) {
    var L = { count: 0, buying: 0, rehab: 0, holding: 0, selling: 0, after: 0, operating: 0, excluded: 0, deal: 0, total: 0, atSaleTotal: 0, atSale: [], paid: {}, afterPaid: {}, purchase: 0, purchasePaid: {} };
    var key = { 'Buying': 'buying', 'Rehab': 'rehab', 'Holding': 'holding', 'Selling': 'selling', 'After Sale': 'after', 'Operating': 'operating', 'Excluded': 'excluded' };
    var r = function (x) { return Math.round(x * 100) / 100; };
    (items || []).forEach(function (e) {
      if (!e || String(e.deleted) === '1') return;
      var a = ledgerNum(e.amount), ph = ledgerPhase(e), at = ledgerAtSale(e), who = ledgerPayer(e) || 'Not recorded';
      if (ph === 'Purchase Cash') { L.purchase += a; L.purchasePaid[who] = r((L.purchasePaid[who] || 0) + a); return; }
      L.count++; L.total += a; L[key[ph]] += a;
      if (LEDGER_DEAL.indexOf(ph) < 0) return;
      L.deal += a;
      if (at) { L.atSaleTotal += a; L.atSale.push({ payee: String(e.payee || ''), amount: r(a), phase: ph, date: String(e.date || '') }); }
      else if (ph === 'After Sale') L.afterPaid[who] = r((L.afterPaid[who] || 0) + a);
      else L.paid[who] = r((L.paid[who] || 0) + a);
    });
    ['buying', 'rehab', 'holding', 'selling', 'after', 'operating', 'excluded', 'deal', 'total', 'atSaleTotal', 'purchase'].forEach(function (k) { L[k] = r(L[k]); });
    return L;
  }
  /** Group a full expense list by property id. */
  function ledgers(items) {
    var by = {}, out = {};
    (items || []).forEach(function (e) { if (e && e.linkId && e.linkType !== 'general') (by[e.linkId] = by[e.linkId] || []).push(e); });
    for (var k in by) out[k] = ledger(by[k]);
    return out;
  }
  function ledgerR2(x) { return Math.round(x * 100) / 100; }
  function parseOverrides(f) {
    var o = f && f.overrides;
    if (typeof o === 'string') { try { o = JSON.parse(o) || {}; } catch (e) { o = {}; } }
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  }
  /** Owner-typed values (Edit Numbers → Override) win over the live expense totals for that field only. */
  function applyOverrides(g) {
    var o = parseOverrides(g), k, keys = ['buyClosingCosts', 'rehabSpent', 'holdingCosts', 'sellingCosts', 'otherCosts',
      'purchasePrice', 'loanAmount', 'salePrice', 'rehabBudget', 'adjustments', 'purchaseCredits', 'currentValue', 'loanBalance', 'monthlyIncome', 'monthlyExpenses', 'cashInvested'];
    for (var i = 0; i < keys.length; i++) {
      k = keys[i];
      if (o.hasOwnProperty(k) && o[k] !== '' && o[k] != null) g[k] = ledgerR2(ledgerNum(o[k]));
    }
    return g;
  }
  /** Down payment is the price not funded by the loan. Cash to purchase = that down payment + buying closing costs. */
  function downPayment(f) { return ledgerR2(ledgerNum(f && f.purchasePrice) - ledgerNum(f && f.loanAmount)); }
  function cashToPurchase(f) { return ledgerR2(downPayment(f) + ledgerNum(f && f.buyClosingCosts)); }
  /** After-sale costs not paid through the sale escrow. Already in profit (otherCosts); also deducted from Net Proceeds so the two totals tie. */
  function afterSaleNotAtSale(L) {
    if (!L) return 0;
    var at = 0;
    (L.atSale || []).forEach(function (a) { if (a && a.phase === 'After Sale') at += ledgerNum(a.amount); });
    return ledgerR2(ledgerNum(L.after) - at);
  }
  /**
   * Purchase-side credits (escrow credits, seller credits at purchase) belong in profit / cash-in, not in sale Net Proceeds.
   * Prefer the structured purchaseCredits field. If it is empty and purchase-cash entries exist, infer the shortfall
   * of recorded purchase cash vs the down payment — that shortfall is the credit already reflected in cash in.
   * When purchaseCredits is set, adjustments should not also include the same amount (Reis was migrated that way).
   */
  function purchaseCreditsOf(f, L) {
    var v = ledgerR2(ledgerNum(f && f.purchaseCredits));
    if (v) return v;
    if (L && L.purchasePaid && Object.keys(L.purchasePaid).length) {
      var gap = ledgerR2(downPayment(f) - ledgerNum(L.purchase));
      if (gap > 0) return gap;
    }
    return 0;
  }
  function ledgerPayerMatches(payer, name) { payer = String(payer || '').toLowerCase(); name = String(name || '').toLowerCase().trim(); return !!name && (payer === name || payer.indexOf(name + ' ') === 0 || payer.indexOf(name + '(') === 0); }
  function ledgerSetupRow(x) { return x && (x.payout || x.meta); }
  /** Apply a property's expense ledger: cost buckets, capital per partner and cash in all come from the entries.
      Settings that stay on the property: price, loan, sale price, credits, rehab budget, each partner's purchase cash and split. */
  function ledgerSum(m, name) { var t = 0; for (var p in m || {}) if (ledgerPayerMatches(p, name)) t += m[p]; return ledgerR2(t); }
  function ledgerLive(f) {
    var L = f && f.ledger;
    if (!L) return f;
    var g = {}; for (var k in f) g[k] = f[k];
    g.buyClosingCosts = L.buying; g.rehabSpent = L.rehab; g.holdingCosts = L.holding; g.sellingCosts = L.selling; g.otherCosts = L.after;
    if (L.after && !g.otherCostsLabel) g.otherCostsLabel = 'After-Sale Costs';
    var rows = (f.investors || []).filter(function (x) { return x && !ledgerSetupRow(x); });
    // Purchase cash comes from 'Purchase Cash' entries. Older ledgers (backend 1.4.0) don't carry them, and a property
    // with none yet falls back to the amount stored on each partner row, so the numbers never jump while data moves over.
    var fromEntries = !!(L.purchasePaid && Object.keys(L.purchasePaid).length);
    var matched = {};
    if (rows.length) {
      g.investors = rows.map(function (x) {
        var spent = 0;
        for (var p in L.paid) if (ledgerPayerMatches(p, x.name)) { spent += L.paid[p]; matched[p] = 1; }
        for (var q0 in L.purchasePaid || {}) if (ledgerPayerMatches(q0, x.name)) matched['\u0000' + q0] = 1;
        var put = fromEntries ? ledgerSum(L.purchasePaid, x.name) : ledgerNum(x.purchaseCash);
        var o = {}; for (var j in x) o[j] = x[j];
        o.purchaseCash = ledgerR2(put); o.expensesPaid = ledgerR2(spent); o.capital = ledgerR2(put + spent);
        return o;
      }).concat((f.investors || []).filter(ledgerSetupRow));
      g.cashInvested = ledgerR2(g.investors.filter(function (x) { return !ledgerSetupRow(x); }).reduce(function (t, x) { return t + x.capital; }, 0));
    } else {
      var paid = 0; for (var q in L.paid) paid += L.paid[q];
      g.cashInvested = ledgerR2(Math.max(0, ledgerNum(f.purchasePrice) - ledgerNum(f.loanAmount)) + paid);
    }
    g.unmatchedPaid = {};
    if (rows.length) { for (var u in L.paid) if (!matched[u]) g.unmatchedPaid[u] = L.paid[u]; for (var v in L.purchasePaid || {}) if (!matched['\u0000' + v]) g.unmatchedPaid[v] = ledgerR2((g.unmatchedPaid[v] || 0) + L.purchasePaid[v]); }
    g._live = true;
    applyOverrides(g);
    return g;
  }
  /* LEDGER-END */
  /**
   * Display-only: sale-side adjustment amount to net into the Loan Payoff line
   * when the adjustment is a seller-carry payoff reduction. The full loan and
   * full adjustment stay in the math; Net Proceeds and payouts do not change.
   *
   * Opt in with adjustmentsKind = sellerCarryPayoff | sellerCarry | loanPayoff.
   * Reis (f_reis) is also identified by its short label "Seller-Carry Payoff".
   * Longer labels such as Fauna's "Seller-Carry Payoff $12,827.25 Under Loan
   * (Owed Taxes)" are not treated as flagged, so their credit line stays put.
   */
  function sellerCarryPayoffReductionOf(f, creditShown) {
    creditShown = r2(creditShown);
    if (!creditShown) return 0;
    var kind = String((f && f.adjustmentsKind) || '').toLowerCase().replace(/[\s_-]/g, '');
    var flagged = kind === 'sellercarrypayoff' || kind === 'sellercarry' || kind === 'loanpayoff';
    var lab = String((f && f.adjustmentsLabel) || '').trim();
    var identified = flagged || (f && f.id === 'f_reis') || /^seller[- ]carry payoff$/i.test(lab);
    return identified ? creditShown : 0;
  }

  /**
   * Display-only amounts for The Numbers card and the flip PDF. Math is unchanged.
   * A flagged seller-carry payoff reduction is netted into the Loan line and the
   * credit line is dropped, matching the payout card. Other properties are unchanged.
   */
  function numbersDisplayOf(f, x) {
    var loan = n(f && f.loanAmount);
    var adj = n(f && f.adjustments);
    var pc = r2(n(f && f.purchaseCredits));
    var exclude = pc ? 0 : purchaseCreditsOf(f, f && f.ledger);
    var saleCredit = r2(adj - exclude);
    var carryRed = sellerCarryPayoffReductionOf(f, saleCredit);
    return {
      loan: carryRed ? r2(loan - carryRed) : loan,
      adjustments: carryRed ? r2(saleCredit - carryRed) : adj,
      adjustmentsLabel: (f && f.adjustmentsLabel) || 'Credits',
      purchaseCredits: pc,
      carryReduction: carryRed,
      totalCost: x ? x.totalCost : undefined,
      profit: x ? x.profit : undefined
    };
  }
  /** Purchase To Payout, built from the live numbers (never stored). */
  function payoutOf(f, x) {
    var L = f.ledger, inv = x.investors, sold = f.status === 'Sold';
    var price = n(f.purchasePrice), loan = n(f.loanAmount), sale = n(f.salePrice), adj = n(f.adjustments);
    var meta = ((f.investors || []).filter(ledgerSetupRow)[0] || {});
    var src = (meta.payout && meta.payout.source) || (meta.meta && meta.meta.source) || '';
    var lender = f.lender ? ' · ' + f.lender : '';
    var purchase = [['Purchase Price', price]];
    if (loan) purchase.push(['Loan' + lender, -loan]);
    purchase.push(['Buying Closing Costs', n(f.buyClosingCosts)]);
    var capital = inv.map(function (i) {
      return [i.name, i.capital, i.purchaseCash && i.expensesPaid ? 'Purchase ' + fmt(i.purchaseCash) + ' + expenses ' + fmt(i.expensesPaid) : ''];
    });
    var capTotal = r2(inv.reduce(function (t, i) { return t + i.capital; }, 0));
    var afterOpen = afterSaleNotAtSale(L);
    var pc = r2(n(f.purchaseCredits));
    // If the structured field is set, those credits were moved out of adjustments and are already not in `adj`.
    // If it is empty, any inferred purchase-side credit is still sitting inside adjustments and must be excluded from net.
    var exclude = pc ? 0 : purchaseCreditsOf(f, L);
    // Display only the sale-side credit in the summing column (adj minus any inferred purchase credit still inside it).
    var creditShown = r2(adj - exclude);
    // Display-only: net a flagged seller-carry payoff reduction into Loan Payoff and drop that credit line.
    var carryRed = sellerCarryPayoffReductionOf(f, creditShown);
    var loanShown = carryRed ? r2(loan - carryRed) : loan;
    if (carryRed) creditShown = r2(creditShown - carryRed);
    var saleRows = [[sold ? 'Sale Price' : 'Sale Price (Projected)', sale]];
    if (loan || loanShown) saleRows.push(['Loan Payoff' + lender, -loanShown]);
    var groups = {}, order = [];
    L.atSale.forEach(function (a) { if (!groups[a.phase]) { groups[a.phase] = 0; order.push(a.phase); } groups[a.phase] += a.amount; });
    var lab = { 'Buying': 'Buying Costs Paid At Sale', 'Rehab': 'Rehab Paid From Escrow', 'Holding': 'Holding Costs Paid At Sale', 'Selling': 'Selling Costs Through Escrow', 'After Sale': 'Held Back After Sale' };
    order.forEach(function (p) { saleRows.push([lab[p], -r2(groups[p])]); });
    if (creditShown) saleRows.push([f.adjustmentsLabel || 'Credits', creditShown]);
    if (afterOpen) saleRows.push([f.otherCostsLabel || 'Costs After Closing', -afterOpen, 'After-sale costs not paid through the sale escrow']);
    var net = r2(sale - loan - L.atSaleTotal + adj - afterOpen - exclude), toPartners = r2(capTotal + x.profit), diff = r2(toPartners - net);
    var shownPc = r2(pc || exclude);
    var saleNote = shownPc ? ('Purchase Credits ' + fmt(shownPc) + ', already counted in cash in (not deducted)') : '';
    if (Math.abs(diff) >= 0.01) saleRows.push(['Settled Outside The Sale Escrow', diff, 'Costs in the totals not paid by a partner or the sale escrow']);
    var paid = inv.map(function (i) {
      return [i.name, i.distribution, 'Capital ' + fmt(i.capital) + (i.profitShare < 0 ? ' − ' + fmt(-i.profitShare) + ' loss' : ' + ' + fmt(i.profitShare) + ' profit') + ' (' + pct(i.split) + ')'];
    });
    return { title: 'Purchase To Payout' + (sold ? '' : ' (Projected)'),
      purchase: purchase, purchaseTotal: ['Cash To Purchase', cashToPurchase(f)],
      capital: capital, capitalTotal: ['Total Cash Invested', capTotal],
      saleTitle: sold ? 'Paid Out' : 'Projected Payout',
      sale: saleRows, saleTotal: ['Paid Out To Partners', toPartners],
      saleNet: ['Net Proceeds', net], saleNote: saleNote,
      paid: paid, paidTotal: ['Total To Partners', r2(inv.reduce(function (t, i) { return t + i.distribution; }, 0))],
      source: src, live: true };
  }
  function fmt(v) { var s = Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (v < 0 ? '−$' : '$') + s; }
  function pct(v) { var p = Math.round(n(v) * 1000) / 10; return (p % 1 ? p.toFixed(1) : String(p)) + '%'; }

  /** Profit/loss split per partner. splitMode 'auto' = share of the partners' cash in (live capital); anything else is a
      stored, agreed (manual) split. Auto partners share whatever the manual ones leave, by capital (equally if no cash yet). */
  function splitsOf(rows) {
    var auto = rows.filter(function (x) { return x.splitMode === 'auto'; });
    if (!auto.length) return rows;
    var fixed = rows.filter(function (x) { return x.splitMode !== 'auto'; }).reduce(function (t, x) { return t + n(x.split); }, 0);
    var left = Math.max(0, 1 - fixed), cap = auto.reduce(function (t, x) { return t + Math.max(0, n(x.capital)); }, 0);
    return rows.map(function (x) {
      if (x.splitMode !== 'auto') return x;
      var o = {}; for (var k in x) o[k] = x[k];
      o.split = cap > 0 ? left * Math.max(0, n(x.capital)) / cap : left / auto.length;
      return o;
    });
  }
  /** A saved flip's numbers → totals, ROI, hold, investor distributions. Pass a flip through live() first when it has a ledger. */
  function flip(f, today) {
    if (f && f.ledger && !f._liveApplied) { f = ledgerLive(f); f._liveApplied = true; }
    var totalCost = n(f.purchasePrice) + n(f.buyClosingCosts) + n(f.rehabSpent) + n(f.holdingCosts) + n(f.sellingCosts) + n(f.otherCosts) - n(f.adjustments) - n(f.purchaseCredits);
    var profit = n(f.salePrice) - totalCost;
    var cash = n(f.cashInvested);
    var roiCash = cash > 0 ? profit / cash : null;
    var roiCost = totalCost > 0 ? profit / totalCost : null;
    var sold = f.status === 'Sold';
    var end = sold ? f.saleDate : (today || new Date().toISOString().slice(0, 10));
    var days = f.purchaseDate && end ? daysBetween(f.purchaseDate, end) : 0;
    var ann = sold && f.purchaseDate && f.saleDate ? annualize(roiCash, days) : { simple: null, compound: null };
    var meta = (f.investors || []).filter(function (x) { return x && x.payout; })[0];
    var rows0 = splitsOf((f.investors || []).filter(function (x) { return x && !ledgerSetupRow(x); })), given = 0;
    var splitSum = rows0.reduce(function (t, x) { return t + n(x.split); }, 0);
    var inv = rows0.map(function (x, k) {
      // Shares are rounded to the cent; when the splits add to 100% the last partner takes the leftover cent so the totals tie out.
      var share = k === rows0.length - 1 && Math.abs(splitSum - 1) < 1e-6 ? r2(profit) - given : r2(profit * n(x.split)); given = r2(given + share);
      return { name: x.name, capital: n(x.capital), split: n(x.split), profitShare: r2(share), distribution: r2(n(x.capital) + share),
        purchaseCash: x.purchaseCash, expensesPaid: x.expensesPaid, note: x.note || '', splitMode: x.splitMode === 'auto' ? 'auto' : 'manual' };
    });
    var out = { totalCost: r2(totalCost), profit: r2(profit), roiCash: roiCash, roiCost: roiCost, daysHeld: days,
      needsSaleDate: sold && !f.saleDate, needsPurchaseDate: !f.purchaseDate, simpleAnnual: ann.simple, compoundAnnual: ann.compound,
      investors: inv, payout: null, rehabVariance: r2(n(f.rehabSpent) - n(f.rehabBudget)), live: !!f._live };
    if (f._live && f.ledger && inv.length) out.payout = payoutOf(f, out);
    else if (meta && meta.payout && meta.payout.sale) out.payout = meta.payout;
    Object.defineProperty(out, 'f', { value: f, enumerable: false });
    return out;
  }

  /** A holding (kept property): equity, cash flow, cash-on-cash and total return on cash invested. */
  function holding(h, today) {
    if (h && h.ledger && !h._liveApplied) { h = ledgerLive(h); h._liveApplied = true; }
    var value = n(h.currentValue), bal = n(h.loanBalance), cash = n(h.cashInvested);
    var allIn = n(h.purchasePrice) + n(h.buyClosingCosts) + n(h.rehabSpent) + (h.ledger ? n(h.holdingCosts) + n(h.sellingCosts) + n(h.otherCosts) : 0);
    var inc = monthlyRentOf(h), exp = n(h.monthlyExpenses), cf = inc - exp;
    var hasIncome = exp > 0; // cash flow is only known once expenses are entered (rent alone is not cash flow)
    var equity = value - bal;
    var end = h.status === 'Sold' && h.saleDate ? h.saleDate : (today || new Date().toISOString().slice(0, 10));
    var days = h.purchaseDate ? daysBetween(h.purchaseDate, end) : null;
    var months = days == null ? null : Math.max(0, Math.floor(days / 30.4375));
    // Months held stays purchase-to-now (ownership, 30.4375-day months). Rent collected uses payment-date months (paid on the start day-of-month).
    var rentStart = earliestStart(h);
    var units = unitsOf(h);
    var daysRented = rentStart ? daysBetween(rentStart, end) : null;
    var monthsRented = rentStart ? monthsBetween(rentStart, end) : null;
    var unitRows = units.map(function (u) {
      var ms = (u.rentalStart && end >= u.rentalStart) ? monthsBetween(u.rentalStart, end) : (u.rentalStart ? 0 : (monthsRented || 0));
      return { name: u.name, rent: r2(u.rent), rentalStart: u.rentalStart || '', deposit: u.deposit, monthsRented: ms, rentToDate: r2(n(u.rent) * ms) };
    });
    var rentToDate = unitRows.length ? r2(unitRows.reduce(function (s, u) { return s + u.rentToDate; }, 0)) : (monthsRented == null || !inc ? 0 : inc * monthsRented);
    var cfToDate = monthsRented == null || !hasIncome ? 0 : rentToDate - exp * monthsRented;
    return { rent: r2(inc), expenses: r2(exp), value: r2(value), loanBalance: r2(bal), cashInvested: r2(cash), allIn: r2(allIn), equity: r2(equity), hasIncome: hasIncome,
      monthlyCashFlow: r2(cf), annualCashFlow: r2(cf * 12), cashOnCash: cash > 0 && hasIncome ? cf * 12 / cash : null,
      equityRoi: cash > 0 && value > 0 ? (equity - cash) / cash : null,
      totalRoi: cash > 0 && value > 0 ? (equity - cash + (hasIncome ? cf * 12 : 0)) / cash : null, noi: r2(hasIncome ? cf * 12 : 0), cashFlowToDate: r2(cfToDate), rentToDate: r2(rentToDate), monthsHeld: months, daysHeld: days, monthsRented: monthsRented, daysRented: daysRented, rentalStart: rentStart || '', units: unitRows, deposits: depositsOf(h) };
  }

  /**
   * Count scheduled rent payments from start through end, on the start day-of-month (clamped to the month’s last day).
   * When rent starts on the 1st, this is “paid on the 1st”: 8/1–11/25 is Aug, Sep, Oct and Nov (4), not 3 elapsed 30.4375-day months.
   * Ownership “months held” still uses the 30.4375-day floor in holding().
   */
  function monthsBetween(start, end) {
    if (!start || !end || end < start) return 0;
    var sy = +start.slice(0, 4), sm = +start.slice(5, 7), sd = +start.slice(8, 10);
    if (!sy || !sm || !sd) return 0;
    var y = sy, m = sm, count = 0, guard = 0;
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    function dim(yy, mm) { return new Date(Date.UTC(yy, mm, 0)).getUTCDate(); }
    while (guard++ < 1200) {
      var pay = y + '-' + pad(m) + '-' + pad(Math.min(sd, dim(y, m)));
      if (pay > end) break;
      if (pay >= start) count++;
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return count;
  }

  /** Normalize holding unit rows: name, monthly rent, rented-since, optional deposit. */
  function unitsOf(h) {
    var raw = h && h.units;
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = null; } }
    if ((!raw || !raw.length) && h && h.overrides && h.overrides.units) raw = h.overrides.units;
    if (!Array.isArray(raw)) return [];
    return raw.map(function (u) {
      if (!u) return null;
      var start = String(u.rentalStart || u.rentedSince || '').slice(0, 10);
      var o = { name: String(u.name || '').trim(), rent: n(u.rent != null ? u.rent : u.monthlyRent) };
      if (/^\d{4}-\d{2}-\d{2}$/.test(start)) o.rentalStart = start;
      if (u.deposit !== undefined && u.deposit !== null && u.deposit !== '') o.deposit = n(u.deposit);
      return (o.name || o.rent || o.rentalStart) ? o : null;
    }).filter(Boolean);
  }
  function depositsOf(h) {
    var any = false, sum = 0;
    unitsOf(h).forEach(function (u) {
      if (u.deposit !== undefined && u.deposit !== null && u.deposit !== '') { any = true; sum += n(u.deposit); }
    });
    return any ? r2(sum) : 0;
  }
  function earliestStart(h) {
    var units = unitsOf(h), starts = units.map(function (u) { return u.rentalStart; }).filter(Boolean).sort();
    return starts[0] || (h && (h.rentalStart || h.purchaseDate)) || '';
  }
  function monthlyRentOf(h) {
    var units = unitsOf(h);
    if (!units.length) return n(h && h.monthlyIncome);
    return r2(units.reduce(function (s, u) { return s + n(u.rent); }, 0));
  }

  /**
   * Recurring vs non-recurring holding/operating expense.
   * Recurring: utilities, taxes, insurance, trash, internet, HOA.
   * Non-recurring: one-off repairs, labor, materials, etc.
   * Optional e.holdingClass ('recurring' | 'non-recurring') or a Recurring / Non-Recurring notes tag overrides the inference.
   * Display-only: does not change equity, monthly cash flow, cash-on-cash, or payouts.
   */
  function holdingClassOf(e) {
    var raw = String((e && (e.holdingClass || e.holdingKind)) || '').toLowerCase().replace(/[_ ]+/g, '-');
    if (raw === 'recurring') return 'recurring';
    if (raw === 'non-recurring' || raw === 'nonrecurring') return 'non-recurring';
    var notes = String((e && e.notes) || '');
    if (/(?:^|[·,;]|\n)\s*non-?recurring\s*(?:[·,;]|$|\n)/i.test(notes)) return 'non-recurring';
    if (/(?:^|[·,;]|\n)\s*recurring\s*(?:[·,;]|$|\n)/i.test(notes)) return 'recurring';
    var cat = String((e && e.category) || '').toLowerCase();
    var payee = String((e && e.payee) || '').toLowerCase();
    if (/utilit|property tax|\btaxes\b|insurance|\bhoa\b|homeowners|trash|waste|internet|sewer/.test(cat)) return 'recurring';
    if (/burrtec|\bspectrum\b|socal gas|\bedison\b|waste management|republic services|hoa\b|homeowners assoc|property tax/.test(payee)) return 'recurring';
    if (/^(water|trash|internet|gas|electric|edison|insurance)$/.test(payee.trim())) return 'recurring';
    return 'non-recurring';
  }
  /**
   * Calendar-year rental / tax figures for a holding, derived from units (or rentalStart + monthly rent),
   * and dated expense rows. Does not change equity, monthly cash flow, cash-on-cash, or payouts.
   * Rental expenses = Operating + Holding rows dated in that year (not Purchase Cash, Rehab, or Buying).
   * Those capital rows are totaled separately and are not subtracted from net cash flow.
   * Security deposits are never included. A year is "closed" after Dec 31 (or the sale date).
   */
  function holdingTaxYears(h, expenses, today) {
    today = today || new Date().toISOString().slice(0, 10);
    var units = unitsOf(h);
    var rentStart = earliestStart(h);
    var saleEnd = h && h.status === 'Sold' && h.saleDate ? h.saleDate : '';
    var inc = monthlyRentOf(h);
    var purchaseY = h && h.purchaseDate ? h.purchaseDate.slice(0, 4) : '';
    var startY = rentStart ? +rentStart.slice(0, 4) : (purchaseY ? +purchaseY : +today.slice(0, 4));
    var endY = +today.slice(0, 4);
    if (saleEnd) endY = Math.min(endY, +saleEnd.slice(0, 4));
    var years = {}, y;
    function ensure(yy) {
      var k = String(yy);
      if (!years[k]) years[k] = { year: k, monthsRented: 0, rent: 0, expenses: 0, recurring: 0, nonRecurring: 0, net: 0, byCategory: {}, recurringByCategory: {}, nonRecurringByCategory: {}, capital: 0, capitalByCategory: {}, rows: [], capitalRows: [], from: '', to: '', closed: false, units: [] };
      return years[k];
    }
    for (y = startY; y <= endY; y++) {
      var rec = ensure(y), from = y + '-01-01', last = y + '-12-31';
      if (rentStart && rentStart > from) from = rentStart;
      if (saleEnd && saleEnd < last) last = saleEnd;
      rec.closed = today > (y + '-12-31') || !!(saleEnd && saleEnd <= (y + '-12-31') && saleEnd >= (y + '-01-01'));
      rec.from = from;
      rec.to = (rec.closed ? last : (today < last ? today : last));
      if (rentStart && rec.to >= from) {
        rec.monthsRented = monthsBetween(from, rec.to);
        if (units.length) {
          rec.units = units.map(function (u) {
            var us = u.rentalStart || rentStart;
            var uFrom = from, collected = 0, ms = 0;
            if (us && rec.to >= us) {
              if (us > uFrom) uFrom = us;
              if (rec.to >= uFrom) {
                ms = monthsBetween(uFrom, rec.to);
                collected = r2(n(u.rent) * ms);
              }
            }
            return { name: u.name, rent: r2(u.rent), rentalStart: us || '', deposit: u.deposit, monthsRented: ms, rentToDate: collected };
          });
          rec.rent = r2(rec.units.reduce(function (s, u) { return s + u.rentToDate; }, 0));
        } else {
          rec.rent = r2(inc * rec.monthsRented);
          rec.units = [];
        }
      }
    }
    (expenses || []).forEach(function (e) {
      if (!e || String(e.deleted) === '1') return;
      var d = String(e.date || ''), yy = /^\d{4}/.test(d) ? d.slice(0, 4) : '';
      if (!yy) return;
      if (+yy < startY - 1 || +yy > endY) return;
      var rec = ensure(yy), ph = ledgerPhase(e), a = ledgerNum(e.amount), cat = String(e.category || 'Other') || 'Other';
      if (ph === 'Purchase Cash') return;
      if (ph === 'Operating' || ph === 'Holding') {
        rec.expenses = r2(rec.expenses + a);
        rec.byCategory[cat] = r2((rec.byCategory[cat] || 0) + a);
        rec.rows.push(e);
        var klass = holdingClassOf(e);
        if (klass === 'recurring') {
          rec.recurring = r2(rec.recurring + a);
          rec.recurringByCategory[cat] = r2((rec.recurringByCategory[cat] || 0) + a);
        } else {
          rec.nonRecurring = r2(rec.nonRecurring + a);
          rec.nonRecurringByCategory[cat] = r2((rec.nonRecurringByCategory[cat] || 0) + a);
        }
      } else if (ph === 'Buying' || ph === 'Rehab') {
        rec.capital = r2(rec.capital + a);
        rec.capitalByCategory[cat] = r2((rec.capitalByCategory[cat] || 0) + a);
        rec.capitalRows.push(e);
      }
    });
    var list = Object.keys(years).sort().map(function (k) {
      var t = years[k];
      t.net = r2(t.rent - t.expenses);
      t.rows.sort(function (a, b) { return String(a.date || '') < String(b.date || '') ? -1 : 1; });
      t.capitalRows.sort(function (a, b) { return String(a.date || '') < String(b.date || '') ? -1 : 1; });
      return t;
    });
    var currentYear = String(endY);
    var ytd = null;
    for (y = 0; y < list.length; y++) if (list[y].year === currentYear && !list[y].closed) ytd = list[y];
    var history = list.filter(function (t) { return t.closed; });
    var lifeEnd = saleEnd && saleEnd < today ? saleEnd : today;
    var lifeMonths = rentStart ? monthsBetween(rentStart, lifeEnd) : 0;
    var lifeExp = 0, lifeCap = 0, lifeRent = 0, lifeUnits = [];
    list.forEach(function (t) { lifeExp = r2(lifeExp + t.expenses); lifeCap = r2(lifeCap + t.capital); });
    if (units.length) {
      lifeUnits = units.map(function (u) {
        var us = u.rentalStart || rentStart, ms = (us && lifeEnd >= us) ? monthsBetween(us, lifeEnd) : 0;
        var collected = r2(n(u.rent) * ms);
        lifeRent = r2(lifeRent + collected);
        return { name: u.name, rent: r2(u.rent), rentalStart: us || '', deposit: u.deposit, monthsRented: ms, rentToDate: collected };
      });
    } else {
      lifeRent = r2(inc * lifeMonths);
    }
    return {
      currentYear: currentYear, ytd: ytd, history: history, years: list, rentStart: rentStart, units: units,
      sinceRented: { monthsRented: lifeMonths, rent: lifeRent, expenses: lifeExp, net: r2(lifeRent - lifeExp), capital: lifeCap, units: lifeUnits }
    };
  }


  /** Standard CA seller closing-cost lines for the In Escrow → Sold modal. Loan payoffs are separate (they update the loan, not selling costs). */
  var SALE_CLOSING_LINES = [
    { key: 'listingCommission', label: 'Listing Commission', pct: true },
    { key: 'buyerCommission', label: 'Buyer Commission', pct: true },
    { key: 'escrowFee', label: 'Escrow Fee' },
    { key: 'ownersTitle', label: "Owner's Title Policy" },
    { key: 'countyTransferTax', label: 'County Transfer Tax' },
    { key: 'cityTransferTax', label: 'City Transfer Tax' },
    { key: 'recording', label: 'Recording' },
    { key: 'notary', label: 'Notary' },
    { key: 'hoaFees', label: 'HOA Fees' },
    { key: 'taxProration', label: 'Property Tax Proration' },
    { key: 'nhd', label: 'Natural Hazard Disclosure' },
    { key: 'homeWarranty', label: 'Home Warranty' },
    { key: 'buyerCredits', label: 'Buyer Credits' },
    { key: 'termiteRepairs', label: 'Termite / Repairs' },
    { key: 'wireCourier', label: 'Wire / Courier' }
  ];
  /**
   * Display/payload helper for the Selling Costs modal. Does not change flip math.
   * Zero amounts are omitted. Negative amounts (for example a tax proration credit) are kept.
   * Loan payoffs are returned separately so they are not written as Selling expenses.
   */
  function saleClosingOf(input) {
    input = input || {};
    var sale = n(input.salePrice);
    var costs = [];
    (input.lines || []).forEach(function (l) {
      var label = String((l && l.label) || '').trim();
      var raw = l && l.amount;
      if (raw === '' || raw == null) return;
      var amount = r2(n(raw));
      if (!label || !amount) return;
      costs.push({
        payee: label, amount: amount, category: 'Closing Costs',
        phase: 'Selling', atSale: true, paidBy: 'Escrow (sale proceeds)', method: 'Escrow'
      });
    });
    var sellingTotal = r2(costs.reduce(function (t, l) { return t + l.amount; }, 0));
    var recorded = r2(n(input.recordedSelling));
    var payoffInputs = input.loanPayoffs || [];
    var hasLoanPayoff = payoffInputs.some(function (v) { return v !== '' && v != null; });
    var loanPayoff = r2(payoffInputs.reduce(function (t, v) { return t + (v === '' || v == null ? 0 : n(v)); }, 0));
    if (!hasLoanPayoff) loanPayoff = r2(n(input.loanAmount));
    return {
      salePrice: sale,
      saleDate: String(input.saleDate || ''),
      costs: costs,
      sellingTotal: sellingTotal,
      recordedSelling: recorded,
      sellingCombined: r2(sellingTotal + recorded),
      loanPayoff: loanPayoff,
      hasLoanPayoff: hasLoanPayoff
    };
  }

  var api = { splitsOf: splitsOf, ledgerSum: ledgerSum, payerMatches: ledgerPayerMatches, estimate: estimate, flip: flip, holding: holding, holdingTaxYears: holdingTaxYears, holdingClassOf: holdingClassOf, unitsOf: unitsOf, depositsOf: depositsOf, earliestStart: earliestStart, monthlyRentOf: monthlyRentOf, live: ledgerLive, ledger: ledger, ledgers: ledgers, phaseOf: ledgerPhase, atSaleOf: ledgerAtSale, payerOf: ledgerPayer, PHASES: LEDGER_PHASES, DEAL_PHASES: LEDGER_DEAL, daysBetween: daysBetween, monthsBetween: monthsBetween, annualize: annualize, n: n, downPayment: downPayment, cashToPurchase: cashToPurchase, afterSaleNotAtSale: afterSaleNotAtSale, purchaseCreditsOf: purchaseCreditsOf, sellerCarryPayoffReductionOf: sellerCarryPayoffReductionOf, saleClosingOf: saleClosingOf, SALE_CLOSING_LINES: SALE_CLOSING_LINES, numbersDisplayOf: numbersDisplayOf, parseOverrides: parseOverrides, applyOverrides: applyOverrides };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FlipCalc = api;
})(this);
