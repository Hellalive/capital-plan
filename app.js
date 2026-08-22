import { DEFAULTS, SCENARIOS, analyzeScenario, budgetOf, planForTarget } from './model.js';

const numericIds = Object.keys(DEFAULTS).filter(key => typeof DEFAULTS[key] === 'number');
const booleanIds = Object.keys(DEFAULTS).filter(key => typeof DEFAULTS[key] === 'boolean');
const euro = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });
let renderTimer = null;
let activeRun = 0;
let lastPlannerResult = null;

function readConfig() {
  const config = {};
  numericIds.forEach(id => {
    const input = document.getElementById(id);
    const parsed = Number.parseFloat(input?.value);
    config[id] = Number.isFinite(parsed) ? parsed : DEFAULTS[id];
  });
  booleanIds.forEach(id => { config[id] = document.getElementById(id)?.checked ?? DEFAULTS[id]; });
  config.age = Math.max(18, Math.min(75, config.age));
  config.horizonAge = Math.max(config.age + 10, config.horizonAge);
  config.pensionAge = Math.max(config.age, config.pensionAge);
  return config;
}

function formatEuro(value) {
  return `${euro.format(Math.round(value))} €`;
}

function formatCompactEuro(value) {
  if (Math.abs(value) < 1000) return formatEuro(value);
  return `${compact.format(value).replace('k', ' k').replace('M', ' M')}€`;
}

function formatProbability(value) {
  return `${Math.round(value * 100)} %`;
}

function setText(id, text) {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}

function renderBudget(config) {
  const budget = budgetOf(config);
  const balanceBox = document.getElementById('budgetBalance');
  balanceBox.classList.toggle('negative', budget.balance < 0);
  balanceBox.querySelector('span').textContent = budget.balance >= 0 ? 'Reste non alloué' : 'Budget mensuel déficitaire';
  balanceBox.querySelector('strong').textContent = formatEuro(budget.balance);

  const savingsRate = budget.income > 0 ? budget.allocations / budget.income : 0;
  setText('savingsRate', `${Math.round(savingsRate * 100)} % épargnés`);

  const base = Math.max(1, budget.income, budget.living + budget.allocations);
  const items = [
    { label: 'Vie courante', value: budget.living, color: '#eab45d' },
    { label: 'Investissement', value: config.monthlyInvest, color: '#73d7b2' },
    { label: 'Sécurité', value: config.monthlySafety, color: '#75a6c9' },
    { label: budget.balance >= 0 ? 'Non alloué' : 'Déficit', value: Math.abs(budget.balance), color: budget.balance >= 0 ? '#40544e' : '#e27e68' }
  ];
  document.getElementById('budgetBar').innerHTML = items.map(item => `<span title="${item.label} : ${formatEuro(item.value)}" style="width:${item.value / base * 100}%;background:${item.color}"></span>`).join('');
  document.getElementById('budgetLegend').innerHTML = items.slice(0, 3).map(item => `<div><span><i style="background:${item.color}"></i>${item.label}</span><strong>${formatEuro(item.value)}</strong></div>`).join('');

  const warning = document.getElementById('budgetWarning');
  warning.classList.toggle('warning', budget.balance < 0);
  if (budget.balance < 0) {
    warning.textContent = `Le plan promet ${formatEuro(config.monthlyInvest)} d’investissement mais le budget manque de ${formatEuro(-budget.balance)}. La simulation réduit automatiquement l’investissement pour ne pas créer d’argent fictif.`;
  } else if (budget.balance > 0) {
    warning.textContent = `${formatEuro(budget.balance)} restent volontairement hors simulation. Affecte-les à un poste pour mesurer leur effet.`;
  } else {
    warning.textContent = 'Le budget est entièrement affecté : aucun euro fictif n’est ajouté à la projection.';
  }

  const reserveTarget = budget.living * config.reserveMonths;
  const reserveRatio = reserveTarget > 0 ? config.reserve / reserveTarget : 1;
  const monthsCovered = budget.living > 0 ? config.reserve / budget.living : 0;
  document.getElementById('reserveProgress').style.width = `${Math.min(100, reserveRatio * 100)}%`;
  setText('reserveMonthsNow', `${monthsCovered.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} mois`);
  if (reserveRatio >= 1) {
    setText('reserveStatus', 'Réserve complète');
    setText('reserveDetail', `${formatEuro(config.reserve)} disponibles pour une cible de ${formatEuro(reserveTarget)}. Le versement sécurité peut désormais renforcer le portefeuille.`);
  } else {
    const missing = Math.max(0, reserveTarget - config.reserve);
    const months = config.monthlySafety > 0 ? Math.ceil(missing / config.monthlySafety) : null;
    setText('reserveStatus', `${formatEuro(missing)} à constituer`);
    setText('reserveDetail', months ? `Cible : ${formatEuro(reserveTarget)}. Au rythme actuel, elle serait atteinte dans environ ${months} mois.` : `Cible : ${formatEuro(reserveTarget)}. Aucun versement de sécurité n’est prévu actuellement.`);
  }

  return budget;
}

