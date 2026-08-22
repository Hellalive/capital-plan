export const DEFAULTS = Object.freeze({
  age: 38,
  horizonAge: 95,
  portfolio: 40000,
  reserve: 8000,
  salary: 3000,
  otherIncome: 0,
  housing: 850,
  food: 350,
  transport: 200,
  bills: 250,
  debtPayment: 0,
  leisure: 250,
  otherExpense: 100,
  monthlyInvest: 600,
  monthlySafety: 200,
  reserveMonths: 6,
  spendingBuffer: 10,
  pensionAge: 67,
  pensionIncome: 1500,
  redirectSafety: true,
  flexSpending: true,
  salaryGrowth: 0,
  investSalaryGrowth: true,
  debtEndAge: 55,
  housingChangeAge: 67,
  housingChange: 0,
  careerBreakAge: 45,
  careerBreakMonths: 0,
  careerBreakIncome: 0,
  oneOffAge: 50,
  oneOffAmount: 0,
  realEstateEquity: 0,
  realEstateSaleAge: 70,
  returnRate: 7,
  volatility: 15,
  inflation: 2.5,
  fees: 0.25,
  withdrawalRate: 3.5,
  successTarget: 90,
  transactionTax: 0.12,
  capitalGainsTax: 10,
  gainAllowance: 10000,
  costBasisRatio: 75,
  accountTax: 0.30,
  accountTaxThreshold: 1000000
});

export const SCENARIOS = Object.freeze({
  prudent: { returnRate: 5, volatility: 18, inflation: 3, label: 'Prudent' },
  central: { returnRate: 7, volatility: 15, inflation: 2.5, label: 'Central' },
  favorable: { returnRate: 8.5, volatility: 13, inflation: 2, label: 'Favorable' }
});

export function budgetOf(config) {
  const income = config.salary + config.otherIncome;
  const essentials = config.housing + config.food + config.transport + config.bills + config.debtPayment;
  const flexible = config.leisure + config.otherExpense;
  const living = essentials + flexible;
  const allocations = config.monthlyInvest + config.monthlySafety;
  const balance = income - living - allocations;
  return { income, essentials, flexible, living, allocations, balance };
}

