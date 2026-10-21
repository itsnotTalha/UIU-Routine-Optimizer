const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readFileSync} = require('node:fs');
const source = readFileSync('frontend/planner.js', 'utf8');
const context = {window: {}};
vm.runInNewContext(source.slice(0, source.indexOf('/* Planner navigation')), context);
const compare = context.window.routineComparisonRows;
const meeting = (name, faculty, start, day = 'Saturday') => ({course_name: name, section: {
  name: 'A', faculty, slots: [{day, start_mins: start, end_mins: start + 60,
    start_time: `${start / 60}:00`, end_time: `${start / 60 + 1}:00`}]
}});

test('comparison calculates daily and weekly gaps, days, teachers and times', () => {
  const left = [meeting('One', 'Teacher A', 600), meeting('Two', 'Teacher B', 720)];
  const right = [meeting('One', 'Teacher C', 660), meeting('Two', 'Teacher B', 720, 'Tuesday')];
  const rows = new Map(compare(left, right).map(([label, a, b]) => [label, [a, b]]));
  assert.deepEqual(rows.get('Campus days'), ['1', '2']);
  assert.deepEqual(rows.get('Weekly gaps'), ['60 min', '0 min']);
  assert.deepEqual(rows.get('Earliest start'), ['10:00', '11:00']);
  assert.match(rows.get('One')[0], /Teacher A/);
  assert.match(rows.get('One')[1], /Teacher C/);
  assert.equal(rows.get('Tuesday')[0], 'Free');
});

test('comparison handles different course sets and empty routines', () => {
  const rows = compare([meeting('One', 'Teacher', 600)], []);
  assert.equal(rows.find(r => r[0] === 'One')[2], 'Not in this routine');
  assert.equal(rows.find(r => r[0] === 'Earliest start')[2], 'No meetings');
});

test('identical routines have no differing rows and source order is preserved', () => {
  const schedule = [meeting('Two', 'Teacher', 720), meeting('One', 'Teacher', 600)];
  const before = JSON.stringify(schedule);
  assert.ok(compare(schedule, schedule).every(row => row[1] === row[2]));
  assert.equal(JSON.stringify(schedule), before);
});
