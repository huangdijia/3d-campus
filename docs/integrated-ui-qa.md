# 集成界面回归

2026-09-06，七大区筛选、地图标签避让、先飞行后入校及建筑名称气泡合并后统一验证。

- TypeScript `tsc --noEmit` 通过。
- `oxlint --type-aware app scripts tests vite.config.ts` 通过。
- 26 项 Node 测试全部通过；生产构建完成。
- 本地生产 Worker 的北京大学入校流程：点击 250ms 后仍为全国 URL，显示“正在前往 北京大学”，抵达后进入校园。
- 选中北京大学古籍图书馆后，名称气泡显示在建筑上方，正文段落为 0，左侧仍保留 139 项建筑列表。
- 返回全国后从北京位置点击贵州大学，在飞行中重置筛选，等待 3.2 秒仍停留全国页；状态消失，恢复 115 所学校。
- 最终生产浏览器控制台错误为 0；存在 Three.js Clock 弃用警告。
- 首次生产检查沿用了旧预览进程，旧 Worker 引用已替换的资源产生 404；重启该预览进程加载当前构建后，以上验证通过。

[生产建筑截图](../output/playwright/production-final-building.png)。专项证据见 [入校动画](campus-entry-qa.md)、[标签避让](map-label-qa.md)、[地区面板](regions-qa.md)、[建筑列表](campus-sidebar-qa.md)。
