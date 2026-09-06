# PWA 安装与离线范围

山河学府提供中文 Web App Manifest、192/512 PNG、512 maskable 图标及180像素 Apple Touch 图标。第二版图标由内置 imagegen 生成，融合校门、山峰、河流和书页；原图与提示词见 [图标设计记录](pwa-icon.md)。本机 sips 导出所需尺寸，未新增运行依赖。图标使用带版本的新文件名，旧图标保留以兼容已缓存清单。Manifest 的 `id`、`start_url`、`scope` 均为 `/`，显示模式为 `standalone`，主题与启动背景为浅色 `#f5f7fb`。

支持安装的浏览器可通过地址栏安装入口或浏览器菜单安装；iOS 可通过 Safari 的“添加到主屏幕”打开。安装入口由浏览器决定，本次未实现自定义安装弹窗。Manifest 配置依据 [MDN Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/index.html)。

## 注册与更新

`app/ui/pwa-register.tsx` 仅在 production 且安全上下文中注册根作用域 `/sw.js`。`npm run dev` 不注册；HTTPS 正式站及 localhost 的 Wrangler 生产预览可注册。开发与预览使用不同端口，避免已有生产 Worker 控制开发页面。注册失败不阻断在线浏览。

Worker 不调用 `skipWaiting` 强行替换当前页面；更新版本等待旧页面关闭后激活。激活时仅清理 `shanhe-pwa-` 前缀的旧版本缓存并接管页面，保留其他应用缓存。缓存策略变更时同步更新 `public/sw.js` 的 `VERSION`。

## 按访问建立缓存

只处理同源 GET。POST、外站、API、鉴权路径、Authorization/Range 请求、RSC、开发 HMR 请求均绕过。只缓存成功且可公开缓存的响应，跳过重定向、opaque、`no-store`、`private`、`Vary: *` 及 RSC 响应。策略依据 [MDN 离线及后台操作](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation)。

页面和资源均采用网络优先；网络失败时读取缓存。页面只允许根地图及公开校园路径 `/university/学校ID/campus/校区ID`。校园导航按同路径HTML、根HTML、内置中文离线提示页依次回退。静态资源范围包括 `/_next/static/`、`/assets/`、校园JSON、地理数据、校徽及图标；模型限定 `/models/*.glb`。不批量预下载校园。

| 缓存                 | 数量上限 | 总大小上限 | 单项上限 |
| -------------------- | -------: | ---------: | -------: |
| 页面                 |        4 |      4 MiB |    2 MiB |
| 脚本、样式及静态资源 |      180 |     40 MiB |   12 MiB |
| 校园模型             |        6 |     32 MiB |    8 MiB |

写入串行执行，超限时从最早缓存的项目开始移除。浏览器仍可能因存储空间不足主动清除缓存。首次注册后，页面向Worker提供已经实际请求的资源地址，自动补缓存当前公开HTML及同源静态资源；校园模型只允许补当前校园实际请求过的那一份。Worker再次验证页面身份、路径及资源允许列表，不抓取学校目录。待首次缓存完成后即可复访；未缓存或已被淘汰的资源仍需要联网，不承诺全部115所高校离线可用，也不承诺外部官网可离线访问。

## 复核方式与结果

- `node --check public/sw.js` 和针对布局、注册组件及 Worker 的 Oxlint 检查通过。
- 临时隔离测试验证同源GET允许列表、API/auth/RSC/POST/外站/Range隔离；6个模型数量限制、32 MiB容量淘汰及超过8 MiB的单项拒绝通过。
- 2026-09-06站点负责者完成生产构建，并修复Wrangler的 `ASSETS` 绑定；`http://localhost:8788/sw.js` 返回真实脚本内容，源码、构建产物和线上响应SHA-256一致。
- 使用Playwright驱动本机Chrome独立持久配置（1440×950）；本会话未提供Browser插件。首次直接打开清华校园，Manifest解析错误与CDP安装条件错误均为空，Worker已激活并控制根作用域。实际系统安装弹窗、iOS及其他浏览器未验证。
- 无手动刷新预热：首次校园访问后自动缓存完成，断网刷新深链接 `/university/10003/campus/main`，校园HTML、JS/CSS与`10003.glb`全部由Service Worker以200返回；真实校园及358个候选建筑列表可用，未出现空白页、框架错误覆盖层或JavaScript异常。
- 另一独立配置首次打开全国地图后，自动缓存全国底图、清单及高程数据；断网刷新，`national-map.glb`由Service Worker以200返回，点击“985 高校”可将列表筛为39所。该配置未预下载任何校园模型，JavaScript异常为0。截图：[全国地图离线筛选](../output/playwright/pwa-offline-root.png)。
- 删除页面缓存后继续断网刷新，显示“当前处于离线状态”的中文提示及重试入口，明确说明未缓存资源需联网。截图：[校园离线复访](../output/playwright/pwa-offline-campus.png)、[无页面缓存回退](../output/playwright/pwa-offline-fallback.png)。

复现命令：先运行 `npm run build`，再运行 `npm start -- --port 8788`，在独立浏览器配置中访问 `http://localhost:8788/`。确认 Manifest 名称、图标、根作用域及生产 Worker 激活；联网访问校园，等待对应HTML、JS/CSS、校园JSON及GLB进入缓存，再断网刷新同一校园深链接。检查实际渲染、控制台错误以及未缓存资源的明确回退。另需在支持安装的目标浏览器手动确认系统安装与启动体验。
