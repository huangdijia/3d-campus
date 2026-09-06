import { normalizeRegion, provinceRegion } from './regions';

export type Terrain = {
  west: number;
  south: number;
  step: number;
  width: number;
  height: number;
  elevations: number[];
};
export type MapView = {
  position: [number, number, number];
  target: [number, number, number];
};
export const project = (lng: number, lat: number): [number, number] => [
  (lng - 105) * 1.5,
  (35 - lat) * 1.8,
];
export function elevation(t: Terrain | null, lng: number, lat: number) {
  if (!t) return 0.4;
  const x = Math.round((lng - t.west) / t.step),
    y = Math.round((lat - t.south) / t.step);
  return x < 0 || y < 0 || x >= t.width || y >= t.height
    ? 0.4
    : 0.4 + (t.elevations[y * t.width + x] || 0) / 1800;
}
export function inside(p: number[], ring: number[][]) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      c = !c;
  }
  return c;
}
export function filterUniversities<
  T extends {
    name: string;
    province: string;
    city: string;
    subjects: string[];
    is985: boolean;
    campusId: string | null;
  },
>(items: T[], query: string, region: string, tag: string) {
  const q = query.trim().toLowerCase();
  const selectedRegion = normalizeRegion(region);
  return items.filter(
    (u) =>
      (!q ||
        [u.name, u.province, u.city, ...u.subjects].some((s) =>
          s.toLowerCase().includes(q),
        )) &&
      (selectedRegion === '全部地区' ||
        provinceRegion(u.province) === selectedRegion) &&
      (tag !== '985' || u.is985) &&
      (tag !== '211-only' || !u.is985) &&
      (tag !== '可预览' || u.campusId),
  );
}
