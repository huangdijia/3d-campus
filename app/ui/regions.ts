export const REGION_NAMES = [
  '华北',
  '东北',
  '华东',
  '华中',
  '华南',
  '西南',
  '西北',
] as const;

export type RegionName = (typeof REGION_NAMES)[number];
export type RegionSelection = '全部地区' | RegionName;

const provincesByRegion: Record<RegionName, readonly string[]> = {
  华北: ['北京', '天津', '河北', '山西', '内蒙古'],
  东北: ['辽宁', '吉林', '黑龙江'],
  华东: ['上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '台湾'],
  华中: ['河南', '湖北', '湖南'],
  华南: ['广东', '广西', '海南', '香港', '澳门'],
  西南: ['重庆', '四川', '贵州', '云南', '西藏'],
  西北: ['陕西', '甘肃', '青海', '宁夏', '新疆'],
};

export function provinceRegion(province: unknown): RegionName | null {
  if (typeof province !== 'string') return null;
  const shortName = province.replace(
    /(?:壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市)$/,
    '',
  );
  return (
    REGION_NAMES.find((region) =>
      provincesByRegion[region].includes(shortName),
    ) || null
  );
}

export function normalizeRegion(value: unknown): RegionSelection {
  return (
    REGION_NAMES.find((region) => region === value) ||
    provinceRegion(value) ||
    '全部地区'
  );
}

export function countRegions(
  items: readonly { province: string }[],
): Record<RegionSelection, number> {
  const counts: Record<RegionSelection, number> = {
    全部地区: items.length,
    华北: 0,
    东北: 0,
    华东: 0,
    华中: 0,
    华南: 0,
    西南: 0,
    西北: 0,
  };
  for (const item of items) {
    const region = provinceRegion(item.province);
    if (region) counts[region]++;
  }
  return counts;
}
