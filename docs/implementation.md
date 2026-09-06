# 山河学府实现与交付边界

## 当前架构

Sites 官方 Vinext / React / TypeScript 脚手架，UI 使用浅色玻璃面板与 shadcn 控件。全国地图用 React Three Fiber；校园按 URL 懒加载 GLB。所有页面目前为开发预览，不能以当前模型数量代表正式验收。

- `/`：高校名录、检索、地区与 985 / 211（非985）筛选、地理聚合、相机定位。
- `/university/:universityId/campus/main`：建筑选择、鸟瞰导览与 S 级漫游开发预览。
- 学校、校区、POI、路线、资产来源在 `app/data/types.ts` 分开定义。
- 校园 JSON、碰撞轮廓与 GLB 在 `public/data` / `public/models`，按需请求；完整 ODbL 衍生数据保留于数据目录。

## 地图操作

全国地图与校园鸟瞰均为左键平移、滚轮缩放、右键旋转/倾斜；触摸单指平移，双指缩放/旋转。第一人称使用行走控制。页面返回保留筛选与全国地图视角。

## 数据生产

1. `scripts/prepare-data.py`：历史教育部 211 名录与独立实体、S/A/B 分类、校园候选匹配。
2. `scripts/fetch-campuses.py`：从公开 OSM API 取得校园边界及内部地物，缓存原始响应，支持增量执行。
3. `scripts/build-campuses.mjs`：按校园边界裁剪地物，生成体块 GLB 与 POI 数据；保留源建筑 ID，按材质合并绘制批次；部分高度为估算值。
4. `scripts/validate-release.mjs`：独立验证模型、校区引用、POI/路线和全量验收门槛，生成 `docs/release-readiness.json`。

## 校验命令

```sh
npm run dev
npm run build
node --experimental-strip-types --test tests/geography.test.mjs
node scripts/validate-release.mjs
node scripts/validate-release.mjs --release
```

最后一个命令只在全部学校、全部分级资产及全国地理审查完成后通过。完整质量门槛不因技术构建通过而放宽。

## 明确未完成的发布条件

当前全国底稿使用 Natural Earth 数据。真实海拔已接入 GMT 分发的 SRTM15+ V2.7 衍生数据，0.25° 网格共 37,845 点，已逐项与原始文件比对。国界、省界、岛屿尚需标准地图核验。

校园体块不是精细建筑模型；OSM 名称也不是已经由学校官网核验的 POI。固定鸟瞰镜头路线与可供行人的核验路线分别验收。具体学校与素材缺口由 `docs/data-coverage.md` 和 `docs/release-readiness.json` 记录。

Sites 已注册，项目 ID 在 `.openai/hosting.json`，保持未发布。用户已授权最终公开发布，但同时明确要求先通过全部首期验收；因此不能将此开发预览公开发布为完成版本。

## 信息架构

全国页以单侧栏逐层进入「高校列表 → 学校详情 → 代表校区」；校园页复用同一侧栏展示「校园概览 → 建筑详情」。顶部只显示当前位置，不提供跳到任意学校的全局校园入口。鸟瞰、自动导览与漫游为互斥模式，自动导览另设暂停/继续。手机侧栏可收起，进入漫游自动收起。
