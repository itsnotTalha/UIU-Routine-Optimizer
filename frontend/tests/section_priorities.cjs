const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readFileSync} = require('node:fs');
const source = readFileSync('frontend/catalog.js', 'utf8');
function setup() {
  const course = {id: 'one', sections: ['A', 'B'].map(name => ({name, faculty: 'Teacher', slots: [{day: 'Saturday', start_time: '09:00', end_time: '10:00'}]}))};
  const scope = {catalog: {courses: [course]}, selectedCourses: new Map([['one', ['Teacher']]]), sectionPriorities: new Map(),
    document: {createElement: () => ({children: [], append(...children) {this.children.push(...children);}, setAttribute() {}})},
    invalidateCatalogResults() {}, persistCatalog() {}, renderCatalogList() {}, renderSelectedCourses() {}, window: {}};
  vm.runInNewContext(source.slice(source.indexOf('function catalogSelections'), source.indexOf('const pdfInput')), scope);
  return {scope, course};
}
test('section buttons rank in click order, show meetings, and toggle off', () => {
  const {scope, course} = setup();
  const buttons = () => scope.renderSectionPriorities(course, ['Teacher']).children[0].children.slice(2);
  assert.match(buttons()[0].textContent, /Saturday 09:00–10:00/);
  buttons()[1].onclick({stopPropagation() {}});
  buttons()[0].onclick({stopPropagation() {}});
  assert.equal(JSON.stringify(scope.catalogSelections()[0].section_priorities), '{"Teacher":["B","A"]}');
  assert.match(buttons()[1].textContent, /#1/);
  buttons()[1].onclick({stopPropagation() {}});
  assert.equal(JSON.stringify(scope.catalogSelections()[0].section_priorities), '{"Teacher":["A"]}');
});
test('serialization drops unavailable sections and deselected faculty priorities', () => {
  const {scope} = setup();
  scope.sectionPriorities.set('one', {Teacher: ['missing', 'B'], Other: ['C']});
  assert.equal(JSON.stringify(scope.catalogSelections()[0].section_priorities), '{"Teacher":["B"]}');
  scope.selectedCourses.set('one', []);
  assert.equal(JSON.stringify(scope.catalogSelections()[0].section_priorities), '{}');
});

test('retained buttons read current priorities on every click', () => {
  const {scope, course} = setup();
  const buttons = scope.renderSectionPriorities(course, ['Teacher']).children[0].children.slice(2);
  buttons[1].onclick({stopPropagation() {}});
  buttons[0].onclick({stopPropagation() {}});
  assert.equal(JSON.stringify(scope.catalogSelections()[0].section_priorities), '{"Teacher":["B","A"]}');
  buttons[1].onclick({stopPropagation() {}});
  assert.equal(JSON.stringify(scope.catalogSelections()[0].section_priorities), '{"Teacher":["A"]}');
});

test('desktop cards refresh section badges and retain successive selections', () => {
  const {scope} = setup();
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.style = {};
      this.classList = {remove() {}}; this.scrollTop = 0;
    }
    append(...nodes) { for (const node of nodes) this.children.push(...(node.tagName === 'FRAGMENT' ? node.children : [node])); }
    appendChild(node) { this.append(node); }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    setAttribute() {}
    addEventListener() {}
    closest() { return null; }
    querySelector(selector) {
      if (selector === '.btn-remove-course') return new Element('button');
      return this.querySelectorAll(selector)[0] || null;
    }
    querySelectorAll(selector) {
      const matches = node => selector.startsWith('.') ? (node.className || '').split(' ').includes(selector.slice(1)) : node.tagName === selector.toUpperCase();
      return this.children.flatMap(node => [...(matches(node) ? [node] : []), ...node.querySelectorAll(selector)]);
    }
  }
  const nodes = new Map();
  scope.document = {
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); },
    createElement: tag => new Element(tag), createDocumentFragment: () => new Element('fragment'),
    activeElement: new Element('body')
  };
  scope.pdfButton = new Element('button');
  scope.renderConstraintFacultySummary = () => {};
  scope.escapeHtml = value => value || '';
  vm.runInNewContext(source.slice(source.indexOf('function renderSelectedCourses()'), source.indexOf('// PDF File Input Listener')), scope);
  scope.renderSelectedCourses();
  const container = scope.document.getElementById('selected-courses');
  const buttons = () => container.querySelectorAll('.section-priority-choice');
  const originalCard = container.children[0];
  buttons()[1].onclick({stopPropagation() {}});
  assert.notEqual(container.children[0], originalCard);
  assert.match(buttons()[1].textContent, /#1 · Section B/);
  buttons()[0].onclick({stopPropagation() {}});
  assert.match(buttons()[0].textContent, /#2 · Section A/);
  assert.match(buttons()[1].textContent, /#1 · Section B/);
  buttons()[1].onclick({stopPropagation() {}});
  assert.match(buttons()[0].textContent, /#1 · Section A/);
  assert.doesNotMatch(buttons()[1].textContent, /#\d/);
});
