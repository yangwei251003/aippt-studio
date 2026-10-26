# 第三方代码、字体与素材边界

核对日期：2026-10-26。仓库 MIT 只覆盖自有部分；下列材料保留原作者与原许可。本项目是演示文稿应用，不能把它拆成受限组件或字体素材包出售、转授权或单独再分发。

## 应用中的 React Bits 派生组件

[React Bits 官方许可](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md)为 **MIT + Commons Clause**；允许在应用/网站/产品中使用，但禁止将组件本体单独、作为合集或移植版重新分发。完整原文见 `licenses/react-bits/LICENSE.md`，版权属于 David Haz。它不是纯 MIT / 无限制的组件库许可。

适用路径（含对应 CSS）：

- `apps/web/components/navigation/pill-nav.tsx`、`pill-nav.module.css`：Next Link、产品样式、移动导航与生命周期适配。
- `apps/web/components/backgrounds/aurora.tsx`、`galaxy.tsx`：独立产品页面背景，生命周期/降级适配。
- `apps/web/components/motion/dot-grid.tsx`、`scroll-float.tsx`：产品内动效、Reduced Motion 与资源释放适配。

源码已保留逐路径归因。`optional/components/reactbits-reference/` 中的独立参考组件副本及完整参考文本不公开。另一个本地“3.0”视觉组件合集用途不同，不纳入本应用许可推断，也不称为原创演示引擎。

## Uiverse 交互参考

作者标注 `gharsh11032000`，来源 [Uiverse](https://uiverse.io/)，[官方 MIT 原文](https://github.com/uiverse-io/galaxy/blob/main/LICENSE)存于 `licenses/uiverse/LICENSE`。适用 `apps/web/components/motion/specular-action.*` 与 `optional/components/aippt-motion-ui/ExpandingArrowButton/*` 中的交互参考及其产品适配。保留作者归属，不宣称全部独创。

## 字体：原字节保留、没有修改字体

| 文件 | 内嵌身份 / 版本 | 许可与要求 |
|---|---|---|
| `aippt-misans-{regular,semibold,bold}.woff2` | MiSans / MiSans Semibold 4.009 | 小米 MiSans 自定义许可；本软件使用 MiSans；不单独分发或改作字体；保留版权与协议 |
| `aippt-source-han-serif-medium.otf` | Adobe Source Han Serif CN Medium 1.000 | SIL OFL 1.1；Reserved Font Name: Source |
| `aippt-smiley-sans-oblique.ttf` | atelierAnchor Smiley Sans Oblique 1.0.0 | SIL OFL 1.1；保留原版权与协议 |

完整原文在 `apps/web/public/fonts/LICENSES/`，字体 SHA 与来源记录在该目录的 `FONT_SOURCES.md`。文件名是站内资源别名，字体内部数据未改。MiSans 官方[下载与协议](https://hyperos.mi.com/font/zh/download/)允许应用作品使用，限制字体单独再分发；不能把字体改授 MIT。OFL 原文从 Adobe `1.000R` 与 Smiley Sans `v1.0.0` 官方版本取得。原生系统字体回退不随仓库分发。

## 自有视觉与资源

原开发台账将品牌、页核角色、琶洲场景及视觉方向图记录为本项目生成/提供的资产；现按用户开源授权随本应用公开。它们不是第三方城市照片，也不代表用户实际住址或定位。公开范围包括必要源图、生成脚本、原生模板定义、声明式 Skill、种子 SVG 和预览；依赖缓存、运行期生成库、私人演示稿及数据库没有上传。

自有资源的旧 `LicenseRef-AIPPT-Original` 产品限定声明，已在本公开版本代码/目录中统一为 MIT，并要求保留版权与许可。应用内套餐/点数/商品价格是产品配置和测试场景，不是用户财产信息；支付仅有 Mock / 不可用 Provider，未接真实支付。

## npm 依赖与原生库

固定版本/完整性记录见 `pnpm-lock.yaml`，完整生产依赖通知见 `licenses/NPM_NOTICES.md`。实际 Windows 安装图归档 259 个生产包、246 段不同通知文本、未解决条目 0；其中 `https@1.0.0` 只有 package.json，没有 JavaScript 或原许可文件，ISC 标准全文是依 manifest 声明补充；`ogl@1.0.11` 缺完整原许可文件，补充其声明的 Unlicense 全文，未伪造上游版权或改授 MIT。

GSAP 保留自身 Standard No Charge 条款，不按 MIT 归类；Sharp/libvips 保留 LGPL / GPL / MPL 等对应原生组件通知，打包构建工具的 Apache 许可不代替原生库许可。`licenses/upstream/` 包含已核对的 Linux 原生包通知以便跨平台核对；本次只在 Windows 运行应用，未声称 Linux 后端运行通过。

`docs/THIRD_PARTY_NOTICES.md`、`optional/licenses/THIRD_PARTY_NOTICES.md` 仍含原项目的概念参考/待审条目；它们不证明所有参考项目代码已集成或许可已审核。未执行 `PENDING_AUDIT` 上游工具，不镜像商业模板站案例或外部账号素材。
