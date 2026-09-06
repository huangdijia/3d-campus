import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const schools = JSON.parse(
  await fs.readFile('app/data/universities.json', 'utf8'),
);
const assets = JSON.parse(
  await fs.readFile('public/data/asset-manifest.json', 'utf8'),
);
const failures = [];
const technical = [];
let modelCount = 0,
  poiCount = 0;
const sha = new Set();
function check(condition, message) {
  if (!condition) technical.push(message);
}
check(
  schools.length === 115,
  'Expected 115 independently enumerated university entities',
);
check(
  new Set(schools.map((u) => u.id)).size === schools.length,
  'Duplicate university IDs',
);
check(
  schools.filter((u) => u.is985).length === 39,
  'Expected 39 universities with historic 985 label',
);
for (const [tier, count] of [
  ['S', 20],
  ['A', 40],
  ['B', 55],
])
  check(
    schools.filter((u) => u.tier === tier).length === count,
    `Expected ${tier}=${count}`,
  );
for (const u of schools) {
  const gaps = [];
  const a = assets.find((a) => a.campusId === `${u.id}/main`);
  if (!u.position) gaps.push('校园位置缺失');
  if (!u.campusId || !a) {
    gaps.push('校园模型缺失');
    failures.push({ id: u.id, name: u.name, tier: u.tier, gaps });
    continue;
  }
  try {
    const bytes = await fs.readFile(`public${a.modelUrl}`);
    check(
      bytes.toString('utf8', 0, 4) === 'glTF',
      `${u.id}: invalid GLB header`,
    );
    check(
      bytes.readUInt32LE(8) === bytes.length,
      `${u.id}: GLB length mismatch`,
    );
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    check(digest === a.sha256, `${u.id}: manifest hash mismatch`);
    check(
      !sha.has(digest),
      `${u.id}: identical model duplicated across campuses`,
    );
    sha.add(digest);
    modelCount++;
    const c = JSON.parse(await fs.readFile(`public/data/${u.id}.json`, 'utf8'));
    check(
      c.universityId === u.id,
      `${u.id}: campus points to another university`,
    );
    check(c.crs === 'EPSG:4326', `${u.id}: unsupported coordinate reference`);
    check(
      new Set(c.pois.map((p) => p.id)).size === c.pois.length,
      `${u.id}: duplicate POIs`,
    );
    poiCount += c.pois.length;
    for (const p of c.pois) {
      check(
        p.position.every(Number.isFinite),
        `${u.id}: nonfinite POI coordinate`,
      );
      check(p.sourceUrl.startsWith('https://'), `${u.id}: POI source missing`);
    }
    for (const t of c.tours) {
      check(
        t.poiIds.every((id) => c.pois.some((p) => p.id === id)),
        `${u.id}: route references absent POI`,
      );
      check(
        t.path.length === t.poiIds.length,
        `${u.id}: tour path/id count mismatch`,
      );
    }
    const required = {
      S: { poi: 20, landmarks: 5 },
      A: { poi: 12, landmarks: 2 },
      B: { poi: 6, landmarks: 1 },
    }[u.tier];
    const verified = c.pois.filter((p) => p.verified).length;
    if (c.status !== 'verified') gaps.push('校园内容尚未完成核验');
    if (!a.boundaryVerified) gaps.push('校园边界未完成官网核对');
    if (!a.layoutVerified) gaps.push('建筑与道路布局未完成核对');
    if (verified < required.poi)
      gaps.push(`核验 POI ${verified}/${required.poi}`);
    if (a.detailedLandmarks < required.landmarks)
      gaps.push(`精细特色建筑 ${a.detailedLandmarks}/${required.landmarks}`);
    if (!c.tours.some((t) => t.verified)) gaps.push('核验导览路线缺失');
    if (!a.releaseReady) gaps.push('资产尚未通过分级验收');
  } catch (e) {
    technical.push(`${u.id}: ${e.message}`);
    gaps.push('资产文件读取失败');
  }
  if (gaps.length)
    failures.push({ id: u.id, name: u.name, tier: u.tier, gaps });
}
const terrain = JSON.parse(
  await fs.readFile('public/data/terrain.json', 'utf8'),
);
const nationalGaps = [];
if (terrain.available === false || !terrain.elevations?.length)
  nationalGaps.push('真实海拔数据未接入');
let national = {};
try {
  national = JSON.parse(await fs.readFile('data/national-review.json', 'utf8'));
} catch {}
if (!national.boundariesVerified)
  nationalGaps.push('国界、省界及岛屿未完成标准地图核验');
const report = {
  checkedAt: new Date().toISOString(),
  schools: schools.length,
  models: modelCount,
  sourceNamedPOIs: poiCount,
  acceptedCampuses: schools.length - failures.length,
  tiers: Object.fromEntries(
    'SAB'
      .split('')
      .map((t) => [
        t,
        {
          planned: schools.filter((u) => u.tier === t).length,
          accepted: schools.filter(
            (u) => u.tier === t && !failures.some((f) => f.id === u.id),
          ).length,
        },
      ]),
  ),
  technicalErrors: technical,
  nationalGaps,
  campuses: failures,
  releaseReady:
    technical.length === 0 &&
    nationalGaps.length === 0 &&
    failures.length === 0,
};
await fs.writeFile(
  'docs/release-readiness.json',
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      schools: report.schools,
      models: report.models,
      sourceNamedPOIs: report.sourceNamedPOIs,
      acceptedCampuses: report.acceptedCampuses,
      technicalErrors: technical,
      nationalGaps,
      releaseReady: report.releaseReady,
    },
    null,
    2,
  ),
);
if (process.argv.includes('--release'))
  assert.equal(
    report.releaseReady,
    true,
    'Public deployment blocked: the agreed whole-catalog quality gate has not passed. See docs/release-readiness.json.',
  );
else
  assert.equal(
    technical.length,
    0,
    'Technical asset integrity validation failed',
  );
