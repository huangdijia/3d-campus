import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './register-typescript.mjs';
const schools = JSON.parse(
  fs.readFileSync('app/data/universities.json', 'utf8'),
);
const { filterUniversities, inside, project } =
  await import('../app/ui/geo.ts');
test('historical labels overlap without double-counting university identities', () => {
  assert.equal(schools.length, 115);
  assert.equal(schools.filter((u) => u.is985).length, 39);
  assert.equal(new Set(schools.map((u) => u.id)).size, 115);
  assert(schools.every((u) => u.is211));
});
test('985 filter intersects region and search instead of overriding them', () => {
  const a = filterUniversities(schools, '大学', '华北', '985');
  assert(a.length > 0 && a.length < 39);
  assert(
    a.every(
      (u) =>
        u.is985 &&
        ['北京', '天津', '河北', '山西', '内蒙古'].includes(u.province) &&
        u.name.includes('大学'),
    ),
  );
  assert.equal(
    filterUniversities(schools, '不存在的检索', '全部地区', '全部').length,
    0,
  );
});

test('seven regions partition all universities without changing their provinces', async () => {
  const { REGION_NAMES, countRegions, provinceRegion } =
    await import('../app/ui/regions.ts');
  const counts = countRegions(schools);
  assert.equal(REGION_NAMES.length, 7);
  assert.equal(
    REGION_NAMES.reduce((sum, region) => sum + counts[region], 0),
    115,
  );
  assert.equal(counts['全部地区'], 115);
  assert(schools.every((u) => provinceRegion(u.province)));
  assert.equal(provinceRegion(undefined), null);
  assert.equal(provinceRegion({}), null);
  const southwest = filterUniversities(schools, '', '西南', '全部');
  assert(
    southwest.every((u) =>
      ['四川', '重庆', '贵州', '云南', '西藏'].includes(u.province),
    ),
  );
  assert.equal(
    southwest.length,
    schools.filter((u) =>
      ['四川', '重庆', '贵州', '云南', '西藏'].includes(u.province),
    ).length,
  );
  assert.deepEqual(filterUniversities(schools, '', '四川', '全部'), southwest);
});

test('southwest, search and exclusive 211 filters produce the correct intersection', () => {
  assert.deepEqual(
    filterUniversities(schools, '交通', '西南', '211-only').map((u) => u.name),
    ['西南交通大学'],
  );
  assert.equal(filterUniversities(schools, '交通', '西南', '985').length, 0);
  assert.equal(filterUniversities(schools, '清华', '西南', '全部').length, 0);
  const independentExpected = schools.filter(
    (u) =>
      !u.is985 && ['四川', '重庆', '贵州', '云南', '西藏'].includes(u.province),
  );
  assert.deepEqual(
    filterUniversities(schools, '', '西南', '211-only'),
    independentExpected,
  );
});
test('preview filter excludes schools with missing campus assets', () => {
  const result = filterUniversities(schools, '', '全部地区', '可预览');
  assert(result.length > 0);
  assert(result.every((u) => u.campusId));
});
test('national projection places east to right and north up', () => {
  const b = project(116, 40),
    s = project(121, 31);
  assert(b[0] < s[0]);
  assert(b[1] < s[1]);
});
test('point in polygon handles concave grounds without filling the cutout', () => {
  const ring = [
    [0, 0],
    [4, 0],
    [4, 1],
    [1, 1],
    [1, 4],
    [0, 4],
    [0, 0],
  ];
  assert(inside([0.5, 3], ring));
  assert(inside([3, 0.5], ring));
  assert(!inside([3, 3], ring));
  assert(!inside([5, 0], ring));
});

test('211-only excludes the 39 overlapping 985 universities', () => {
  const r = filterUniversities(schools, '', '全部地区', '211-only');
  assert.equal(r.length, 76);
  assert(r.every((u) => !u.is985 && u.is211));
});
