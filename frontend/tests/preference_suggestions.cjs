const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const source = readFileSync('frontend/preferences.js', 'utf8');

function setup() {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {value: '', hidden: false, disabled: false,
      classList: {add() {}}, replaceChildren() {this.cleared = true;},
      querySelector() {return node('note');}});
    return nodes.get(id);
  };
  let context = 'original';
  const calls = [];
  const scope = {window: {}, document: {getElementById: node},
    earliestInput: node('earliest-start'), earliestSelect: node('earliest-start-select'),
    latestInput: node('latest-end'), latestSelect: node('latest-end-select'),
    selectedCourses: new Map([['one', ['Teacher']]]),
    renderCatalogList() {}, renderSelectedCourses() {}, renderGlobalFacultyChecklist() {},
    addFixedSlot(slot) {calls.push(slot);},
    getSchedulingPreferences: () => ({max_classes_per_day: 1}),
    dailyLimitContext: () => context,
    showError(message) {calls.push(message);},
    async applySchedulingPreferences(source) {calls.push(source);}
  };
  vm.runInNewContext(source.slice(source.indexOf('function applySuggestedChanges'), source.indexOf('// Reset All Filters')), scope);
  return {scope, node, calls, stale() {context = 'changed';}};
}

test('applies combined changes and reruns the originating search', async () => {
  const {scope, node, calls} = setup();
  node('earliest-start').value = '11:00';
  node('max-classes-per-day').value = '3';
  scope.window.renderDailyLimitSuggestion(null, 'catalog', {
    changes: {earliest_start: null, min_gap: null, faculties: {}, campus_days: null}, suggestion: 'Relax these filters.'
  });
  assert.equal(node('daily-limit-suggestion').hidden, false);
  await node('btn-apply-daily-limit').onclick();
  assert.equal(node('earliest-start').value, '');
  assert.equal(node('earliest-start-select').value, '');
  assert.equal(node('max-classes-per-day').value, '3');
  assert.equal(scope.selectedCourses.get('one').length, 0);
  assert.deepEqual(calls, ['catalog']);
});

test('stale suggestions do not change settings or run a search', async () => {
  const {scope, node, calls, stale} = setup();
  node('earliest-start').value = '11:00';
  scope.window.renderDailyLimitSuggestion(null, 'manual', {changes: {earliest_start: null}, suggestion: 'Clear start.'});
  stale();
  await node('btn-apply-daily-limit').onclick();
  assert.equal(node('earliest-start').value, '11:00');
  assert.match(calls[0], /have changed/);
});

test('daily limit still takes precedence and unverified advice has no button', async () => {
  const {scope, node, calls} = setup();
  scope.window.renderDailyLimitSuggestion({requested: 1, suggested: 2}, 'manual', {changes: {fixed_slots: []}});
  await node('btn-apply-daily-limit').onclick();
  assert.equal(node('max-classes-per-day').value, 2);
  assert.equal(node('fixed-slots-list').cleared, undefined);
  assert.deepEqual(calls, ['manual']);
  scope.window.renderDailyLimitSuggestion(null, 'manual', {message: 'Unverified'});
  assert.equal(node('daily-limit-suggestion').hidden, true);
  assert.equal(node('btn-apply-daily-limit').onclick, null);
});

test('fixed-slot suggestion clears only the specified commitments', () => {
  const {scope, node} = setup();
  scope.applySuggestedChanges({fixed_slots: []});
  assert.equal(node('fixed-slots-list').cleared, true);
  assert.equal(node('add-fixed-slot').disabled, false);
  assert.deepEqual(scope.selectedCourses.get('one'), ['Teacher']);
});
