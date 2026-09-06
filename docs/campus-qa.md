# 校园场景功能验证

验证日期：2026-09-06。对象为本地开发服务 `http://localhost:3000`，重点校园直链为 `/university/10003/campus/main`。这是交互和资源管理验收记录，不是校园资料真实性、精细建模等级或正式发布验收。

## 实现与接口

`CampusScene` 保持原有 `campus / selected / onSelect / touring / onTourIndex / walk / reset / onError / onReady` 接口。

- 合并后的建筑和屋顶通过 `featureRanges` 与命中的三角面索引定位 POI；拖拽不触发选中。
- 鸟瞰使用左键平移、滚轮缩放、右键旋转；触屏单指平移、双指缩放旋转。选中建筑平滑飞行，导览可以暂停并从当前位置继续。
- 漫游使用 Rapier 固定物理步长和胶囊角色，处理建筑碰撞、地面吸附、坡度、越界、意外坠落与安全返回。安全起点选择校内道路中点，避开建筑和校园内洞；建筑庭院仍可行走。
- 桌面支持 WASD / 方向键、鼠标锁定与拖动视角；触屏支持按住四向按钮行走和拖动场景转头。输入框不会被行走快捷键抢占。失焦、页面隐藏、指针取消与卸载时清除移动输入。
- GLB 请求可以中止，有 HTTP 错误及超时处理；碰撞资料缺失时保留鸟瞰并提示漫游不可用。切换校园销毁自有几何、材质和纹理。手机最大 DPR 为 1，桌面为 1.5。
- `polygons`（首环外边界、后续内洞）和 `footprints.holes` 已支持；兼容旧 `rings / polygon` 资料。

