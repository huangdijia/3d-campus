import { normalizeRegion, type RegionSelection } from './regions';

export type ExploreMode = 'overview' | 'tour' | 'walk';
export type AtlasLocation = {
  query: string;
  region: RegionSelection;
  tag: string;
  schoolId: string | null;
  campusId: string | null;
  poiId: string | null;
  buildingQuery: string;
  mode: ExploreMode;
};
export const emptyLocation: AtlasLocation = {
  query: '',
  region: '全部地区',
  tag: '全部',
  schoolId: null,
  campusId: null,
  poiId: null,
  buildingQuery: '',
  mode: 'overview',
};
type School = {
  id: string;
  province: string;
  campusId: string | null;
  tier: string;
};

export function migrateStoredRegion(state: Record<string, unknown>) {
  const { province, ...rest } = state;
  return { ...rest, region: normalizeRegion(state.region ?? province) };
}

export function normalizeLocation(
  state:
    | AtlasLocation
    | (Omit<AtlasLocation, 'region'> & { region?: string; province?: string }),
  schools: readonly School[],
): AtlasLocation {
  const school = schools.find((u) => u.id === state.schoolId);
  // A school with an available campus has one integrated destination.
  const campusId = school?.campusId ? school.id : null;
  const mode: ExploreMode = !campusId
    ? 'overview'
    : state.mode === 'tour'
      ? 'tour'
      : state.mode === 'walk' && school?.tier === 'S'
        ? 'walk'
        : 'overview';
  return {
    query: state.query.slice(0, 200),
    region: normalizeRegion(
      state.region ?? ('province' in state ? state.province : undefined),
    ),
    tag: ['985', '211-only'].includes(state.tag) ? state.tag : '全部',
    schoolId: school?.id || null,
    campusId,
    poiId:
      campusId && mode === 'overview' && /^\d{1,20}$/.test(state.poiId || '')
        ? state.poiId
        : null,
    mode,
    buildingQuery: campusId ? state.buildingQuery.slice(0, 200) : '',
  };
}
export function readAtlasLocation(
  pathname: string,
  search: string,
  schools: readonly School[],
): AtlasLocation {
  const match = pathname.match(/^\/university\/(\d+)(\/campus\/main)?\/?$/);
  const params = new URLSearchParams(search);
  return normalizeLocation(
    {
      query: params.get('q') || '',
      region: normalizeRegion(
        params.get('region') || params.get('province') || '全部地区',
      ),
      tag: params.get('type') || '全部',
      schoolId: match?.[1] || null,
      campusId: match?.[2] ? match[1] : null,
      poiId: params.get('poi'),
      buildingQuery: params.get('bq') || '',
      mode:
        params.get('mode') === 'tour'
          ? 'tour'
          : params.get('mode') === 'walk'
            ? 'walk'
            : 'overview',
    },
    schools,
  );
}
export function atlasHref(state: AtlasLocation): string {
  const path = state.campusId
    ? `/university/${state.campusId}/campus/main`
    : state.schoolId
      ? `/university/${state.schoolId}`
      : '/';
  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  if (state.region !== '全部地区') params.set('region', state.region);
  if (state.tag !== '全部') params.set('type', state.tag);
  if (state.campusId && state.buildingQuery)
    params.set('bq', state.buildingQuery);
  if (state.campusId && state.poiId) params.set('poi', state.poiId);
  if (state.campusId && state.mode !== 'overview')
    params.set('mode', state.mode);
  return path + (params.size ? `?${params}` : '');
}
