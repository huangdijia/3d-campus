# 高校校徽来源与覆盖核验

核验日期：2026-09-06。本记录仅涉及校徽资产，不代表校园或全国地图通过发布验收。

## 实际交付

- 115 所学校全部有独立 PNG 校徽，按当前稳定学校 ID 存放在 `public/emblems/`；缺图 0，总大小 10,430,875 字节。
- 14 所使用官网原始独立 PNG（北大为官网 ZIP 中的原始文件）；另 21 所已与官方标识或标准组合图对照，`verified: true` 共 35 所。
- 其余 80 所保留 `verified: false`，下表列明具体待核验项。没有把下载成功当成官方视觉审核通过。
- 115 张均在独立浏览器逐张查看，正常解码、图案可见，资源页校名匹配；显示检查与官方来源核验分别记录为 `displayReview` 和 `verified`。
- 原图未裁剪、重绘或改色。没有通用学位帽、favicon 聚合代理、AI 生成图像。矿业、地质、石油等不同学校按完整校名匹配；军医大学使用当前校名版本。

## 来源和接口

`public/data/university-emblems.json` 是以学校 ID 为 key 的对象。每项包含 `universityId`、`name`、`localPath`、`sourceUrl`、`officialPage`、`verified`、`notes`、SHA-256、尺寸和字节数；已核验的集合图另记录官方参考图 URL 和 SHA。

