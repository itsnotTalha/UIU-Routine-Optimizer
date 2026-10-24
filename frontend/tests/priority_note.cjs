const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readFileSync} = require('node:fs');
const source = readFileSync('frontend/preferences.js', 'utf8');
test('compact note updates ranks, labels fallbacks, and hides without priorities', () => {
  const nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, {classList: {values: new Set(), remove(name) {this.values.delete(name);}, toggle(name, enabled) {if (enabled) this.values.add(name); else this.values.delete(name);}}, children: [], replaceChildren() {this.children = [];}, append(item) {this.children.push(item);}});
    return nodes.get(id);
  };
  const scope = {document: {getElementById: get, createElement: () => ({})}};
  vm.runInNewContext(source.slice(source.indexOf('function renderRoutinePriorityNote'), source.indexOf('window.renderPreferenceReport =')), scope);
  const firstChoice = {course_name: 'Matched', faculty: 'Preferred', section: 'A', faculty_rank: 1, section_rank: 1, has_section_priority: true};
  scope.renderRoutinePriorityNote({priority_matches: [firstChoice,
    {course_name: 'CSE 3812 — AI Lab', faculty: 'Siana Rizwan', section: 'H', faculty_rank: 2, section_rank: null, has_section_priority: false}
  ]});
  assert.ok(get('routine-priority-note').classList.values.has('priority-warning'));
  assert.equal(get('routine-priority-summary').textContent, '⚠ Lower-priority choices · 1 course');
  assert.equal(get('routine-priority-matches').children.length, 1);
  assert.equal(get('routine-priority-matches').children[0].textContent, 'CSE 3812: Faculty #1 → #2 · Siana Rizwan');
  scope.renderRoutinePriorityNote({priority_matches: [
    {course_name: 'C', faculty: 'Teacher', section: 'B', faculty_rank: 1, section_rank: 2, has_section_priority: true}
  ]});
  assert.equal(get('routine-priority-matches').children[0].textContent, 'C: Section priority #1 → #2 · Section B');
  scope.renderRoutinePriorityNote({priority_matches: [
    {course_name: 'C', faculty: 'Teacher', section: 'A', faculty_rank: 2, section_rank: null, has_section_priority: true}
  ]});
  assert.equal(get('routine-priority-matches').children.length, 1);
  assert.equal(get('routine-priority-matches').children[0].textContent, 'C: Faculty #1 → #2 · Teacher; Section priority #1 → unranked fallback · Section A');
  scope.renderRoutinePriorityNote({priority_matches: [firstChoice]});
  assert.ok(!get('routine-priority-note').classList.values.has('priority-warning'));
  assert.equal(get('routine-priority-note').hidden, true);
  assert.equal(get('routine-priority-matches').children.length, 0);
  scope.renderRoutinePriorityNote(undefined);
  assert.equal(get('routine-priority-note').hidden, true);
  assert.equal(get('routine-priority-matches').children.length, 0);
});
