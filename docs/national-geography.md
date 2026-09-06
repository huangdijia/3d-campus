# 全国地图地理数据核对记录

核对日期：2026-09-06。真实海拔已接入；国界、省界与岛屿对照验收尚未通过。

## 已完成的真实地形

`public/data/terrain.json` 是 GMT 官方发布的 **SRTM15+ V2.7、15 弧分**高程栅格的精确裁剪，不能称为原始 30 米 SRTM。

- 下载源：[GMT 官方数据服务器](https://oceania.generic-mapping-tools.org/server/earth/earth_relief/earth_relief_15m_g.grd)。独立取得的 [NOAA 官方镜像](https://www.star.nesdis.noaa.gov/data/socd3/lsa/gmtdata/earth_relief_15m.grd) 字节完全一致。
- 原始文件：`data/sources/terrain/earth_relief_15m_g.grd`，1,411,602 字节；SHA-256 `0efc23fb13dac354b9a68c79949c470c700d667c37d328138a61a6638407520d`。
- 裁剪：72–137°E、18–54°N；步长 0.25°；261 列 × 145 行，共 37,845 个数值。逐行由南向北，行内由西向东；单位米。
- 读取原始 netCDF 的经纬度轴和 `z`；应用文件的 `scale_factor=0.5`。无插值、无生成噪声、无随机山体、无丢失值补造；保留全部负值，海面遮罩由显示层处理。
- 数值范围：−6814.5 至 5844 米。独立通过 `ncdump` 读出原始栅格，并对全部 37,845 个输出值进行逐项一致性比较，全部通过。
- 样点仅用于方向、缩放和单位合理性检查：85°E/33°N 为 4972.5 米；116°E/37°N 为 30.5 米；121.5°E/31.25°N 为 4.5 米。这些是滤波格点值，不是精确地点测高。

[GMT 数据说明](https://www.generic-mapping-tools.org/remote-datasets/earth-relief.html)说明此产品由 SRTM15+ 做高斯滤波，15 弧分版本的完整滤波宽度为约 78.6 千米。因此格点间距不代表校园或建筑分辨率；不能拿这份数据确定建筑高度、校园坡度或山峰精确海拔。海洋部分还包含测量与推算地形，不能把全部格点称为直接测量。

使用依据来自当前官方 [SRTM15+ README_V2.7](https://topex.ucsd.edu/pub/srtm15_plus/README_V2.7.txt) 保留的公开领域分发声明，及 GMT 对该产品的官方公开分发。README 的声明位于早期 SRTM30_PLUS 版本沿革中，V2.7 没有另列独立的许可证段落；此处如实记录这一依据，不把研究论文的 CC BY 许可当作数据许可。保留 Tozer et al. (2019), DOI `10.1029/2019EA000658` 与 GMT / Scripps 署名。

复现：`python3 scripts/prepare-terrain.py`。依赖 Python 标准库和系统 `libnetcdf`，本机使用已有 Homebrew netcdf，没有增加项目依赖。脚本保留原始下载，固定 SHA-256；上游文件发生变化时拒绝悄悄替换。

## 国界、省界与岛屿：尚未验收

机器可读记录见 `data/national-review.json`，`boundariesVerified` 保持 `false`。

实际检查现有文件得到：

- `china.geojson` 为 Natural Earth CHN/TWN 的两个源要素，范围 73.607324–134.752344°E、18.218262–53.555615°N。没有任何 18.218262°N 以南的几何点，因此当前底稿未覆盖更南方的岛屿表达。图形范围不能作为全国完整性证明。
- `provinces.geojson` 是 72 条线要素，没有用于完整核对的省级名称清单；线条数量不是省级行政区数量。
- 本次没有修改这些地理文件，也没有为其加上审图号或验证标记。Natural Earth 的公共领域许可与中国标准地图的边界符合性属于不同事项。

已尝试访问官方[标准地图服务](https://bzdt.ch.mnr.gov.cn/)及[天地图标准地图入口](https://bzdt.tianditu.gov.cn/)。前者由 curl/urllib 返回证书链校验错误；后者 urllib 返回 TLS EOF，网页读取返回 502。没有取得可校验的标准地图文件、版次或审图号，因此不能完成逐段国界核对，也不能声称省界和岛屿审核通过。

发布前仍需取得官方标准底稿及其版本和校验值；逐段核对国界、全部省级边界和离岸岛屿表达，记录差异与修正；最后对渲染后的范围、标注和岛屿呈现进行检查。真实海拔接入不解除这一发布门槛。