发现目录使用固定提交的[中国大学视觉形象识别系统目录](https://github.com/urongda/Visual_Identity_System_Chinese_University/tree/7120523b8d9e6242389ffc2e7008d23a5a006d93)，集合图片来自 [Urongda 校徽资源](https://www.urongda.com/)。实际下载 URL 和对应官方页面均记录在索引中，不将集合图称为官网直接下载。

北大优先采用[官网圆形校徽下载](https://vim.pku.edu.cn/xzzq/index.htm)内的 `标志_红色.png`；空军军医采用[官网学校标志](https://www.fmmu.edu.cn/xxgk/xxbz1.htm)原图；海军军医集合图已对照其[官网](https://www.smmu.edu.cn/)页眉当前校徽。

`verified` 表示学校身份与主要视觉形制对照或官方原始文件确认，不代表学校授权，也不代表完整 VIS 色值、最小尺寸或商业使用审批。标识权利归各大学。前端应保持原比例与原色，不套色、不改变透明度、不裁切。

## 检查与复现

- `python3 scripts/fetch-emblems.py --check`：核对全部学校 ID、SHA、PNG 签名/尺寸、逐块 CRC、IDAT 解压和行数据长度；拒绝缺失文件、重复 SHA、损坏图片。115/115 通过。
- `python3 -m py_compile scripts/fetch-emblems.py`：通过。
- `python3 scripts/fetch-emblems.py` 完整采集，`--ids=10001,10003` 指定学校。官方原图固定已核验 SHA，上游变更不会被静默接受。
- 独立 Playwright 会话查看全部 115 张图片；另查看 48 所可取得官方正文图片的对照页。只有新闻、二维码或未辨清校徽的参考图没有被作为核验通过依据。

## 尚未完成官方对照的学校

| ID | University | Pending verification |
| --- | --- | --- |
| 10002 | 中国人民大学 | Official page unavailable: HTTP Error 404: Not Found |
| 10006 | 北京航空航天大学 | Official page unavailable: HTTP Error 404: Not Found |
| 10007 | 北京理工大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10008 | 北京科技大学 | Official page unavailable: HTTP Error 404: Not Found |
| 10010 | 北京化工大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10013 | 北京邮电大学 | Official page unavailable: HTTP Error 412: Precondition Failed |
| 10019 | 中国农业大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10026 | 北京中医药大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10027 | 北京师范大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10030 | 北京外国语大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10033 | 中国传媒大学 | Retrieved page still requires school-name and identity-content confirmation. |
| 10034 | 中央财经大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10036 | 对外经济贸易大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10043 | 北京体育大学 | Retrieved page still requires school-name and identity-content confirmation. |
| 10045 | 中央音乐学院 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10052 | 中央民族大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10053 | 中国政法大学 | Retrieved page still requires school-name and identity-content confirmation. |
| 10054 | 华北电力大学 | Official page unavailable: HTTP Error 404: Not Found |
| 10056 | 天津大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10062 | 天津医科大学 | Retrieved page still requires school-name and identity-content confirmation. |
| 10080 | 河北工业大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10112 | 太原理工大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10126 | 内蒙古大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10141 | 大连理工大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10151 | 大连海事大学 | Official page unavailable: HTTP Error 404: Not Found |
| 10184 | 延边大学 | Official page unavailable: <urlopen error [SSL: TLSV1_ALERT_PROTOCOL_VERSION] tlsv1 alert protocol version (_ssl.c:1129)> |
| 10200 | 东北师范大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10217 | 哈尔滨工程大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10224 | 东北农业大学 | Official page unavailable: Remote end closed connection without response |
| 10225 | 东北林业大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10246 | 复旦大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10247 | 同济大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10248 | 上海交通大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10251 | 华东理工大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10271 | 上海外国语大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10285 | 苏州大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10286 | 东南大学 | Official page unavailable: HTTP Error 404: Not Found |
| 10288 | 南京理工大学 | Retrieved page still requires school-name and identity-content confirmation. |
| 10290 | 中国矿业大学 | Official page unavailable: HTTP Error 404: Not Found |
| 10295 | 江南大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10319 | 南京师范大学 | Official page unavailable: HTTP Error 412: Precondition Failed |
| 10335 | 浙江大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10358 | 中国科学技术大学 | Official page unavailable: <urlopen error EOF occurred in violation of protocol (_ssl.c:1129)> |
| 10359 | 合肥工业大学 | Official page unavailable: HTTP Error 404: Not Found |
| 10384 | 厦门大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10386 | 福州大学 | Retrieved page still requires school-name and identity-content confirmation. |
| 10403 | 南昌大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10422 | 山东大学 | Retrieved page still requires school-name and identity-content confirmation. |
| 10423 | 中国海洋大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10487 | 华中科技大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10491 | 中国地质大学（武汉） | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10497 | 武汉理工大学 | Official page unavailable: HTTP Error 404: Not Found |
| 10511 | 华中师范大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10520 | 中南财经政法大学 | 官网参考图使用蓝紫色，本地集合版本为绿色；学校身份可辨，标准色版本仍待进一步确认。 |
| 10532 | 湖南大学 | 官网参考图使用绿色，本地集合版本为红色；学校身份可辨，标准色版本仍待进一步确认。 |
| 10533 | 中南大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 91002 | 中国人民解放军国防科技大学 | Retrieved page still requires school-name and identity-content confirmation. |
| 10559 | 暨南大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10574 | 华南师范大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10589 | 海南大学 | 官网参考图与集合版本的蓝色及边框表现不同；保留待核验状态。 |
| 10610 | 四川大学 | Official page unavailable: HTTP Error 404: Not Found |
| 10613 | 西南交通大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10614 | 电子科技大学 | Official page unavailable: HTTP Error 403: Forbidden |
| 10626 | 四川农业大学 | Official page unavailable: HTTP Error 404: Not Found |
| 10635 | 西南大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10657 | 贵州大学 | Official page unavailable: HTTP Error 404: Not Found |
| 10673 | 云南大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10694 | 西藏大学 | Retrieved page still requires school-name and identity-content confirmation. |
| 10698 | 西安交通大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10699 | 西北工业大学 | Retrieved page still requires school-name and identity-content confirmation. |
| 10701 | 西安电子科技大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10712 | 西北农林科技大学 | Retrieved page still requires school-name and identity-content confirmation. |
| 10718 | 陕西师范大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10730 | 兰州大学 | Official page unavailable: HTTP Error 412: Precondition Failed |
| 10743 | 青海大学 | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 10749 | 宁夏大学 | Official page unavailable: <urlopen error EOF occurred in violation of protocol (_ssl.c:1129)> |
| 10759 | 石河子大学 | Retrieved page still requires school-name and identity-content confirmation. |
| 11413 | 中国矿业大学（北京） | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 11414 | 中国石油大学（北京） | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
| 11415 | 中国地质大学（北京） | Official page retrieved; an identifiable standalone emblem or standard combination has not been confirmed. |
