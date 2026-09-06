'use client';
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  lazy,
  Suspense,
  Component,
  type ReactNode,
} from 'react';
import {
  Search,
  ArrowLeft,
  ArrowRight,
  X,
  Compass,
  MapPin,
  GraduationCap,
  Play,
  Pause,
  Footprints,
  Globe2,
  ChevronRight,
  ExternalLink,
  Info,
  Mountain,
  PanelLeftClose,
  PanelLeftOpen,
  Building2,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '../../components/ui/dialog';
import universitiesJson from '../data/universities.json';
import type { University, Campus, POI } from '../data/types';
import { filterUniversities, type MapView } from './geo';
const MapScene = lazy(() => import('./map-scene'));
const CampusScene = lazy(() => import('./campus-scene'));
const universities = universitiesJson as University[];
const provinces = [...new Set(universities.map((u) => u.province))];
const previewCount = universities.filter((u) => u.campusId).length;
class SceneBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? (
      <div className="scene-error">
        3D 视图暂时无法显示，可继续使用高校列表。
      </div>
    ) : (
      this.props.children
    );
  }
}
function routeId() {
  if (typeof window === 'undefined') return null;
  const m = window.location.pathname.match(
    /^\/university\/([^/]+)\/campus\/main\/?$/,
  );
  return m ? decodeURIComponent(m[1]) : null;
}
export default function Atlas({ initialId }: { initialId?: string }) {
  const [query, setQuery] = useState(''),
    [province, setProvince] = useState('全部地区'),
    [tag, setTag] = useState('全部'),
    [selectedId, setSelectedId] = useState<string | null>(initialId || null),
    [campusId, setCampusId] = useState<string | null>(initialId || null),
    [campus, setCampus] = useState<Campus | null>(null),
    [poi, setPoi] = useState<POI | null>(null),
    [touring, setTouring] = useState(false),
    [tourIndex, setTourIndex] = useState(0),
    [mode, setMode] = useState<'overview' | 'tour' | 'walk'>('overview'),
    [poiQuery, setPoiQuery] = useState(''),
    [reset, setReset] = useState(0),
    [about, setAbout] = useState(false),
    [listOpen, setListOpen] = useState(true),
    [sceneError, setSceneError] = useState(false),
    [campusError, setCampusError] = useState(false),
    [modelReady, setModelReady] = useState(false),
    [mounted, setMounted] = useState(false),
    [hasWebgl, setHasWebgl] = useState(true);
  const walk = mode === 'walk';
  const mapView = useRef<MapView | null>(null),
    searchRef = useRef<HTMLInputElement>(null),
    restored = useRef(false);
  const selected = universities.find((u) => u.id === selectedId) || null;
  const filtered = filterUniversities(universities, query, province, tag);
  const onSceneError = useCallback(() => setSceneError(true), []),
    onCampusError = useCallback(() => setCampusError(true), []),
    onReady = useCallback(() => setModelReady(true), []);
  useEffect(() => {
    // Browser capability and session state become available only after hydration.
    // oxlint-disable-next-line react/react-compiler
    setMounted(true);
    const canvas = document.createElement('canvas');
    setHasWebgl(Boolean(canvas.getContext('webgl2')));
    try {
      const state = JSON.parse(
        sessionStorage.getItem('campus-atlas-state') || 'null',
      );
      if (state) {
        setQuery(state.query || '');
        setProvince(
          provinces.includes(state.province) ? state.province : '全部地区',
        );
        setTag(
          ['全部', '985', '211-only'].includes(state.tag) ? state.tag : '全部',
        );
        mapView.current = state.view || null;
      }
    } catch {}
    restored.current = true;
    const id = routeId();
    if (id) {
      setCampusId(id);
      setSelectedId(id);
    }
    const pop = () => {
      const id = routeId();
      setCampusId(id);
      if (id) setSelectedId(id);
      setTouring(false);
      setMode('overview');
    };
    window.addEventListener('popstate', pop);
    const shortcuts = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') setAbout(false);
    };
    window.addEventListener('keydown', shortcuts);
    return () => {
      window.removeEventListener('popstate', pop);
      window.removeEventListener('keydown', shortcuts);
    };
  }, []);
  useEffect(() => {
    if (!restored.current) return;
    try {
      sessionStorage.setItem(
        'campus-atlas-state',
        JSON.stringify({ query, province, tag, view: mapView.current }),
      );
    } catch {}
  }, [query, province, tag, campusId]);
  useEffect(() => {
    if (!campusId) {
      // Route changes invalidate the externally loaded campus resource.
      // oxlint-disable-next-line react/react-compiler
      setCampus(null);
      setPoi(null);
      return;
    }
    const controller = new AbortController();
    setCampus(null);
    setCampusError(false);
    setModelReady(false);
    fetch(`/data/${encodeURIComponent(campusId)}.json`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw Error('not-found');
        return r.json() as Promise<Campus>;
      })
      .then((c) => {
        setCampus(c);
        setPoi(null);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setCampusError(true);
      });
    return () => controller.abort();
  }, [campusId]);
  function select(u: University) {
    setSelectedId(u.id);
    setListOpen(true);
  }
  function enter(u: University) {
    if (!u.campusId) return;
    setCampusId(u.id);
    setSelectedId(u.id);
    setTouring(false);
    setMode('overview');
    setReset(0);
    window.history.pushState(
      {},
      '',
      `/university/${u.id}/campus/${u.campusId}`,
    );
    setListOpen(true);
    setPoiQuery('');
  }
  function back() {
    setCampusId(null);
    setTouring(false);
    setMode('overview');
    setPoi(null);
    setSceneError(false);
    setListOpen(true);
    window.history.pushState({}, '', '/');
  }
  function resetFilters() {
    setQuery('');
    setProvince('全部地区');
    setTag('全部');
  }
  const activePOI =
    poi ||
    (mode === 'tour' && campus
      ? campus.pois.find((p) => p.id === campus.tours[0]?.poiIds[tourIndex])
      : null);
  return (
    <main
      className={`atlas ${campusId ? 'campus-mode' : ''} ${listOpen ? 'list-open' : 'list-closed'}`}
    >
      <header className="topbar">
        <button
          className="brand"
          onClick={() => {
            if (campusId) back();
            else {
              resetFilters();
              setSelectedId(null);
              setListOpen(true);
              setReset((n) => n + 1);
            }
          }}
          aria-label="山河学府，返回全国地图"
        >
          <span className="brand-icon">
            <Mountain size={23} />
          </span>
          <strong>山河学府</strong>
        </button>
        <nav className="location-nav" aria-label="当前位置">
          <button
            className={!campusId ? 'current' : ''}
            onClick={() => {
              if (campusId) back();
              else {
                setSelectedId(null);
                setListOpen(true);
              }
            }}
          >
            <Globe2 size={15} />
            全国高校
          </button>
          {campusId && (
            <>
              <ChevronRight size={14} />
              <span aria-current="page">{selected?.name || '校园'}</span>
            </>
          )}
        </nav>
        <div className="header-end">
          <span className="preview-badge">开发预览</span>
          <button
            className="icon-button"
            onClick={() => setAbout(true)}
            aria-label="查看数据来源与建设进度"
          >
            <Info size={19} />
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside
          className={`explore-panel ${selected && !campusId ? 'detail-panel' : ''} ${campusId ? 'campus-panel' : ''}`}
          aria-label={
            campusId ? '校园浏览' : selected ? '学校详情' : '高校搜索'
          }
        >
          {!campusId ? (
            selected ? (
              <>
                <div className="panel-back">
                  <button onClick={() => setSelectedId(null)}>
                    <ArrowLeft size={16} />
                    高校列表
                  </button>
                  <span>
                    {universities.findIndex((u) => u.id === selected.id) + 1} /{' '}
                    {universities.length}
                  </span>
                </div>
                <article className="school-detail">
                  <div className="detail-emblem">
                    <GraduationCap size={30} />
                  </div>
                  <p className="detail-location">
                    {selected.province} · {selected.city}
                  </p>
                  <h1>{selected.name}</h1>
                  <div className="school-tags">
                    {selected.is985 && <span>985</span>}
                    <span>211</span>
                  </div>
                  <p className="detail-note">
                    {selected.summary ||
                      '选择代表校区，了解这所学校的校园空间。'}
                  </p>
                  <div className="campus-choice">
                    <span className="section-label">本次探索校区</span>
                    <h2>
                      <MapPin size={16} />
                      {selected.campusName || '代表校区待确认'}
                    </h2>
                    <p>
                      {selected.campusId
                        ? '已提供建筑与道路的几何预览，布局及地标外观仍在核验。'
                        : '校园公开建筑资料不足，暂不能进入预览。'}
                    </p>
                  </div>
                  {selected.website && (
                    <a
                      className="official-link"
                      href={selected.website}
                      target="_blank"
                      rel="noreferrer"
                    >
                      访问学校官网
                      <ExternalLink size={13} />
                    </a>
                  )}
                </article>
                <div className="panel-action">
                  <Button
                    className="enter-button"
                    disabled={!selected.campusId}
                    onClick={() => enter(selected)}
                  >
                    {selected.campusId ? '进入校园' : '校园资料整理中'}
                    <ArrowRight size={17} />
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="panel-heading">
                  <h1>探索高校</h1>
                  <p>从一所学校，开启校园之旅。</p>
                </div>
                <div className="search-box">
                  <Search size={18} />
                  <input
                    aria-label="搜索高校或城市"
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索高校或城市"
                  />
                  {query ? (
                    <button onClick={() => setQuery('')} aria-label="清除搜索">
                      <X size={15} />
                    </button>
                  ) : (
                    <kbd>/</kbd>
                  )}
                </div>
                <div className="filters">
                  <div className="filter-tabs" aria-label="高校类别">
                    {['全部', '985', '211-only'].map((t) => (
                      <button
                        key={t}
                        aria-label={
                          t === '985'
                            ? '985 高校'
                            : t === '211-only'
                              ? '211 非985高校'
                              : '全部高校'
                        }
                        aria-pressed={tag === t}
                        className={tag === t ? 'selected' : ''}
                        onClick={() => setTag(t)}
                      >
                        {t === '985'
                          ? '985'
                          : t === '211-only'
                            ? '211（非985）'
                            : '全部'}
                      </button>
                    ))}
                  </div>
                  <div className="region-filter">
                    <MapPin size={14} />
                    <select
                      aria-label="选择地区"
                      value={province}
                      onChange={(e) => setProvince(e.target.value)}
                    >
                      <option>全部地区</option>
                      {provinces.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                    {(query || province !== '全部地区' || tag !== '全部') && (
                      <button onClick={resetFilters}>重置</button>
                    )}
                  </div>
                </div>
                <div className="result-heading">
                  <span>高校列表</span>
                  <span>{filtered.length} 所</span>
                </div>
                <ul className="school-list">
                  {filtered.map((u) => (
                    <li key={u.id}>
                      <button
                        className="school-row"
                        onClick={() => select(u)}
                        aria-label={`查看${u.name}`}
                      >
                        <span className="school-monogram">
                          <GraduationCap size={20} />
                        </span>
                        <span className="school-row-main">
                          <strong>{u.name}</strong>
                          <small>
                            {u.city}
                            <span>{u.is985 ? '985 · 211' : '211'}</span>
                          </small>
                        </span>
                        <ChevronRight size={15} />
                      </button>
                    </li>
                  ))}
                  {!filtered.length && (
                    <li className="empty-state">
                      <Search size={28} />
                      <h3>没有找到匹配的高校</h3>
                      <p>试试学校全称，或清除地区筛选。</p>
                      <button onClick={resetFilters}>清除筛选</button>
                    </li>
                  )}
                </ul>
                <div className="panel-bottom">
                  {universities.length} 所高校 · {previewCount} 所可预览校园
                </div>
              </>
            )
          ) : (
            <>
              <div className="panel-back">
                <button onClick={back}>
                  <ArrowLeft size={16} />
                  全国高校
                </button>
                <span>校园预览</span>
              </div>
              <div className="campus-heading">
                <h1>{selected?.name || '校园'}</h1>
                <p>
                  <MapPin size={13} />
                  {campus?.name || selected?.campusName}
                </p>
              </div>
              {campus ? (
                <>
                  <fieldset className="campus-modes" aria-label="游览方式">
                    <button
                      aria-pressed={mode === 'overview'}
                      className={mode === 'overview' ? 'active' : ''}
                      onClick={() => {
                        setMode('overview');
                        setTouring(false);
                      }}
                    >
                      <Compass size={17} />
                      鸟瞰
                    </button>
                    <button
                      aria-pressed={mode === 'tour'}
                      disabled={!modelReady || !campus.tours.length}
                      className={mode === 'tour' ? 'active' : ''}
                      onClick={() => {
                        setMode('tour');
                        setTouring(true);
                        setPoi(null);
                        setTourIndex(0);
                      }}
                    >
                      <Play size={16} />
                      导览
                    </button>
                    {selected?.tier === 'S' && (
                      <button
                        aria-pressed={walk}
                        className={walk ? 'active' : ''}
                        disabled={!modelReady}
                        onClick={() => {
                          setMode('walk');
                          if (window.innerWidth <= 760) setListOpen(false);
                          setTouring(false);
                          setPoi(null);
                        }}
                      >
                        <Footprints size={17} />
                        漫游
                      </button>
                    )}
                  </fieldset>
                  <p className="mode-description">
                    {walk
                      ? '在校园里行走，感受建筑之间的距离。'
                      : mode === 'tour'
                        ? '跟随镜头，依次浏览已标注的建筑。'
                        : '选择建筑，或拖动地图自由观察校园。'}
                  </p>
                  {mode === 'tour' && (
                    <div className="tour-progress">
                      <span>
                        导览{' '}
                        {Math.min(
                          tourIndex + 1,
                          campus.tours[0]?.poiIds.length || 0,
                        )}{' '}
                        / {campus.tours[0]?.poiIds.length || 0}
                      </span>
                      <button onClick={() => setTouring((v) => !v)}>
                        {touring ? <Pause size={14} /> : <Play size={14} />}{' '}
                        {touring ? '暂停导览' : '继续导览'}
                      </button>
                    </div>
                  )}
                  {activePOI && !walk ? (
                    <article className="poi-detail">
                      <button
                        className="text-back"
                        onClick={() => {
                          setPoi(null);
                          setMode('overview');
                          setTouring(false);
                        }}
                      >
                        <ArrowLeft size={15} />
                        全部建筑
                      </button>
                      <span className="section-label">建筑信息</span>
                      <h2>{activePOI.name}</h2>
                      <p>{activePOI.description}</p>
                      <a
                        href={activePOI.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        查看地理资料
                        <ExternalLink size={12} />
                      </a>
                    </article>
                  ) : !walk ? (
                    <>
                      <div className="poi-heading">
                        <h2>校园建筑</h2>
                        <span>{campus.pois.length}</span>
                      </div>
                      <div className="search-box poi-search">
                        <Search size={16} />
                        <input
                          aria-label="搜索校园建筑"
                          placeholder="搜索建筑名称"
                          value={poiQuery}
                          onChange={(e) => setPoiQuery(e.target.value)}
                        />
                      </div>
                      <div className="poi-list">
                        {campus.pois
                          .filter((p) => p.name.includes(poiQuery.trim()))
                          .map((p) => (
                            <button
                              key={p.id}
                              onClick={() => {
                                setPoi(p);
                                setTouring(false);
                                setMode('overview');
                              }}
                            >
                              <Building2 size={16} />
                              <strong>{p.name}</strong>
                              <ChevronRight size={14} />
                            </button>
                          ))}
                        {!campus.pois.some((p) =>
                          p.name.includes(poiQuery.trim()),
                        ) && <p className="empty-state">没有匹配的建筑</p>}
                      </div>
                    </>
                  ) : (
                    <div className="walk-instructions">
                      <Footprints size={25} />
                      <h2>开始校园漫游</h2>
                      <p className="desktop-walk-hint">
                        点击地图进入视角控制
                        <br />W A S D 行走 · Esc 释放鼠标
                      </p>
                      <p className="mobile-walk-hint">
                        拖动场景转头
                        <br />
                        使用屏幕方向键行走
                      </p>
                      <button
                        onClick={() => {
                          setMode('overview');
                          setReset((n) => n + 1);
                        }}
                      >
                        退出漫游
                      </button>
                    </div>
                  )}
                  <div className="panel-bottom">
                    几何预览 · 部分高度为估算值
                  </div>
                </>
              ) : (
                <div className="panel-loading">
                  {campusError ? '校园资料未能加载' : '正在读取校园资料…'}
                </div>
              )}
            </>
          )}
        </aside>
        <section
          className="map-area"
          aria-label={campusId ? '3D 校园' : '3D 中国高校地图'}
        >
          <div className="scene-container">
            {mounted && hasWebgl ? (
              <SceneBoundary key={campusId || 'map'} onError={onSceneError}>
                <Suspense
                  fallback={
                    <div className="scene-loading">
                      <span className="spinner" />
                      正在展开地图
                    </div>
                  }
                >
                  {campusId ? (
                    campus && !campusError ? (
                      <CampusScene
                        campus={campus}
                        selected={poi}
                        onSelect={(p) => {
                          setPoi(p);
                          setTouring(false);
                          setMode('overview');
                          setListOpen(true);
                        }}
                        touring={touring}
                        onTourIndex={setTourIndex}
                        walk={walk}
                        reset={reset}
                        onError={onCampusError}
                        onReady={onReady}
                      />
                    ) : (
                      <div className="scene-loading">
                        {campusError
                          ? '该校园资料尚未就绪，请返回高校列表。'
                          : '正在读取校园资料…'}
                      </div>
                    )
                  ) : (
                    <MapScene
                      universities={filtered}
                      selected={selected}
                      onSelect={select}
                      viewRef={mapView}
                      reset={reset}
                      onError={onSceneError}
                    />
                  )}
                </Suspense>
              </SceneBoundary>
            ) : (
              mounted && (
                <div className="scene-error">
                  <Globe2 size={38} />
                  <h2>当前设备无法显示 3D</h2>
                  <p>你仍可以搜索高校、查看学校信息和官网。</p>
                </div>
              )
            )}
          </div>
          <div className="map-context">
            <span>
              {campusId
                ? walk
                  ? '校园漫游'
                  : mode === 'tour'
                    ? '建筑导览'
                    : '校园鸟瞰'
                : selected
                  ? `${selected.province} · ${selected.city}`
                  : '中国 · 高校分布'}
            </span>
            {!campusId && !selected && <small>缩放地图，发现学校</small>}
          </div>
          <div className="map-tools">
            <button
              className="tool-button"
              onClick={() => {
                setReset((n) => n + 1);
                if (campusId) {
                  setTouring(false);
                  if (!walk) {
                    setMode('overview');
                    setPoi(null);
                  }
                }
              }}
              aria-label={walk ? '回到安全位置' : '重置视角'}
              title={walk ? '回到安全位置' : '重置视角'}
            >
              <Compass size={21} />
            </button>
          </div>
          <button
            className="mobile-panel-toggle"
            onClick={() => setListOpen((v) => !v)}
            aria-expanded={listOpen}
          >
            {listOpen ? (
              <PanelLeftClose size={16} />
            ) : (
              <PanelLeftOpen size={16} />
            )}{' '}
            {listOpen
              ? '收起面板'
              : campusId
                ? '校园信息'
                : selected
                  ? '学校详情'
                  : '查找高校'}
          </button>
          {walk && (
            <div className="crosshair" aria-hidden="true">
              +
            </div>
          )}
          <div className="map-footer">
            <span>
              {campusId
                ? '© OpenStreetMap contributors · ODbL'
                : 'Natural Earth · GMT / SRTM15+ · 边界待核验'}
            </span>
            <span>
              {campusId
                ? '拖动平移 · 滚轮缩放 · 右键旋转'
                : '拖动平移 · 滚轮缩放 · 右键旋转'}
            </span>
          </div>
          {(sceneError || campusError) && (
            <div className="error-banner" role="alert">
              {campusError
                ? '校园资料加载失败。可返回列表后重试。'
                : '地图资源未能完整加载。可继续使用高校列表。'}
            </div>
          )}
        </section>
      </div>
      <Dialog open={about} onOpenChange={setAbout}>
        <DialogContent className="data-dialog" showCloseButton={false}>
          <button
            className="icon-button dialog-close"
            aria-label="关闭数据说明"
            onClick={() => setAbout(false)}
          >
            <X size={20} />
          </button>
          <p className="eyebrow">ABOUT THE ATLAS</p>
          <DialogTitle>每一所学府，都有据可循。</DialogTitle>
          <DialogDescription>
            当前为开发预览，尚未通过首期全量发布验收。
          </DialogDescription>
          <div className="coverage-stats">
            <div>
              <strong>115</strong>
              <span>独立学校条目</span>
            </div>
            <div>
              <strong>39</strong>
              <span>985 高校</span>
            </div>
            <div>
              <strong>{previewCount}</strong>
              <span>校园几何预览</span>
            </div>
            <div>
              <strong>0</strong>
              <span>通过完整验收</span>
            </div>
          </div>
          <h3>学校与校区分别统计</h3>
          <p>
            教育部历史名单的 112
            所口径，将中国矿业大学、中国石油大学、中国地质大学的异地办学实体拆分后，本项目为
            115 个条目。985 标签与 211
            标签重叠。现名与学校代码仍需最新官方名录复核。
          </p>
          <h3>真实资料，不补造布局</h3>
          <p>
            校园体块来自 OpenStreetMap
            的边界和建筑轮廓。未标注的建筑高度使用估算值；校园主校区选择、学科信息和特色建筑精细模型仍需逐校核验。鸟瞰导览不是经过核验的步行路线。
          </p>
          <h3>真实地形</h3>
          <p>
            全国海拔来自 GMT 分发的 SRTM15+ 衍生高程数据，采用 0.25°
            网格。地形表现用于全国浏览，不代表校园测绘精度；全国边界仍待标准地图核验。
          </p>
          <h3>公开数据来源</h3>
          <div className="source-links">
            <a
              href="https://www.generic-mapping-tools.org/remote-datasets/earth-relief.html"
              target="_blank"
              rel="noreferrer"
            >
              GMT · 全球高程数据
              <ExternalLink size={14} />
            </a>
            <a
              href="https://www.moe.gov.cn/srcsite/A22/s7065/200512/t20051223_82762.html"
              target="_blank"
              rel="noreferrer"
            >
              教育部 · 211 工程名单
              <ExternalLink size={14} />
            </a>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              OpenStreetMap · ODbL 数据
              <ExternalLink size={14} />
            </a>
            <a
              href="https://www.naturalearthdata.com/about/terms-of-use/"
              target="_blank"
              rel="noreferrer"
            >
              Natural Earth · 公开地理底稿
              <ExternalLink size={14} />
            </a>
          </div>
          <p className="dialog-footnote">
            规划标准：S 级 20 所 · A 级 40 所 · B 级 55
            所。几何预览数量不代表真实还原验收通过数量。
          </p>
        </DialogContent>
      </Dialog>
    </main>
  );
}
