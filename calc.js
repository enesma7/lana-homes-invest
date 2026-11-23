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

  /** A saved flip's numbers (stored line items) → totals, ROI, hold, investor distributions. */
  function flip(f, today) {
    var totalCost = n(f.purchasePrice) + n(f.buyClosingCosts) + n(f.rehabSpent) + n(f.holdingCosts) + n(f.sellingCosts) + n(f.otherCosts) - n(f.adjustments);
    var profit = n(f.salePrice) - totalCost;
    var cash = n(f.cashInvested);
    var roiCash = cash > 0 ? profit / cash : null;
    var roiCost = totalCost > 0 ? profit / totalCost : null;
    var sold = f.status === 'Sold';
    var end = sold ? f.saleDate : (today || new Date().toISOString().slice(0, 10));
    var days = f.purchaseDate && end ? daysBetween(f.purchaseDate, end) : 0;
    var ann = sold && f.purchaseDate && f.saleDate ? annualize(roiCash, days) : { simple: null, compound: null };
    var meta = (f.investors || []).filter(function (x) { return x && x.payout; })[0];
    var inv = (f.investors || []).filter(function (x) { return x && !x.payout; }).map(function (x) {
      var share = profit * n(x.split);
      return { name: x.name, capital: n(x.capital), split: n(x.split), profitShare: r2(share), distribution: r2(n(x.capital) + share) };
    });
    return { totalCost: r2(totalCost), profit: r2(profit), roiCash: roiCash, roiCost: roiCost, daysHeld: days,
      needsSaleDate: sold && !f.saleDate, needsPurchaseDate: !f.purchaseDate, simpleAnnual: ann.simple, compoundAnnual: ann.compound,
      investors: inv, payout: meta ? meta.payout : null, rehabVariance: r2(n(f.rehabSpent) - n(f.rehabBudget)) };
  }

  /** A holding (kept property): equity, cash flow, cash-on-cash and total return on cash invested. */
  function holding(h, today) {
    var value = n(h.currentValue), bal = n(h.loanBalance), cash = n(h.cashInvested);
    var allIn = n(h.purchasePrice) + n(h.buyClosingCosts) + n(h.rehabSpent);
    var inc = n(h.monthlyIncome), exp = n(h.monthlyExpenses), cf = inc - exp;
    var hasIncome = exp > 0; // cash flow is only known once expenses are entered (rent alone is not cash flow)
    var equity = value - bal;
    var end = h.status === 'Sold' && h.saleDate ? h.saleDate : (today || new Date().toISOString().slice(0, 10));
    var days = h.purchaseDate ? daysBetween(h.purchaseDate, end) : null;
    var months = days == null ? null : Math.max(0, Math.floor(days / 30.4375));
    var cfToDate = months == null || !hasIncome ? 0 : cf * months;
    return { rent: r2(inc), expenses: r2(exp), value: r2(value), loanBalance: r2(bal), cashInvested: r2(cash), allIn: r2(allIn), equity: r2(equity), hasIncome: hasIncome,
      monthlyCashFlow: r2(cf), annualCashFlow: r2(cf * 12), cashOnCash: cash > 0 && hasIncome ? cf * 12 / cash : null,
      equityRoi: cash > 0 && value > 0 ? (equity - cash) / cash : null,
      totalRoi: cash > 0 && value > 0 ? (equity - cash + (hasIncome ? cf * 12 : 0)) / cash : null, noi: r2(hasIncome ? cf * 12 : 0), cashFlowToDate: r2(cfToDate), monthsHeld: months, daysHeld: days };
  }

  var api = { estimate: estimate, flip: flip, holding: holding, daysBetween: daysBetween, annualize: annualize, n: n };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FlipCalc = api;
})(this);
