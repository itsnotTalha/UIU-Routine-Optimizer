const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readFileSync} = require('node:fs');
const source = readFileSync('frontend/preferences.js', 'utf8');
test('compact note updates ranks, labels fallbacks, and hides without priorities', () => {
  const nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, {children: [], replaceChildren() {this.children = [];}, append(item) {this.children.push(item);}});
    return nodes.get(id);
  };
  const scope = {document: {getElementById: get, createElement: () => ({})}};
  vm.runInNewContext(source.slice(source.indexOf('function renderRoutinePriorityNote'), source.indexOf('window.renderPreferenceReport =')), scope);
  scope.renderRoutinePriorityNote({priority_matches: [
    {course_name: 'C — Course', faculty: 'Teacher', section: 'B', faculty_rank: 1, section_rank: 2, has_section_priority: true}
  ]});
  assert.match(get('routine-priority-summary').textContent, /Faculty #1: 1\/1 · Section #1: 0\/1/);
  assert.match(get('routine-priority-matches').children[0].textContent, /Section B \(#2\)/);
  scope.renderRoutinePriorityNote({priority_matches: [
    {course_name: 'C', faculty: 'Teacher', section: 'A', faculty_rank: 2, section_rank: null, has_section_priority: true}
  ]});
  assert.equal(get('routine-priority-matches').children.length, 1);
  assert.match(get('routine-priority-matches').children[0].textContent, /fallback/);
  scope.renderRoutinePriorityNote(undefined);
  assert.equal(get('routine-priority-note').hidden, true);
  assert.equal(get('routine-priority-matches').children.length, 0);
});