function resultCopy(config, result, budget) {
  const possible = result.possibleAge;
  const robust = result.robustAge;
  if (possible !== null && robust !== null) {
    setText('fiWindow', possible === robust ? `vers ${robust} ans` : `${possible}–${robust} ans`);
    setText('fiWindowDetail', `de 50 % à ${config.successTarget}% de probabilité de financer le plan jusqu’à ${config.horizonAge} ans`);
  } else if (possible !== null) {
    setText('fiWindow', `${possible}–75+ ans`);
    setText('fiWindowDetail', `le scénario devient possible, mais n’atteint pas encore ${config.successTarget}% de réussite avant 75 ans`);
  } else {
    setText('fiWindow', 'Après 75 ans');
    setText('fiWindowDetail', 'moins de 50 % de réussite dans la plage de départ testée');
  }

  setText('robustAge', robust !== null ? `${robust} ans` : 'Non atteint');
  const currentYear = new Date().getFullYear();
  setText('robustDate', robust !== null ? `vers ${currentYear + robust - config.age} · seuil ${config.successTarget}%` : `avant 75 ans · seuil ${config.successTarget}%`);
  const need = budget.living * (1 + config.spendingBuffer / 100);
  setText('monthlyNeed', `${formatEuro(need)}/mois`);
  const postPensionGap = Math.max(0, need - config.pensionIncome);
  setText('pensionEffect', `puis ${formatEuro(postPensionGap)}/mois à financer après ${config.pensionAge} ans`);

  const score = Math.round(result.probability * 100);
  setText('successScore', `${score} %`);
  document.getElementById('scoreRing').style.setProperty('--score', score);
  setText('fiCapital', formatCompactEuro(result.medianCapitalAtRetirement));

  if (robust !== null) {
    setText('verdictTitle', 'Un plan robuste, sous conditions');
    setText('verdictText', `À ${robust} ans, ${score}% des trajectoires testées financent les dépenses jusqu’à ${config.horizonAge} ans. La fourchette rappelle que quelques années de travail supplémentaires absorbent une grande partie du risque de marché.`);
  } else if (possible !== null) {
    setText('verdictTitle', 'Possible ne veut pas encore dire robuste');
    setText('verdictText', `À ${result.evaluatedAge} ans, le plan réussit dans ${score}% des trajectoires. Réduire les dépenses, augmenter l’investissement ou assouplir l’âge de départ améliorerait la marge.`);
  } else {
    setText('verdictTitle', 'Le budget et l’objectif ne convergent pas encore');
    setText('verdictText', `Même à ${result.evaluatedAge} ans, le plan ne réussit que dans ${score}% des trajectoires. Le modèle n’invente pas de date au-delà de sa zone de décision utile.`);
  }

  const denominator = Math.max(1, result.maxCandidateAge - config.age);
  document.getElementById('rangePossible').style.left = `${Math.max(0, Math.min(100, ((possible ?? result.maxCandidateAge) - config.age) / denominator * 100))}%`;
  document.getElementById('rangeRobust').style.left = `${Math.max(0, Math.min(100, ((robust ?? result.maxCandidateAge) - config.age) / denominator * 100))}%`;

  setText('stressCrash', formatProbability(result.stress.crash));
  setText('stressInflation', formatProbability(result.stress.inflation));
  setText('stressPension', formatProbability(result.stress.noPension));
}

