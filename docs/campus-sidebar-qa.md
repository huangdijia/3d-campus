# 校园建筑列表回归

2026-09-06，独立 Playwright CLI Chrome 会话，测试 `http://localhost:3000`。桌面 1047×717，手机布局 390×844；本轮不修改运行代码，不重复漫游物理或数据生成检查。

## 实际结果

| 检查 | 结果 |
|---|---|
| 贵州大学深链接 | PASS：`/university/10657/campus/main?poi=671660572` 显示 11 项常驻列表，图书馆高亮，建筑上方 1 个气泡 |
| 连续选择与搜索 | PASS：“学院”筛选为 5 项；依次选择烟草学院、美术学院后仍为相同 5 项，query 保持“学院”，各次只有当前建筑高亮 |
| 带筛选的深链接刷新 | PASS：`bq=学院&poi=1346331397` 刷新后保留筛选值、5 项列表、美术学院高亮与 1 个气泡 |
| 导览与返回鸟瞰 | PASS：导览到图书馆时仍保留筛选列表，只有 1 个气泡；回到鸟瞰后没有残留气泡 |
| 手机选择后收起 | PASS：选择音乐学院后底部信息条出现，保留所选 POI 和筛选条件 |
| 手机重新展开 | PASS：重新打开仍显示 5 项建筑列表和音乐学院高亮，没有切换为重复详情页；气泡在展开面板时按样式隐藏 |
| 重复详情、蓝圈和页脚 | PASS：10 个状态快照中 `.poi-detail`、`.panel-bottom` 和场景 RingGeometry 数量均为 0 |
| 全国根页面 | PASS：不存在旧“115 所高校 · 112 所可预览校园”底部条；手机“搜索高校”入口保留正常高校数量提示 |

上述初轮 10 个状态检查期间新增 `pageerror` 和 console error 均为 0。截图已逐张视觉检查，确认列表和建筑上方气泡同时可见，手机展开后仍是列表。

## 仅名称气泡补验

收到气泡简化改动后重新导航，补验桌面图书馆、手机音乐学院、手机导览首站图书馆：三次均只有 1 个 `.campus-tour-callout.name-only`，建筑名称正确，内部 p=0、a=0，没有通用 OSM 来源/估算段落和资料链接。桌面保留 11 项列表，手机及导览保留“学院”筛选的 5 项列表。下列校园截图已更新为仅名称版本。

等待并行地区筛选改动时，旧根页经历开发热更新，日志出现 `provinceRegion` 对 undefined 调用 `replace`，以及 React 依赖 URL hash 不同期间的 PopoverRoot `Invalid hook call` / `useContext` 错误，已通知站点负责者。随后重新导航完成的桌面、手机、导览补验均显示 0 errors，仅有 THREE.Clock 弃用警告；不能把整个开发会话日志宣称为从未出现错误。

## 截图

- `output/playwright/campus-sidebar-desktop-deeplink.png`
- `output/playwright/campus-sidebar-desktop-filtered.png`
- `output/playwright/campus-sidebar-mobile-selected.png`
- `output/playwright/campus-sidebar-mobile-reopened.png`
- `output/playwright/campus-sidebar-national-root.png`
- `output/playwright/campus-sidebar-tour-name-only.png`

此记录验证本地开发版本和指定贵州大学流程；生产构建、提交及发布由站点负责者统一完成。
