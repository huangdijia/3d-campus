import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './register-typescript.mjs';
const {
  atlasHref,
  readAtlasLocation,
  normalizeLocation,
  emptyLocation,
  migrateStoredRegion,
} = await import('../app/ui/atlas-location.ts');
const schools = JSON.parse(
  fs.readFileSync('app/data/universities.json', 'utf8'),
);
const read = (href) => {
  const u = new URL(href, 'https://atlas.test');
  return readAtlasLocation(u.pathname, u.search, schools);
};
test('legacy school links open the integrated campus destination', () => {
  const s = read('/university/10003');
  assert.equal(s.schoolId, '10003');
  assert.equal(s.campusId, '10003');
  assert.equal(atlasHref(s), '/university/10003/campus/main');
});
test('Chinese filters and campus building selection round trip in one URL', () => {
  const state = normalizeLocation(
    {
      ...emptyLocation,
      query: '清华 大学',
      region: '华北',
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

test('legacy province URLs migrate to the containing region and canonical key', () => {
  for (const [province, region] of [
    ['四川', '西南'],
    ['内蒙古自治区', '华北'],
    ['广西壮族自治区', '华南'],
    ['新疆维吾尔自治区', '西北'],
  ]) {
    const state = read(
      `/?province=${encodeURIComponent(province)}&type=985&q=大学`,
    );
    assert.equal(state.region, region);
    const params = new URL(atlasHref(state), 'https://atlas.test').searchParams;
    assert.equal(params.get('region'), region);
    assert.equal(params.has('province'), false);
    assert.equal(params.get('type'), '985');
    assert.equal(params.get('q'), '大学');
  }
});

test('region state survives directory-campus-directory URL restoration', () => {
  const directory = read('/?region=西南&type=211-only&q=交通');
  const campus = normalizeLocation(
    { ...directory, schoolId: '10613' },
    schools,
  );
  assert.equal(read(atlasHref(campus)).region, '西南');
  const returned = normalizeLocation(
    { ...campus, schoolId: null, campusId: null },
    schools,
  );
  assert.equal(atlasHref(returned), atlasHref(directory));
  assert.equal(read('/?region=东北&province=四川').region, '东北');
  assert.equal(read('/?region=unknown').region, '全部地区');
});

test('legacy stored provinces migrate safely without overriding URL authority', () => {
  const old = {
    province: '四川',
    query: '交通',
    tag: '211-only',
    view: { target: [0, 0, 1] },
  };
  const migrated = migrateStoredRegion(old);
  assert.equal(migrated.region, '西南');
  assert.equal('province' in migrated, false);
  assert.deepEqual(migrated.view, old.view);
  assert.equal(read('/').region, '全部地区');
  assert.equal(read('/?region=东北').region, '东北');
  const { region: _region, ...legacyState } = emptyLocation;
  assert.equal(
    normalizeLocation({ ...legacyState, province: '四川' }, schools).region,
    '西南',
  );
  assert.equal(normalizeLocation(legacyState, schools).region, '全部地区');
  assert.equal(migrateStoredRegion({}).region, '全部地区');
  assert.equal(migrateStoredRegion({ region: 42 }).region, '全部地区');
});
