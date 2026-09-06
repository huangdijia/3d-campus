import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  atlasHref,
  readAtlasLocation,
  normalizeLocation,
  emptyLocation,
} from '../app/ui/atlas-location.ts';
const schools = JSON.parse(
  fs.readFileSync('app/data/universities.json', 'utf8'),
);
const read = (href) => {
  const u = new URL(href, 'https://atlas.test');
  return readAtlasLocation(u.pathname, u.search, schools);
};
test('school links restore school details without entering its campus', () => {
  const s = read('/university/10003');
  assert.equal(s.schoolId, '10003');
  assert.equal(s.campusId, null);
  assert.equal(atlasHref(s), '/university/10003');
});
test('Chinese filters and campus building selection round trip in one URL', () => {
  const state = normalizeLocation(
    {
      ...emptyLocation,
      query: '清华 大学',
      province: '北京',
      tag: '985',
      schoolId: '10003',
      campusId: '10003',
      poiId: '83805067',
      buildingQuery: '清华学堂',
    },
    schools,
  );
  const href = atlasHref(state);
  assert.equal(
    new URL(href, 'https://atlas.test').searchParams.get('poi'),
    '83805067',
  );
  assert.deepEqual(read(href), state);
});
test('campus modes restore independently and discard incompatible building detail', () => {
  const s = read('/university/10003/campus/main?mode=walk&poi=83805067');
  assert.equal(s.mode, 'walk');
  assert.equal(s.poiId, null);
  assert.equal(read('/university/10003/campus/main?mode=tour').mode, 'tour');
});
test('invalid campus capabilities and untrusted query parameters are normalized', () => {
  const nonS = schools.find((u) => u.tier !== 'S' && u.campusId);
  assert.equal(
    read(`/university/${nonS.id}/campus/main?mode=walk`).mode,
    'overview',
  );
  const missing = schools.find((u) => !u.campusId);
  assert.equal(read(`/university/${missing.id}/campus/main`).campusId, null);
  assert.deepEqual(
    read('/university/999999?province=nope&type=bad&mode=walk'),
    emptyLocation,
  );
  assert.equal(
    read('/university/10003/campus/main?poi=javascript:alert(1)').poiId,
    null,
  );
});
test('directory links explicitly clear cached content instead of inheriting it', () =>
  assert.deepEqual(read('/'), emptyLocation));
