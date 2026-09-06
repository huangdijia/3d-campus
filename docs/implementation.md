# 山河学府实现与交付边界

## 当前架构

Sites 官方 Vinext / React / TypeScript 脚手架，UI 使用浅色玻璃面板与 shadcn 控件。全国地图用 React Three Fiber；校园按 URL 懒加载 GLB。所有页面目前为开发预览，不能以当前模型数量代表正式验收。

- `/`：高校名录、检索、地区与 985 / 211（非985）筛选、地理聚合、相机定位。
- `/university/:universityId/campus/main`：学校介绍与官网、建筑选择、鸟瞰导览与 S 级漫游开发预览；旧学校详情地址自动归一到此页面。
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

Sites 项目 ID 保存在 `.openai/hosting.json`。2026-09-06 用户明确要求发布当前最新开发预览，复用站点既有访问范围。该发布不代表全部首期校园通过验收；来源及精度核验标记继续保留，严格验收报告仍单独记录缺口。

## 信息架构

全国高校列表点击即进入校园；校园页返回按钮直接回到列表，保留筛选和地图视角。学校介绍、真实校徽和官网整合到校园侧栏，资料不足的学校保留信息页。旧学校详情 URL 自动转为统一校园地址；筛选、建筑和游览模式同步 URL，可刷新和分享。页面无顶部导航栏。手机默认全屏地图，仅保留底部信息条，点击或上滑展开面板，选择学校、建筑或游览模式后收起。鸟瞰、自动导览与漫游为互斥模式，自动导览另设暂停/继续。

## 渲染与加载

全国几何离线生成 GLB，省份标记柱实例化，静止时按需绘制。校园模型删除重复顶面避免闪烁，并使用对数深度缓冲；静态鸟瞰暂停渲染。Rapier 物理运行时与碰撞几何只在第一次进入漫游时加载和构建。校徽使用独立原始 PNG，固定尺寸、按需解码。实测与限制见 [界面回归记录](interface-qa.md)。
