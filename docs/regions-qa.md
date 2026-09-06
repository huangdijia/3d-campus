# 七大区筛选验证

2026-09-06，开发服务器，独立 Chrome 会话，1047 × 717 与 390 × 844。

- 全国与华北、东北、华东、华中、华南、西南、西北，共八项。
- 西南共 10 所；“交通”搜索与 211 筛选交集为西南交通大学 1 所，改选 985 后为 0 所。
- 弹出面板在两种视口内完整显示；Escape 关闭并恢复触发按钮焦点。
- 刷新、浏览器返回与旧省份 URL 转换通过；URL 筛选优先于历史存储。
- 清洁导航控制台错误为 0；筛选和地址相关 16 项 Node 测试通过。
- 开发期间曾遇到并发热更新旧模块错误；刷新后独立重复验证通过。

截图仅用于面板与筛选布局验证，截图时未等待全国模型完整加载。

- [桌面面板](../output/playwright/regions-desktop.png)
- [手机面板](../output/playwright/regions-mobile.png)
- [桌面已选](../output/playwright/regions-selected-desktop.png)
- [手机已选](../output/playwright/regions-selected-mobile.png)
