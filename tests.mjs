import assert from 'node:assert/strict';
import { DEFAULTS, analyzeScenario, budgetOf, simulatePath, targetCapitalAtAge } from './model.js';

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
console.log('Financial model tests passed.');
