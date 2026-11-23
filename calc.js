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
    var days = n(i.daysHeld) || daysBetween(i.fundingDate, i.payoffDate);
    var loanFee = loan * points + n(i.originationFee);
    var down = price - loan;
    var buying = n(i.buyClosing);
    var insPre = n(i.insurancePrepaid);
    var taxSigned = i.taxIsCredit === false || i.taxIsCredit === 'false' ? n(i.taxProration) : -n(i.taxProration);
    var hoaBuy = n(i.hoaAtPurchase), refund = n(i.purchaseRefund);
    var cashToClose = down + loanFee + buying + insPre + taxSigned + hoaBuy - refund;
    var rehabUsed = n(i.rehabBudget) * (1 + n(i.contingencyPct) / 100);
    var interest = loan * rate * days / 365;
    var holdOther = n(i.propertyTaxes) + n(i.insuranceHold) + n(i.utilities) + n(i.hoaHold) + n(i.otherHold);
    var holding = interest + holdOther;
    var listing = sale * n(i.listingPct) / 100, buyerComm = sale * n(i.buyerPct) / 100;
    var selling = listing + buyerComm + n(i.sellEscrow) + n(i.buyerCredits) + n(i.homeWarranty) + n(i.miscSelling);
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
    return {
      loanAmount: r2(loan), ltv: price ? loan / price : 0, downPayment: r2(down), loanFee: r2(loanFee), daysHeld: days,
      cashToClose: r2(cashToClose), buyingCosts: r2(buyingCosts), rehabUsed: r2(rehabUsed), interest: r2(interest),
      holdingCosts: r2(holding), sellingCosts: r2(selling), totalCost: r2(totalCost), profit: r2(profit),
      cashInvested: r2(cashInvested), roiCash: roiCash, roiCost: roiCost, simpleAnnual: ann.simple, compoundAnnual: ann.compound,
      maxOffer: r2(maxOffer), over80: over80, rating: rating
    };
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
    var inv = (f.investors || []).map(function (x) {
      var share = profit * n(x.split);
      return { name: x.name, capital: n(x.capital), split: n(x.split), profitShare: r2(share), distribution: r2(n(x.capital) + share) };
    });
    return { totalCost: r2(totalCost), profit: r2(profit), roiCash: roiCash, roiCost: roiCost, daysHeld: days,
      needsSaleDate: sold && !f.saleDate, needsPurchaseDate: !f.purchaseDate, simpleAnnual: ann.simple, compoundAnnual: ann.compound,
      investors: inv, rehabVariance: r2(n(f.rehabSpent) - n(f.rehabBudget)) };
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
      totalRoi: cash > 0 && value > 0 ? (equity - cash + cfToDate) / cash : null, cashFlowToDate: r2(cfToDate), monthsHeld: months, daysHeld: days };
  }

  var api = { estimate: estimate, flip: flip, holding: holding, daysBetween: daysBetween, annualize: annualize, n: n };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FlipCalc = api;
})(this);