function livingAtAge(config, budget, age) {
  const debtRelief = age >= config.debtEndAge ? config.debtPayment : 0;
  const housingDelta = age >= config.housingChangeAge ? config.housingChange : 0;
  return Math.max(0, budget.living - debtRelief + housingDelta);
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalGenerator(random) {
  let spare = null;
  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = random();
    while (v === 0) v = random();
    const mag = Math.sqrt(-2 * Math.log(u));
    spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

function annualRealReturn(config) {
  return (1 + config.returnRate / 100) / (1 + config.inflation / 100) - 1 - config.fees / 100;
}

function debitForSpending(state, netNeed, config) {
  if (netNeed <= 0) return 0;
  const tob = config.transactionTax / 100;
  const gainRate = config.capitalGainsTax / 100;
  const grossSale = netNeed / Math.max(.8, 1 - tob);
  const gainShare = state.portfolio > 0 ? Math.max(0, 1 - state.costBasis / state.portfolio) : 0;
  const realizedGain = grossSale * gainShare;
  const allowanceLeft = Math.max(0, config.gainAllowance - state.realizedGainsThisYear);
  const taxableGain = Math.max(0, realizedGain - allowanceLeft);
  const tax = taxableGain * gainRate;
  state.realizedGainsThisYear += realizedGain;
  const totalDebit = grossSale + tax;
  const basisReduction = Math.min(state.costBasis, grossSale * (1 - gainShare));
  state.costBasis -= basisReduction;
  return totalDebit;
}

export function targetCapitalAtAge(config, age) {
  const budget = budgetOf(config);
  const pension = config.pensionIncome * 12;
  const years = Math.max(0, Math.ceil(config.horizonAge - age));
  const discount = .015;
  let presentValue = 0;
  for (let year = 0; year < years; year += 1) {
    const futureAge = age + year;
    const spending = livingAtAge(config, budget, futureAge) * (1 + config.spendingBuffer / 100) * 12;
    const gap = Math.max(0, spending - (futureAge >= config.pensionAge ? pension : 0));
    presentValue += gap / ((1 + discount) ** (year + 1));
  }
  return presentValue * 1.08;
}

export function simulatePath(config, retireAge, seed = 1, options = {}) {
  const budget = budgetOf(config);
  const totalMonths = Math.max(1, Math.round((config.horizonAge - config.age) * 12));
  const retirementMonth = Math.max(0, Math.round((retireAge - config.age) * 12));
  const reserveTarget = budget.living * config.reserveMonths;
  const random = mulberry32(seed);
  const normal = normalGenerator(random);
  const sigma = config.volatility / 100;
  const expectedReal = Math.max(-.95, annualRealReturn(config));
  const logMeanMonthly = (Math.log(1 + expectedReal) - .5 * sigma * sigma) / 12;
  const logSigmaMonthly = sigma / Math.sqrt(12);
  const deterministicMonthly = (1 + expectedReal) ** (1 / 12) - 1;
  const state = {
    portfolio: Math.max(0, config.portfolio),
    reserve: Math.max(0, config.reserve),
    costBasis: Math.max(0, config.portfolio * config.costBasisRatio / 100),
    realizedGainsThisYear: 0
  };
  let failed = false;
  let previousYearReturn = 0;
  let yearReturnFactor = 1;
  const balances = options.collect ? [state.portfolio] : null;
  const careerBreakStart = Math.max(0, Math.round((config.careerBreakAge - config.age) * 12));
  const careerBreakEnd = careerBreakStart + Math.max(0, Math.round(config.careerBreakMonths));
  const oneOffMonth = Math.max(0, Math.round((config.oneOffAge - config.age) * 12));
  const realEstateSaleMonth = Math.max(0, Math.round((config.realEstateSaleAge - config.age) * 12));

  for (let month = 0; month < totalMonths; month += 1) {
    const age = config.age + month / 12;
    const retired = month >= retirementMonth;
    const monthsRetired = month - retirementMonth;
    if (month % 12 === 0) {
      state.realizedGainsThisYear = 0;
      yearReturnFactor = 1;
    }

    let monthlyReturn;
    if (options.deterministic) {
      monthlyReturn = deterministicMonthly;
    } else {
      monthlyReturn = Math.exp(logMeanMonthly + logSigmaMonthly * normal()) - 1;
    }
    if (retired && options.stress === 'inflation' && monthsRetired < 36) {
      monthlyReturn -= .025 / 12;
    }
    if (retired && options.stress === 'crash' && monthsRetired === 0) {
      monthlyReturn = -.35;
    }
    yearReturnFactor *= 1 + monthlyReturn;

    state.portfolio = Math.max(0, state.portfolio * (1 + monthlyReturn));
    if (state.portfolio > config.accountTaxThreshold) {
      state.portfolio -= state.portfolio * (config.accountTax / 100) / 12;
    }

    if (month === oneOffMonth && config.oneOffAmount !== 0) {
      if (config.oneOffAmount > 0) {
        state.portfolio += config.oneOffAmount * (1 - config.transactionTax / 100);
        state.costBasis += config.oneOffAmount;
      } else {
        const debit = debitForSpending(state, -config.oneOffAmount, config);
        if (debit > state.portfolio) failed = true;
        state.portfolio = Math.max(0, state.portfolio - debit);
      }
    }
    if (month === realEstateSaleMonth && config.realEstateEquity > 0) {
      state.portfolio += config.realEstateEquity * (1 - config.transactionTax / 100);
      state.costBasis += config.realEstateEquity;
    }

    if (!retired) {
      const currentLiving = livingAtAge(config, budget, age);
      const onCareerBreak = config.careerBreakMonths > 0 && month >= careerBreakStart && month < careerBreakEnd;
      const grownSalary = config.salary * ((1 + config.salaryGrowth / 100) ** Math.max(0, age - config.age));
      const workingIncome = (onCareerBreak ? config.careerBreakIncome : grownSalary) + config.otherIncome;
      const availableAfterLiving = workingIncome - currentLiving;
      const safetyRoom = Math.max(0, reserveTarget - state.reserve);
      const safetyFlow = Math.min(config.monthlySafety, safetyRoom, Math.max(0, availableAfterLiving));
      state.reserve += safetyFlow;
      const redirected = config.redirectSafety && safetyRoom <= config.monthlySafety ? config.monthlySafety - safetyFlow : 0;
      const salaryIncrease = config.investSalaryGrowth && !onCareerBreak ? Math.max(0, grownSalary - config.salary) : 0;
      const plannedInvestment = onCareerBreak ? 0 : config.monthlyInvest + redirected + salaryIncrease;
      const contribution = availableAfterLiving < 0 ? availableAfterLiving : Math.min(plannedInvestment, Math.max(0, availableAfterLiving - safetyFlow));
      if (contribution >= 0) {
        const netContribution = contribution * (1 - config.transactionTax / 100);
        state.portfolio += netContribution;
        state.costBasis += contribution;
      } else {
        const debit = debitForSpending(state, -contribution, config);
        if (debit > state.portfolio) failed = true;
        state.portfolio = Math.max(0, state.portfolio - debit);
      }
    } else {
      const pension = options.stress === 'no-pension' ? 0 : (age >= config.pensionAge ? config.pensionIncome : 0);
      const baseSpending = livingAtAge(config, budget, age) * (1 + config.spendingBuffer / 100);
      const guardrailCut = config.flexSpending && previousYearReturn < -.10 ? budget.flexible * .20 : 0;
      const netNeed = Math.max(0, baseSpending - guardrailCut - pension);
      const debit = debitForSpending(state, netNeed, config);
      if (debit > state.portfolio + .01) failed = true;
      state.portfolio = Math.max(0, state.portfolio - debit);
    }

    if (state.portfolio <= 0 && retired) {
      const pension = options.stress === 'no-pension' ? 0 : (age >= config.pensionAge ? config.pensionIncome : 0);
      if (pension + .01 < livingAtAge(config, budget, age) * (1 + config.spendingBuffer / 100)) failed = true;
    }

    if ((month + 1) % 12 === 0) {
      previousYearReturn = yearReturnFactor - 1;
      if (balances) balances.push(state.portfolio);
    }
  }

  return { success: !failed, finalPortfolio: state.portfolio, reserve: state.reserve, balances };
}

export function successProbability(config, retireAge, runs = 300, stress = null, collect = false) {
  let successes = 0;
  const paths = collect ? [] : null;
  const finalValues = [];
  for (let i = 0; i < runs; i += 1) {
    const result = simulatePath(config, retireAge, 9127 + i * 7919 + Math.round(retireAge * 101), { stress, collect });
    if (result.success) successes += 1;
    finalValues.push(result.finalPortfolio);
    if (paths) paths.push(result.balances);
  }
  return { probability: successes / runs, paths, finalValues };
}

export function findIndependenceWindow(config, quickRuns = 220) {
  const maxCandidateAge = Math.min(75, config.horizonAge - 10);
  const target = config.successTarget / 100;
  let possibleAge = null;
  let robustAge = null;
  const probabilities = [];
  for (let age = config.age; age <= maxCandidateAge; age += 1) {
    const probability = successProbability(config, age, quickRuns).probability;
    probabilities.push({ age, probability });
    if (possibleAge === null && probability >= .5) possibleAge = age;
    if (robustAge === null && probability >= target) {
      robustAge = age;
      break;
    }
  }
  return { possibleAge, robustAge, probabilities, maxCandidateAge };
}

export function analyzeScenario(config, options = {}) {
  const quickRuns = options.quickRuns ?? 220;
  const detailRuns = options.detailRuns ?? 700;
  const stressRuns = options.stressRuns ?? 320;
  const window = findIndependenceWindow(config, quickRuns);
  const targetProbability = config.successTarget / 100;
  let robustAge = window.robustAge;
  let evaluatedAge = robustAge ?? window.maxCandidateAge;
  let detail = successProbability(config, evaluatedAge, detailRuns, null, true);
  while (robustAge !== null && detail.probability < targetProbability && evaluatedAge < window.maxCandidateAge) {
    evaluatedAge += 1;
    detail = successProbability(config, evaluatedAge, detailRuns, null, true);
  }
  if (robustAge !== null) robustAge = detail.probability >= targetProbability ? evaluatedAge : null;
  const yearCount = Math.max(1, Math.ceil(config.horizonAge - config.age));
  const quantiles = [];
  for (let year = 0; year <= yearCount; year += 1) {
    const values = detail.paths.map(path => path[Math.min(year, path.length - 1)] ?? 0).sort((a, b) => a - b);
    quantiles.push({
      age: config.age + year,
      low: percentile(values, .10),
      median: percentile(values, .50),
      high: percentile(values, .90),
      target: targetCapitalAtAge(config, config.age + year)
    });
  }
  const retirementIndex = Math.max(0, Math.min(quantiles.length - 1, Math.round(evaluatedAge - config.age)));
  const stress = {
    crash: successProbability(config, evaluatedAge, stressRuns, 'crash').probability,
    inflation: successProbability(config, evaluatedAge, stressRuns, 'inflation').probability,
    noPension: successProbability(config, evaluatedAge, stressRuns, 'no-pension').probability
  };
  return {
    ...window,
    robustAge,
    evaluatedAge,
    probability: detail.probability,
    medianCapitalAtRetirement: quantiles[retirementIndex]?.median ?? 0,
    quantiles,
    stress
  };
}

function reduceFlexibleSpending(config, amount) {
  const next = { ...config };
  const totalFlexible = config.leisure + config.otherExpense;
  const cut = Math.min(Math.max(0, amount), totalFlexible);
  if (totalFlexible > 0) {
    next.leisure = Math.max(0, config.leisure - cut * config.leisure / totalFlexible);
    next.otherExpense = Math.max(0, config.otherExpense - cut * config.otherExpense / totalFlexible);
  }
  return { config: next, cut };
}

export function applyGoalStrategy(config, type, effort = 0) {
  const budget = budgetOf(config);
  const reallocated = Math.max(0, budget.balance);
  let next = { ...config, monthlyInvest: config.monthlyInvest + reallocated };
  let expenseCut = 0;
  let incomeIncrease = 0;

  if (type === 'spending') {
    const reduced = reduceFlexibleSpending(next, effort);
    next = reduced.config;
    expenseCut = reduced.cut;
    next.monthlyInvest += expenseCut;
  } else if (type === 'income') {
    incomeIncrease = Math.max(0, effort);
    next.otherIncome += incomeIncrease;
    next.monthlyInvest += incomeIncrease;
  } else if (type === 'balanced') {
    const desiredExpenseCut = Math.max(0, effort) / 2;
    const reduced = reduceFlexibleSpending(next, desiredExpenseCut);
    next = reduced.config;
    expenseCut = reduced.cut;
    incomeIncrease = Math.max(0, effort - expenseCut);
    next.otherIncome += incomeIncrease;
    next.monthlyInvest += expenseCut + incomeIncrease;
  }

  return {
    config: next,
    breakdown: {
      reallocated,
      expenseCut,
      incomeIncrease,
      totalNewEffort: expenseCut + incomeIncrease,
      resultingInvestment: next.monthlyInvest
    }
  };
}

function requiredEffort(config, type, targetAge, targetProbability, scenario, runs) {
  const scenarioConfig = { ...config, ...SCENARIOS[scenario] };
  const probabilityAt = effort => successProbability(applyGoalStrategy(scenarioConfig, type, effort).config, targetAge, runs).probability;
  const initialProbability = probabilityAt(0);
  if (initialProbability >= targetProbability) return { effort: 0, probability: initialProbability };

  const flexible = budgetOf(config).flexible;
  const technicalLimit = type === 'spending' ? flexible : Math.max(20000, config.salary * 5);
  let high = type === 'spending' ? flexible : 100;
  let highProbability = probabilityAt(high);
  while (highProbability < targetProbability && high < technicalLimit) {
    high = Math.min(technicalLimit, high * 2);
    highProbability = probabilityAt(high);
  }
  if (highProbability < targetProbability) return { effort: null, probability: highProbability, testedEffort: high };

  let low = 0;
  for (let i = 0; i < 11; i += 1) {
    const mid = (low + high) / 2;
    if (probabilityAt(mid) >= targetProbability) high = mid;
    else low = mid;
  }
  return { effort: Math.ceil(high / 10) * 10, probability: probabilityAt(high) };
}

export function planForTarget(config, targetAge = 60, targetPercent = 90, options = {}) {
  const quickRuns = options.quickRuns ?? 100;
  const detailRuns = options.detailRuns ?? 220;
  const targetProbability = targetPercent / 100;
  const boundedTargetAge = Math.max(config.age + 1, Math.min(config.horizonAge - 5, targetAge));
  const marketKeys = ['prudent', 'central', 'favorable'];
  const strategyTypes = ['balanced', 'income', 'spending'];
  const baselineApplied = applyGoalStrategy(config, 'current', 0);
  const baselineProbabilities = Object.fromEntries(marketKeys.map(market => {
    const marketConfig = { ...baselineApplied.config, ...SCENARIOS[market] };
    return [market, successProbability(marketConfig, boundedTargetAge, detailRuns).probability];
  }));

  const plans = strategyTypes.map(type => {
    const requirements = Object.fromEntries(marketKeys.map(market => [
      market,
      requiredEffort(config, type, boundedTargetAge, targetProbability, market, market === 'central' ? detailRuns : quickRuns)
    ]));
    const centralEffort = requirements.central.effort;
    const fallbackEffort = centralEffort ?? requirements.central.testedEffort ?? 0;
    const applied = applyGoalStrategy(config, type, fallbackEffort);
    const probabilities = Object.fromEntries(marketKeys.map(market => {
      const marketConfig = { ...applied.config, ...SCENARIOS[market] };
      return [market, successProbability(marketConfig, boundedTargetAge, detailRuns).probability];
    }));
    return {
      type,
      requirements,
      effort: centralEffort,
      appliedConfig: applied.config,
      breakdown: applied.breakdown,
      probabilities,
      reachesCentralTarget: centralEffort !== null && probabilities.central >= targetProbability
    };
  });

  return {
    targetAge: boundedTargetAge,
    targetPercent,
    baseline: { ...baselineApplied, probabilities: baselineProbabilities },
    plans
  };
}
