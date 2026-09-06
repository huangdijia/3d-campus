# 山河学府 · 3D 中国高校地图

全国高校地图与可进入的校园三维探索应用。界面采用浅色玻璃风格，支持高校搜索、地区与 985 / 211（非985）筛选、地图平移缩放、校园建筑浏览、镜头导览与第一人称漫游开发预览。

**当前为初版开发预览。** 模型可加载与校园已通过真实还原验收分别统计，完整验收结果见 [发布验收报告](docs/release-readiness.json)。

## 本地运行

```sh
npm install
npm run dev
```

打开启动命令打印的本地地址。点击高校直接进入校园，学校介绍与官网位于校园侧栏；返回直接回到高校列表。手机默认显示全屏地图，通过底部信息条展开搜索与校园信息。全国地图左键拖动平移，滚轮缩放，右键拖动旋转；触屏单指平移、双指缩放。学校列表支持键盘操作与 `/` 搜索快捷键。

## 验证

```sh
npm run build
node --experimental-strip-types --test tests/*.test.mjs app/ui/campus-geometry.test.mjs
node scripts/validate-release.mjs
```

`node scripts/validate-release.mjs --release` 检查全量质量门槛；未通过不得将开发版本发布为首期完成版本。

## 内容与数据

- 115 个独立学校条目，对应教育部历史 211 名录并拆分矿业、石油、地质大学的异地独立办学实体；其中 39 个学校同时具有 985 标签。
- 首期规划 S 级 20 所、A 级 40 所、B 级 55 所，各选择一个代表校区。
- 校园几何来自 OpenStreetMap 公开数据；建筑高度缺失时使用估算值并标记。特色建筑精细模型、官方资料核验和完整路线是独立验收条件。
- 国家与省级底稿使用 Natural Earth。海拔使用 GMT 分发的 SRTM15+ 衍生栅格（0.25°，37,845点），边界核验状态另行记录。

更多实现、来源与交付边界见 [实现说明](docs/implementation.md)、[高校覆盖](docs/data-coverage.md)、[全国地理说明](docs/national-geography.md)、[界面回归记录](docs/interface-qa.md)。

## 数据署名

校园地理数据：© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)，[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)。原始响应、来源 URL 和转换流程随工程保留。海拔来源：[GMT 全球高程数据](https://www.generic-mapping-tools.org/remote-datasets/earth-relief.html)，原始数据与转换证据见全国地理说明。全国地理底稿：[Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/)，公共领域。高校名录：[教育部 211 工程学校名单](https://www.moe.gov.cn/srcsite/A22/s7065/200512/t20051223_82762.html)。