function niceMax(value) {
  if (value <= 0) return 100000;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function renderChart(config, result) {
  const data = result.quantiles;
  const W = 920;
  const H = 350;
  const pad = { left: 58, right: 18, top: 18, bottom: 43 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const visibleHigh = data.map(d => Math.min(d.high, d.median * 3 + 300000));
  const maxValue = niceMax(Math.max(...visibleHigh, ...data.map(d => d.target), 100000));
  const x = index => pad.left + index / Math.max(1, data.length - 1) * plotW;
  const y = value => pad.top + plotH - Math.min(1, Math.max(0, value / maxValue)) * plotH;
  const linePath = key => data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');
  const areaPath = `${data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(Math.min(d.high, visibleHigh[i])).toFixed(1)}`).join(' ')} ${data.slice().reverse().map((d, reverseIndex) => {
    const i = data.length - 1 - reverseIndex;
    return `L${x(i).toFixed(1)},${y(d.low).toFixed(1)}`;
  }).join(' ')} Z`;
  const yTicks = Array.from({ length: 5 }, (_, i) => maxValue * i / 4);
  const specialAges = [...new Set([config.age, result.possibleAge, result.robustAge, config.pensionAge, config.horizonAge].filter(age => age !== null && age >= config.age && age <= config.horizonAge))];
  const decadeAges = [];
  for (let age = Math.ceil(config.age / 10) * 10; age < config.horizonAge; age += 10) {
    if (specialAges.every(special => Math.abs(special - age) >= 3)) decadeAges.push(age);
  }
  const xAges = [...new Set([...specialAges, ...decadeAges])].sort((a, b) => a - b);
  const ageX = age => pad.left + (age - config.age) / (config.horizonAge - config.age) * plotW;
  const robustX = result.robustAge !== null ? ageX(result.robustAge) : null;
  const pensionX = ageX(config.pensionAge);

  document.getElementById('projectionChart').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="riskBand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#73d7b2" stop-opacity=".25"/><stop offset="1" stop-color="#73d7b2" stop-opacity=".035"/></linearGradient>
      </defs>
      ${yTicks.map(value => `<line x1="${pad.left}" y1="${y(value)}" x2="${W - pad.right}" y2="${y(value)}" stroke="#21342f"/><text x="${pad.left - 10}" y="${y(value) + 4}" text-anchor="end" fill="#6d8179" font-size="9">${formatCompactEuro(value)}</text>`).join('')}
      <path d="${areaPath}" fill="url(#riskBand)"/>
      <path d="${linePath('median')}" fill="none" stroke="#73d7b2" stroke-width="2.2"/>
      <path d="${linePath('target')}" fill="none" stroke="#eab45d" stroke-width="1.3" stroke-dasharray="5 5" opacity=".8"/>
      ${pensionX >= pad.left && pensionX <= W - pad.right ? `<line x1="${pensionX}" y1="${pad.top}" x2="${pensionX}" y2="${pad.top + plotH}" stroke="#75a6c9" stroke-width="1" stroke-dasharray="3 5"/><text x="${pensionX + 5}" y="${pad.top + 12}" fill="#75a6c9" font-size="8">PENSION</text>` : ''}
      ${robustX !== null ? `<line x1="${robustX}" y1="${pad.top}" x2="${robustX}" y2="${pad.top + plotH}" stroke="#73d7b2" stroke-width="1" stroke-dasharray="3 5"/><circle cx="${robustX}" cy="${y(data[Math.round(result.robustAge - config.age)]?.median ?? 0)}" r="4" fill="#07100f" stroke="#73d7b2" stroke-width="2"/><text x="${robustX + 5}" y="${pad.top + 25}" fill="#73d7b2" font-size="8">DÉPART ROBUSTE</text>` : ''}
      ${xAges.map(age => `<text x="${ageX(age)}" y="${H - 14}" text-anchor="middle" fill="#71837c" font-size="9">${Math.round(age)}a</text>`).join('')}
    </svg>`;
}

function saveConfig(config) {
  localStorage.setItem('capital-plan-v2', JSON.stringify(config));
}

function restoreConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem('capital-plan-v2'));
    if (!saved) return;
    numericIds.forEach(id => {
      if (Number.isFinite(saved[id]) && document.getElementById(id)) document.getElementById(id).value = saved[id];
    });
    booleanIds.forEach(id => {
      if (typeof saved[id] === 'boolean' && document.getElementById(id)) document.getElementById(id).checked = saved[id];
    });
  } catch { /* Les valeurs par défaut restent utilisables. */ }
}