物理控制方式参考 [Rapier 官方角色控制文档](https://rapier.rs/docs/user_guides/javascript/character_controller/)。

## 已通过的验证

| 检查 | 结果与证据 |
|---|---|
| 校园文件 lint | `node_modules/.bin/oxlint app/ui/campus-scene.tsx app/ui/campus-walker.tsx app/ui/campus-geometry.ts app/ui/campus-geometry.test.mjs`，通过 |
| TypeScript | `node_modules/.bin/tsc --noEmit`，通过；完整生产构建由主代理统一执行 |
| 独立测试 | `node --experimental-strip-types --test app/ui/campus-geometry.test.mjs`，7/7 通过 |
| 碰撞数据覆盖 | 当前 112 个 `*-collision.json` 均通过格式校验且找到安全道路出生点，112/112 |
| 实际 GLB 建筑点击 | 点击清华 GLB 中 `83805067` 屋顶三角面，详情显示“清华学堂”；不是用列表点击替代网格点击 |
| 桌面拖拽 | 拖拽后相机与 target 的位移差最大约 `4.3e-14`，没有意外绕转 |
| 建筑定位与导览 | 列表选中打开详情并飞行；导览暂停后等待 1.2 秒，相机坐标完全不变 |
| 桌面漫游 | 按住前进 2.5 秒移动约 10.07 米；安全返回恢复原 x/z |
| 真实网格碰撞 | 清华实际 GLB 中最近墙距起点 8.27 米，角色前进约 7.98 米后被阻挡；地面高度正常 |
| 手机触摸漫游 | Chrome 移动模拟 360×732，`maxTouchPoints=1`；原生 touch event 按住前进 1.5 秒移动约 6.18 米，拖动视角改变 yaw/pitch |
| 手机地图手势 | 单指平移时相机与 target 位移差最大约 `8.5e-14`；双指张开后观察距离由 2387.86 降到 1705.62，缩放生效 |
| 手机渲染与面板 | 漫游自动收起侧栏，四向按钮可触达；Canvas 为 360×670，DPR=1 |
| WebKit | Playwright WebKit 26.5 成功加载校园、点击建筑详情并进入 Rapier 漫游；按住前进约 1 秒，z 从 -16.05 变化到 -19.38，无运行时异常 |
| GLB 加载失败 | 浏览器中断 GLB 请求，出现校园资料失败提示；移除拦截并重载后，漫游按钮重新可用 |
| 碰撞资料失败 | 模拟碰撞 JSON 返回 404，显示“漫游资料尚未就绪，仍可使用鸟瞰与建筑导览”；可切回鸟瞰 |
| 重复进入与退出 | 连续 3 次从全国进入清华后返回，每次渲染器均为 5 个 geometry / 1 个 texture，每次退出收到 5 个 geometry dispose 事件 |

独立测试分别覆盖：合并网格三角面范围边界、校界/建筑/内洞排除、真实庭院可行走、坏数据拒绝、碰撞坐标变换与装饰排除、合成墙体碰撞/落地/重置、清华实际 GLB 墙体碰撞。

## 性能与截图

Chrome 152 的本地开发版本，Canvas 为 880×601、DPR 1.5，清华建筑选中状态连续采样 3 秒，平均 **59.74 FPS**，7 draw calls，24,153 个三角面。此数据只代表该设备、场景和采样时段，没有做网络限速，也不代表所有校园或低端手机性能。

截图位于 `output/playwright/`：

- `campus-building-click.png`：新单侧栏界面下实际点击 GLB 建筑。
- `campus-mobile-walk.png`：手机漫游与收起后的面板。
- `campus-webkit-building.png`、`campus-webkit-walk.png`：WebKit 场景。
- `campus-model-failure.png`：人为中断模型请求后的错误提示。
- `campus-walk-desktop.png`：早期场景验证截图，UI 已被后续单侧栏版本替换。

## 限制

- 112 个安全出生点检查只验证数据格式和空间可行性，没有逐校进行官网校区、道路和 POI 核验，也没有把这些模型计为完成 S/A/B 内容等级。
- WebKit 测试是 Playwright 引擎测试，不能冒充独立 Safari 应用或 iPhone 实机验收。
- 已验证显式 GPU 几何释放和 3 次切换时的稳定计数；未进行长时间 JS 堆分析或所有校园的内存压力测试。
- 开发期间服务曾出现 Vinext `Network connection lost` 和热更新重载；主代理重启服务后已重新测试。资源失败测试中的 404 / aborted 请求是人为注入；正常浏览存在 Three.js / Rapier 依赖自身的弃用提示。
- 导览为建筑鸟瞰路线，不是核验过的地面步行导航；第一人称的几何碰撞不能证明现实校园开放或通行条件。

## 2026-09-06 鸟瞰闪烁与性能修复补充

以下数据覆盖后续运行时修改；上文的旧截图和持续渲染性能数字只作为历史验证记录。

### 原因及修复

浏览器读回原配置为 24 位深度、near=0.2、far=15000。在约 2388 米观察距离处，普通透视深度的量化步长约 1.7 米，远大于旧建筑 cap 与独立 roof 的 0.05 米间隔，也大于道路与地面的 0.12 米间隔。只靠 renderOrder 不能修复这个问题。

数据代理移除冗余建筑顶盖；运行时使用 logarithmicDepthBuffer，并按视点与校园包围范围收紧 far。鸟瞰 near 随距离取 1–10 米，地面漫游使用 0.15 米；清华初始鸟瞰实际读回 near=10、far≈4367.43。WebKit 26.5 同样确认 log depth 生效，没有依赖浏览器独有扩展。相关行为见 [Three.js WebGLRenderer 文档](https://threejs.org/docs/pages/WebGLRenderer.html)。该选项会关闭 early fragment test，不能预设其活动帧性能完全无损，因此进行了后续活动帧采样。

同一浏览器、同一份已去 cap 的 21,175 三角面 GLB，旧 near0.2/far15000 与新深度设置对照截图分别为 `output/playwright/campus-depth-before.png`、`campus-depth-after.png`。旧图中破碎的道路条带在新图中连贯。另有只改普通深度 near=30 的对照 `campus-depth-near30.png`，用于独立确认深度精度因素。

额外用相同场景和 880×673 离屏渲染器，将相机平移 0.02 米：最大 RGB 通道变化超过 10 的像素，普通深度为 449 个，对数深度为 230 个。该实验包含正常边缘采样差异，不能将每个变化像素都计为闪烁，也不能代替逐校视觉验收。

### 性能与交互回归

- 相同清华鸟瞰模型、相同 5 draw calls：旧 always 在 3.002 秒绘制 180 帧；新 demand 初次绘制 4 帧后，连续 3.0015 秒新增 0 帧。
- 静止鸟瞰/暂停导览使用 demand；导览、漫游使用 always；自动飞行期间显式 invalidate。飞行最终 target 与清华学堂 POI 坐标完全相同，暂停后 1.8 秒相机不动且新增 0 帧，继续导览正常；退出漫游后恢复 0 帧空闲。
- demand 下鼠标拖拽使相机和 target 同步平移约 36.9 米；阻尼完全停止后再观察 1.5 秒，新增 0 帧。
- 前景 Chrome 活动导览采样 3.0015 秒绘制 164 帧，约 54.64 FPS，6 draw calls / 21,217 三角面。另一次同时切换浏览器窗口的采样为约 35 FPS，说明窗口可见性和系统负载会影响结果；不能据此宣称所有设备均固定 60 FPS。
- `Physics + Rapier + Walker` 整体移到动态导入的 `campus-walk-world.tsx`；普通鸟瞰网络记录没有 Rapier / Walker / walk-world 请求，进入漫游后才出现。四向控制 UI 独立为轻量模块。
- 普通模型验证只检查是否存在可用几何，不再预构造碰撞缓冲。碰撞网格在漫游组件中按模型 memoize，并包含独立 roof，兼容移除建筑顶盖后的 GLB。
- Chrome 和 WebKit 都完成了 demand 下的建筑飞行、按需加载物理与漫游→鸟瞰切换；WebKit 仍属于自动化引擎验证，不是 Safari/iPhone 实机测试。
- 修改后的校园文件 lint、TypeScript 和 7 项几何/物理测试通过。最终生产 bundle 大小与完整 build 由主代理统一测量。

## 2026-09-06 最终手机交互回归

使用独立、非持久化 Playwright CLI 会话，Chrome 与 WebKit 均设为 390×844；Chrome 实际读回 `visualViewport.scale=1`、`maxTouchPoints=1`、DPR=3。以下均为本地开发版本，完整生产构建与发布由站点负责者验证。

| 路径 | 结果 |
|---|---|
| 手机初始信息条 | PASS，实测 366×65 px，位于 x=12、y=750；展开后面板可浏览 |
| 高校列表一键进入 | Chrome / WebKit PASS，直接进入 `/university/10003/campus/main`，信息面板自动收起 |
| 原生单指平移 | PASS，CDP touch event 后相机和 target 同步位移 x≈-137.85 m、z≈-59.08 m |
| 原生双指缩放 | PASS，观察距离 2387.86→1705.62 m，页面缩放仍为 1 |
| 底条上滑展开 | PASS，原生 touch 上滑 84 px 后显示校园面板；点击展开亦通过 |
| POI 自动收起与分享刷新 | PASS，选中清华学堂后 URL 为 `?poi=83805067`；刷新保留 URL、定位、标题及底条“清华学堂” |
| 导览与暂停 | PASS，切换导览自动收起，URL 为 `?mode=tour`；底条暂停按钮切换为“继续导览” |
| 漫游与退出 | Chrome / WebKit PASS，`?mode=walk` 显示触屏四向控制和退出入口，退出恢复鸟瞰 |
| 校园直接返回高校列表 | PASS，URL 回到 `/`，标题为“山河学府 · 全国高校”，底条恢复“搜索高校”，无遗留学校详情 |
| 旧学校链接 | PASS，直接访问 `/university/10003` 自动归一到 `/university/10003/campus/main` |

本轮没有新增校园源码修复。正常交互的浏览器控制台为 0 errors，仅有已知依赖弃用提示。本轮 WebKit 仍是引擎模拟，不是 iPhone 实机验证；行走距离与碰撞沿用上面的专项实测，本轮只回归模式入口与退出。

实际截图位于 `output/playwright/`，已检查渲染内容：

- `campus-final-chrome-expanded.png`：触屏上滑后的校园面板。
- `campus-final-chrome-poi-refresh.png`：POI 分享链接刷新后的定位与底条。
- `campus-final-chrome-tour-paused.png`：手机导览暂停状态。
- `campus-final-chrome-walk.png`：手机漫游与四向控制。
- `campus-final-webkit-collapsed.png`、`campus-final-webkit-walk.png`：WebKit 手机鸟瞰与漫游。

全国标签布局由站点负责者独立回归；`campus-final-chrome-national.png` 拍摄早于其最终标签错位与引线修改，不作为该修改的验收截图。
