import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutMapLabels, overlaps } from '../app/ui/map-label-layout.ts';

const dense = (count, x, y) =>
  Array.from({ length: count }, (_, i) => ({
    id: `school-${i}`,
    x: x + (i % 2),
    y: y + (i % 3),
    width: 112,
    height: 36,
    priority: i === 4 ? 10000 : 1,
  }));
const verify = (result, bounds) => {
  result.placed.forEach((a, i) => {
    assert.ok(a.left >= bounds.left && a.top >= bounds.top);
    assert.ok(a.left + a.width <= bounds.right);
    assert.ok(a.top + a.height <= bounds.bottom);
    result.placed
      .slice(i + 1)
      .forEach((b) => assert.equal(overlaps(a, b), false));
  });
};
test('five coincident universities stay separate on desktop and mobile through pan and zoom', () => {
  for (const [width, height] of [
    [727, 717],
    [390, 844],
    [320, 568],
  ]) {
    const bounds = {
      left: 12,
      top: 76,
      right: width - 12,
      bottom: height - 58,
    };
    for (const [x, y] of [
      [width / 2, height / 2],
      [20, 100],
      [width - 20, height - 80],
    ]) {
      const anchors = dense(5, x, y);
      const result = layoutMapLabels(anchors, bounds);
      assert.equal(result.placed.length, 5);
      assert.equal(result.placed[0].id, 'school-4');
      verify(result, bounds);
      assert.deepEqual(layoutMapLabels([...anchors].reverse(), bounds), result);
    }
  }
});
test('overflow preserves every identity and selected priority in a constrained viewport', () => {
  const bounds = { left: 12, top: 76, right: 220, bottom: 240 };
  const anchors = dense(50, 115, 160);
  const result = layoutMapLabels(anchors, bounds);
  verify(result, bounds);
  assert.equal(result.placed[0].id, 'school-4');
  assert.ok(result.overflow.length > 0);
  assert.deepEqual(
    [...result.placed.map((p) => p.id), ...result.overflow].sort(),
    anchors.map((p) => p.id).sort(),
  );
});
