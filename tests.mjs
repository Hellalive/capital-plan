import assert from 'node:assert/strict';
import { DEFAULTS, analyzeScenario, applyGoalStrategy, budgetOf, planForTarget, simulatePath, targetCapitalAtAge } from './model.js';

const config = { ...DEFAULTS };
const budget = budgetOf(config);
assert.equal(budget.income, 3000);
assert.equal(budget.living, 2000);
assert.equal(budget.balance, 200);
assert.ok(targetCapitalAtAge(config, 50) > targetCapitalAtAge(config, 70));
assert.equal(simulatePath(config, config.horizonAge - 1, 1).success, true);

const result = analyzeScenario(config, { quickRuns: 40, detailRuns: 80, stressRuns: 40 });
assert.ok(result.possibleAge === null || result.possibleAge >= config.age);
assert.ok(result.probability >= 0 && result.probability <= 1);
assert.equal(result.quantiles.length, config.horizonAge - config.age + 1);

const incomePlan = applyGoalStrategy(config, 'income', 300);
assert.equal(incomePlan.breakdown.incomeIncrease, 300);
assert.equal(incomePlan.config.monthlyInvest, 1100); // 600 + 200 non alloués + 300 nouveaux revenus

const goal = planForTarget(config, 60, 90, { quickRuns: 25, detailRuns: 50 });
assert.equal(goal.targetAge, 60);
assert.equal(goal.plans.length, 3);
assert.ok(goal.baseline.probabilities.central >= 0 && goal.baseline.probabilities.central <= 1);
console.log('Financial model tests passed.');