function readOptionalLimit(id) {
  const value = Number.parseFloat(document.getElementById(id).value);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function probabilityClass(probability, target) {
  if (probability >= target) return 'good';
  if (probability >= target - .2) return 'medium';
  return 'weak';
}

function requirementText(requirement) {
  return requirement?.effort === null ? 'hors portée' : `${euro.format(requirement?.effort ?? 0)} €`;
}

function plannerWarnings(plan, config, limits) {
  const warnings = [];
  const { expenseCut, incomeIncrease, resultingInvestment } = plan.breakdown;
  const flexible = budgetOf(config).flexible;
  const resultingIncome = config.salary + config.otherIncome + incomeIncrease;
  if (plan.effort === null) warnings.push({ danger: true, text: 'Ce levier seul ne suffit pas à atteindre le seuil central.' });
  if (flexible > 0 && expenseCut > flexible * .5) warnings.push({ text: 'La réduction dépasse 50 % des dépenses flexibles actuelles.' });
  if (config.salary > 0 && incomeIncrease > config.salary * .3) warnings.push({ text: 'Le revenu supplémentaire dépasse 30 % du salaire actuel.' });
  if (resultingIncome > 0 && resultingInvestment > resultingIncome * .5) warnings.push({ text: 'Le taux d’investissement dépasserait 50 % des revenus nets.' });
  if (limits.maxCut !== null && expenseCut > limits.maxCut) warnings.push({ danger: true, text: `Hors limite personnelle : réduction supérieure à ${formatEuro(limits.maxCut)}.` });
  if (limits.maxIncome !== null && incomeIncrease > limits.maxIncome) warnings.push({ danger: true, text: `Hors limite personnelle : revenu supplémentaire supérieur à ${formatEuro(limits.maxIncome)}.` });
  if (limits.maxInvestment !== null && resultingInvestment > limits.maxInvestment) warnings.push({ danger: true, text: `Hors limite personnelle : investissement supérieur à ${formatEuro(limits.maxInvestment)}/mois.` });
  return warnings;
}

function planLabel(type) {
  return {
    balanced: ['Plan équilibré', 'Combine revenu et dépenses sans supposer un meilleur marché.'],
    income: ['Revenus d’abord', 'Préserve le niveau de vie et investit chaque revenu supplémentaire.'],
    spending: ['Dépenses flexibles', 'Réduit le besoin futur tout en réinvestissant l’économie réalisée.']
  }[type];
}

function renderPlanner(config, result, limits) {
  const target = result.targetPercent / 100;
  const baseline = result.baseline.probabilities;
  const baselineRange = `${formatProbability(baseline.prudent)}–${formatProbability(baseline.favorable)}`;
  document.getElementById('plannerDiagnosis').innerHTML = `
    <div><h3>Avec le budget actuel optimisé</h3><p>En affectant d’abord le reste non alloué à l’investissement, la probabilité centrale d’être indépendant à ${result.targetAge} ans est de ${formatProbability(baseline.central)}.</p></div>
    <strong>${baselineRange}</strong>`;

  const labels = { prudent: 'Défavorable', central: 'Central', favorable: 'Favorable' };
  document.getElementById('plannerCards').innerHTML = result.plans.map((plan, index) => {
    const [title, description] = planLabel(plan.type);
    const warnings = plannerWarnings(plan, config, limits);
    const breakdown = plan.breakdown;
    const actions = [
      breakdown.reallocated > 0 ? `affecter ${formatEuro(breakdown.reallocated)} aujourd’hui non alloués` : null,
      breakdown.expenseCut > 0 ? `réduire les dépenses flexibles de ${formatEuro(breakdown.expenseCut)}` : null,
      breakdown.incomeIncrease > 0 ? `viser ${formatEuro(breakdown.incomeIncrease)} de revenu net supplémentaire` : null,
      `investir ${formatEuro(breakdown.resultingInvestment)}/mois au total`
    ].filter(Boolean);
    const effort = plan.effort === null ? 'Objectif non atteint' : plan.effort === 0 ? 'Aucun effort supplémentaire' : `+${formatEuro(plan.effort)}/mois`;
    return `<article class="planner-card ${index === 0 ? 'recommended' : ''}">
      <div class="plan-main">
        <div class="plan-topline"><h3>${title}</h3>${index === 0 ? '<span class="plan-badge">Recommandé</span>' : ''}</div>
        <p class="plan-effort">${effort} <small>scénario central</small></p>
        <div class="plan-actions">${actions.map(action => `<span>${action}</span>`).join('')}</div>
        ${warnings.map(warning => `<div class="plan-warning ${warning.danger ? 'danger' : ''}">${warning.text}</div>`).join('')}
      </div>
      ${['prudent','central','favorable'].map(market => `<div class="market-cell ${probabilityClass(plan.probabilities[market], target)}"><strong>${formatProbability(plan.probabilities[market])}</strong><small>${labels[market]}</small></div>`).join('')}
      <div class="plan-footer"><span>Effort nécessaire · favorable ${requirementText(plan.requirements.favorable)} · central ${requirementText(plan.requirements.central)} · défavorable ${requirementText(plan.requirements.prudent)}</span><button type="button" class="apply-plan" data-apply-plan="${index}" ${plan.effort === null ? 'disabled' : ''}>Appliquer au simulateur</button></div>
    </article>`;
  }).join('');

  document.querySelectorAll('[data-apply-plan]').forEach(button => {
    button.addEventListener('click', () => {
      const plan = lastPlannerResult.plans[Number(button.dataset.applyPlan)];
      ['leisure','otherExpense','otherIncome','monthlyInvest'].forEach(id => {
        document.getElementById(id).value = Math.round(plan.appliedConfig[id]);
      });
      document.getElementById('goalDialog').close();
      runAnalysis();
    });
  });
}

function resetPlannerView() {
  const idle = document.getElementById('plannerIdle');
  const results = document.getElementById('plannerResults');
  const loading = document.getElementById('plannerLoading');
  idle.hidden = false;
  results.hidden = true;
  loading.hidden = true;
  idle.querySelector(':scope > span').textContent = document.getElementById('goalAge').value || '60';
}

function markCustomScenario() {
  document.querySelectorAll('[data-scenario]').forEach(button => button.classList.remove('active'));
}

function runAnalysis() {
  const runId = ++activeRun;
  const state = document.getElementById('calculationState');
  state.classList.add('visible');
  const config = readConfig();
  const budget = renderBudget(config);
  saveConfig(config);
  window.setTimeout(() => {
    if (runId !== activeRun) return;
    const result = analyzeScenario(config);
    if (runId !== activeRun) return;
    resultCopy(config, result, budget);
    renderChart(config, result);
    state.classList.remove('visible');
  }, 30);
}

function scheduleAnalysis(event) {
  if (event?.target?.matches('#returnRate, #volatility, #inflation')) markCustomScenario();
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(runAnalysis, 180);
}

document.querySelectorAll('.control-panel input').forEach(input => input.addEventListener('input', scheduleAnalysis));
document.querySelectorAll('[data-scenario]').forEach(button => {
  button.addEventListener('click', () => {
    const values = SCENARIOS[button.dataset.scenario];
    Object.entries(values).forEach(([key, value]) => {
      const input = document.getElementById(key);
      if (input && typeof value === 'number') input.value = value;
    });
    document.querySelectorAll('[data-scenario]').forEach(item => item.classList.toggle('active', item === button));
    scheduleAnalysis();
  });
});

document.getElementById('resetButton').addEventListener('click', () => {
  numericIds.forEach(id => { if (document.getElementById(id)) document.getElementById(id).value = DEFAULTS[id]; });
  booleanIds.forEach(id => { if (document.getElementById(id)) document.getElementById(id).checked = DEFAULTS[id]; });
  document.querySelectorAll('[data-scenario]').forEach(button => button.classList.toggle('active', button.dataset.scenario === 'central'));
  localStorage.removeItem('capital-plan-v2');
  runAnalysis();
});

const goalDialog = document.getElementById('goalDialog');
if (goalDialog) {
document.getElementById('openPlanner')?.addEventListener('click', () => {
  resetPlannerView();
  goalDialog.showModal();
});
document.getElementById('closePlanner').addEventListener('click', () => goalDialog.close());
goalDialog.addEventListener('click', event => {
  if (event.target === goalDialog) goalDialog.close();
});
document.getElementById('goalAge').addEventListener('input', resetPlannerView);
document.getElementById('goalConfidence').addEventListener('input', resetPlannerView);
document.getElementById('runPlanner').addEventListener('click', () => {
  const config = readConfig();
  const requestedAge = Number.parseInt(document.getElementById('goalAge').value, 10);
  const targetPercent = Number.parseInt(document.getElementById('goalConfidence').value, 10);
  const idle = document.getElementById('plannerIdle');
  const results = document.getElementById('plannerResults');
  const loading = document.getElementById('plannerLoading');
  if (!Number.isFinite(requestedAge) || requestedAge <= config.age || requestedAge >= config.horizonAge) {
    idle.hidden = false;
    idle.innerHTML = `<span>!</span><div><strong>Âge cible invalide</strong><p>Choisis un âge compris entre ${config.age + 1} et ${config.horizonAge - 1} ans.</p></div>`;
    return;
  }
  idle.hidden = true;
  results.hidden = true;
  loading.hidden = false;
  window.setTimeout(() => {
    const limits = {
      maxCut: readOptionalLimit('goalMaxCut'),
      maxIncome: readOptionalLimit('goalMaxIncome'),
      maxInvestment: readOptionalLimit('goalMaxInvestment')
    };
    lastPlannerResult = planForTarget(config, requestedAge, Math.max(70, Math.min(99, targetPercent || 90)));
    renderPlanner(config, lastPlannerResult, limits);
    loading.hidden = true;
    results.hidden = false;
  }, 40);
});
}

restoreConfig();
runAnalysis();
