# 全国地图标签避让 QA

验证日期：2026-09-06。浏览器为独立 Playwright Chrome headless，会话访问本地开发服务 `http://localhost:3000`。源码最终构建、生产验证和校园往返由站点负责人统一执行。

## 实现范围

- `app/ui/map-label-layout.ts`：按屏幕像素计算标签矩形，选中项优先，确定性搜索空位，保留每个未放置项的标识。
- `app/ui/map-scene.tsx`：真实世界坐标投影、测量 DOM 标签尺寸、避让与引线；极端拥挤时提供“更多高校”可点击列表，沿用大区/省份/城市聚合与学校选择。
- `app/ui/map-labels.css`：固定可读字号、触控标签及溢出列表，手机避开底部搜索入口。
- `tests/map-label-layout.test.mjs`：5 校同点、边缘位置、桌面/手机尺寸、稳定排序、选中优先及 50 校极端拥挤时身份完整性。
- 飞行完成回调在相机和 target 均抵达后执行一次；拖动、重置、改选区域会取消学校飞行，换学校或清空选择废弃旧目标。

## 已执行检查

`npx oxlint app/ui/map-scene.tsx app/ui/map-label-layout.ts tests/map-label-layout.test.mjs` 通过。

`node --test tests/map-label-layout.test.mjs` 通过，2 项测试。

浏览器通过 `getBoundingClientRect()` 检查所有显示中的地图标签，两两矩形交集为 0；每个城市同时断言目标学校完整可见。每组覆盖进入目标区域、滚轮放大、地图拖动及窗口缩小四个状态。

| 场景 | 初始窗口 | 调整后窗口 | 必须显示的目标校数 | 四状态重叠数 |
| --- | --- | --- | --- | --- |
| 成都周边桌面 | 1047×717 | 1017×687 | 5 | 0 / 0 / 0 / 0 |
| 西安桌面 | 1047×717 | 1017×687 | 7 | 0 / 0 / 0 / 0 |
| 成都周边手机 | 390×844 | 360×814 | 5 | 0 / 0 / 0 / 0 |
| 西安手机 | 390×844 | 360×814 | 7 | 0 / 0 / 0 / 0 |

成都周边 5 校为四川大学、西南交通大学、电子科技大学、四川农业大学、西南财经大学。四川农业大学记录的城市字段为雅安，地图代表校区坐标在成都温江，因此通过“西南→四川”聚合验证，未用“成都”文字筛选排除该校。

西安 7 校为西北大学、西安交通大学、西北工业大学、西安电子科技大学、长安大学、陕西师范大学、中国人民解放军空军军医大学。手机使用“西安”搜索后的西北/陕西聚合进入该区域。

重新导航全国页后，桌面显示 30 个省级标签、手机显示 7 个大区标签，均无矩形重叠。成功的干净导航运行未捕获 pageerror，也未出现 R3F `null.addEventListener`。开发服务共享热更新期间出现过相机/聚合状态重置，稳定重跑后上述矩形检查通过；不以热更新期间的失败作为最终截图。

点击列表的四川大学后，在飞行期间 URL 保持全国页，选中标签显示为四川大学，抵达后跳转 `/university/10610/campus/main`。该运行未捕获 pageerror。静止后连续 3 秒新增 WebGL draw 调用为 **0**，未引入持续渲染。返回高校列表的脚本使用了不匹配的新按钮名称，未完成往返断言；**完整校园往返和最终入口动画由入口 QA 覆盖，本报告不声明已完成往返验证**。

## 截图

- [桌面成都 5 校](../output/playwright/map-label-desktop-chengdu-initial.png)
- [桌面西安 7 校](../output/playwright/map-label-desktop-xian-initial.png)
- [手机成都 5 校](../output/playwright/map-label-mobile-chengdu-initial.png)
- [手机西安 7 校](../output/playwright/map-label-mobile-xian-initial.png)
- [飞行中的选中学校](../output/playwright/map-label-desktop-selected-flight.png)

同一目录还保留每组的 `-zoom.png`、`-pan.png`、`-resize.png` 及两种窗口的 `-national-return.png`，共 19 张本次截图。
