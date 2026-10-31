# 移动端适配实施与验收记录

日期：2026-10-27。基线：`6464386531612235903b183158c75620e4fd0540`。工作分支：`feat/mobile-adaptation`。

> 2026-10-28 继续优化已完成本机验证，见文末“继续优化记录”。本轮修复阅读器锚点、分页阻塞和播放器横屏/底部留白问题；生产开关仍关闭。

## 交付状态

[已核实] M01–M09 的移动源码已实现，提供独立预览配置和可重复执行的浏览器检查。生产默认 `mobile.enabled = false`，未提交、未推送、未部署。原有文章、媒体、小说数据和主题 SCSS 未修改。[E1、E2]

[已核实] P0–P5 已实施；P6 已完成下述构建和自动化检查。P6 的真机、长期运行和部分系统交互仍待验收，P7 尚未开放。因此本记录不宣称“全设备验收完成”或“已上线”。

## 证据索引

日志、构建和截图存放在本机 `.mobile-validation/`，已加入本仓库的本地 Git exclude，不纳入源代码提交。浏览器使用独立临时 profile，上传/进度夹具没有访问用户的日常浏览器数据。

| ID | 可定位证据 |
|---|---|
| E1 | `config/_default/params.toml` 的 `[mobile]`、`config/mobile-preview/params.toml`、`static/js/mobile-mode.js`；`layouts/partials/head/custom.html` 的资源引入 |
| E2 | `assets/scss/mobile.scss` 及 `assets/scss/mobile/`；`assets/ts/mobile.ts` 的 `initMobilePage()` / `destroyMobilePage()`；`layouts/partials/mobile/header.html` |
| E3 | `.mobile-validation/acceptance-final/results.json`、`environment.json`；复跑入口 `scripts/verify-mobile.cjs` |
| E4 | `.mobile-validation/extended-release/results.json`；复跑入口 `scripts/verify-mobile-extended.cjs` |
| E5 | `.mobile-validation/baseline-screens/`、`baseline-repeat-screens/`、`preview-screens/`；`desktop-comparison.json`、`baseline-geometry.json`、`preview-geometry.json`；稳定采样补查 `about-geometry.json` |
| E6 | `.mobile-validation/build-production.log`、`build-release-candidate.log`、`build-mobile-production.log`、`build-hugo-157.log` |
| E7 | `.mobile-validation/cdn-final/novel/reader/index.html`、`cdn-rewrite-final.log`、`cdn-network-browser.json`；早期失败记录 `media-validation.json` |
| E8 | `.mobile-validation/final-screens/`：首页、文章、搜索、书架、阅读器、设置、320px、平板、音乐管理、图库，共 11 张 |
| E9 | `layouts/_default/novel-reader.html` 的移动分支；`assets/ts/mobile-reader.ts` 的 `paginate()` / `capture()` / `restore()` / `target()` |
| E10 | `assets/ts/mobile-background.ts`；`layouts/partials/footer/components/script.html` 的移动分流；`static/001/index.html` 的独立移动分支 |

## 实施内容与桌面隔离

| 范围 | 已实现内容 | 桌面保护方式 |
|---|---|---|
| M01 模式/开关 | 手机、Android 平板、iPadOS 判定；同步设置 `html[data-ui="mobile"]`；开关关闭保留旧拦截；移动 viewport 安全区 | 宽度与触屏能力不单独启用；主站与图库共用 `/mobile-config.js`、`/js/mobile-mode.js` |
| M02 首页/归档 | 手机单列、平板双列；触控分页；页码保存到 URL；从文章返回恢复页码 | 滚轮处理只在移动模式提前退出；桌面分页保持原逻辑 |
| M03 普通内容 | 正文、标题、封面、代码、表格、引用、媒体、分类标签、404、评论容器适配 | 原主题/自定义 SCSS 不变；新增规则全部由移动根限定 |
| M04 搜索/目录/图表 | 搜索入口；中文组合输入；过期结果丢弃；目录折叠、点击定位；图表按钮常显与销毁 | 新搜索行为由移动分支控制；原 Mermaid 正常桌面路径保留 |
| M05 音乐 | 同一个 APlayer 的紧凑条、进度/音量/曲目/管理面板；触控换封面；取消选择与存储失败提示 | 不新增 APlayer/audio；IndexedDB 名称、版本 2、存储键、1GB 上限不变；封面按钮仅移动生成 |
| M06 书架 | 两列/四列封面、长标题、普通深链；直接显示书架，不请求入场视频 | 桌面随机视频和预热原路径保留 |
| M07 阅读器 | 单页页数模型；目录/注释映射；原文副本重排；长段落 DOM Range 拆分；语义锚点；设置面板、按钮/手势、取消和错误恢复 | `pagesPerView` 移动为 1、桌面为 2；桌面窄窗原混合行为仍保留，未顺带修改 |
| M08 背景/预加载 | 110 粒子、30fps 上限、DPR 上限 1.5、时间步进、隐藏时取消绘制、减少动态偏好；停止移动整库预取 | 原 350 粒子、速度、颜色、清理与预加载链保留在桌面分支 |
| M09 图库 | 同一开关；可见换图按钮、计数、关闭与键盘入口；横划筛选、多指/取消处理、40 粒子上限 | 所有新增样式和行为按移动模式分流 |

站点覆盖 `layouts/baseof.html` 只增加条件输出的隐藏移动页头；桌面中该节点不占布局。`assets/ts/main.ts` 从主题入口覆盖，仅在移动模式离开文章时调用原有 scrollspy 清理，避免旧文章监听器遗留。`themes/stack/` 未改动。[E2、E3、E5]

发现并修正的加载问题：旧 head 中的拦截 DIV 会提前开始 body；加载动画在后续刷新时提前写入 body 的 class，导致真正 body 标签的页面类型 class 被浏览器忽略。移动模式跳过该提前写入，页面加载与连续刷新恢复正常；桌面原路径保留。[E1、E3]

## 构建与使用

开发预览（设备仿真必须同时使用移动 UA，单独缩窗仍为桌面）：

```powershell
Set-Location 'F:\Yuzexiaoyu.space'
.\hugo.exe server --environment mobile-preview --bind 127.0.0.1
```

本次 CI 版本构建使用下载到本地验证目录的 Hugo `0.156.0 extended`，执行了默认关闭、移动预览和生产压缩移动候选三种构建；本机 `0.157.0 extended` 亦构建通过。[E6]

```powershell
# 默认关闭的生产产物
& '.mobile-validation/tools/hugo.exe' --minify --gc --destination '.mobile-validation/production-final'

# 开启移动功能的生产候选，仅写本地输出目录
$env:HUGO_PARAMS_MOBILE_ENABLED = 'true'
& '.mobile-validation/tools/hugo.exe' --minify --gc --destination '.mobile-validation/release-candidate' --baseURL 'http://127.0.0.1:13133/'
Remove-Item Env:HUGO_PARAMS_MOBILE_ENABLED
python -m http.server 13133 --bind 127.0.0.1 --directory '.mobile-validation/release-candidate'
```

当前本机候选预览为 `http://127.0.0.1:13133/`。重新构建时请使用上述开关，避免把默认关闭的产物当作移动预览。

浏览器检查需已安装 Playwright 与 Chrome；本机通过 `PLAYWRIGHT_MODULE` 指向工作区附带的 Playwright，无新增 npm 构建系统或前端框架。

```powershell
$env:PLAYWRIGHT_MODULE = 'C:/Users/20457/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
node scripts/verify-mobile.cjs http://127.0.0.1:13133 .mobile-validation/acceptance-final
node scripts/verify-mobile-extended.cjs http://127.0.0.1:13133 .mobile-validation/extended-release
```

## 实际验收

环境：[已核实] Windows，本机 Chrome `156.0.8078.48`，Playwright Chromium 移动仿真，DPR 1。iPhone 配置不等于 Safari/WebKit 真机；iPadOS 的 Macintosh UA 与多触点另作仿真检查。[E3、E4]

| 项目 | 结果与范围 |
|---|---|
| 主回归 | 14 组通过；18 个内容路由、模式开关、样式作用域、导航、分页返回、中文搜索、目录、上传播放、分页夹具、实际 EPUB、反复导航、图库、尺寸与未捕获错误检查 [E3] |
| 扩展回归 | 10 组通过；最大实际 EPUB、快速切卷、EPUB 错误重试、背景暂停、iPadOS/触屏 Windows、在线 Mermaid、旧状态迁移、封面/配额/删除、存储不可用、脚本失败恢复 [E4] |
| 尺寸 | 首页覆盖 320、360、375、390、412、430、768、820、1024、1180、1366px；阅读器另有 320px、平板、横竖屏采样 [E3、E8] |
| 内容路由 | `/`、`/archives/`、`/search/`、`/关于/`、`/更新日志/`、`/tags/`、`/categories/`、`/404.html`、六篇实际文章、`/post/`、`/page/`、`/novel/`、`/001/`；阅读器使用实际卷 ID `01`、`03`、`if` [E3、E4] |
| 小说分页夹具 | 1、2、3、31、32 页均完整生成；长段落重排前后文本一致；容器 ID、注释 ID 不丢失/重复，语义锚点可恢复 [E3] |
| 实际第一卷 | 归一化原文 103,696 字符与分页文本完全一致；两条实际注释链接映射正确；末页 100%；目录、字号、四主题、旋转、刷新检查通过 [E3] |
| 最大实际 EPUB | `if.epub` 78,523,189 字节；本机候选仿真加载与分页约 14.1 秒，1,878 页，末页可达；页数与耗时只代表该次设置/环境 [E4] |
| 旧数据 | 旧 `novel-reader-state` 的主题、字号、行距与比例进度保留；首次移动恢复增加 `mobileAnchor`；上传与封面刷新后仍在 [E3、E4] |
| 生命周期 | 首页→文章→搜索→书架→阅读器→首页，共 20 轮/100 次 Swup 导航；始终同一 audio、一个 APlayer、一个画布；document/window 监听器数量前后相同 [E3] |
| 存储异常 | 注入配额异常后没有添加失败曲目，原曲目保留；无效文件跳过；IndexedDB 不可用时内置列表和关闭操作可用，无未捕获异常 [E4] |
| 失败恢复 | 移动模块加载失败时文章与普通导航可用；阅读组件/JSZip/EPUB 失败有重试和书架入口 [E4] |
| 背景暂停 | 合成 visibility 事件测试：隐藏期间绘制次数不增长；重复恢复事件后仍只有一条绘制循环。该用例不是实际系统后台或 30 分钟测试 [E4] |
| 在线图表 | 实际《Markdown基本语法》中的 Mermaid 图表完成加载、放大、Panzoom 就绪和关闭；无未捕获错误 [E4] |

`novel-chapter.html` 当前没有对应生成路由，本次只作模板范围检查，不虚构页面访问覆盖。其他卷的所有特殊排版未逐卷人工阅读。

### 桌面对比边界

[已核实] 22 组改前/改后截图：375、768、1024、1280、1366、1440、1920、2560px 宽的首页与阅读器，以及 1440px 的归档、搜索、关于、书架、图库、复杂文章。采样高度为 900px、DPR 1。原全站样式文件指纹保持一致。[E5]

测试仅控制真实动态区域：隐藏独立 canvas/鼠标光效和音频时间文本，暂停已完成入场的动画；搜索耗时文本固定，保留结果数量和布局。未遮盖正文、卡片、导航或播放器壳体。重复基线用于校准抗锯齿噪声。

[已核实] 16 组像素完全相同，其他 6 组最大通道差为 1；未发现布局/换行/颜色差异。关键几何初采样中“关于”页总高度曾波动 4px；随后同环境等待 2.5 秒、在改前/改后各重复采样，120 个可见元素的几何/样式四次完全相同，证据保存于 `about-geometry.json`。没有通过增大阈值覆盖该波动。[E5]

[未执行] 完整原计划中的全部桌面高度、125%/150% 浏览器缩放、Firefox/Safari、桌面音乐管理所有展开状态及全部动态交互。上述采样结果不代表这些用例已通过。

### 生产媒体与资源

[已核实] 保留 EPUB/APlayer/视频 URL 在原内联脚本，未把媒体前缀搬进外部 JS；原 `replace-media-links.py` 已在独立产物执行，阅读器 fetch 前缀、音乐及书架视频都能重写至现有 CDN。[E7]

[已核实] 携带实际浏览器 UA、站点 Origin/Referer 的浏览器请求，对 EPUB、MP3、MP4 均返回 `206 Partial Content`，范围为前 1024 字节，返回站点对应的 CORS 头。早期 Python 默认请求返回 403，已保留原记录；浏览器请求通过不等于所有 UA/Origin 均会通过。[E7]

新增 CSS/JS 体积以 `.mobile-validation/asset-sizes-release.json` 为准；没有引入第二套播放器或 UI 框架。移动功能关闭时不引入移动 CSS/应用模块，仅共用小型设备判定与配置脚本。

## 未执行与开放前待办

| 范围 | 状态 |
|---|---|
| Android Chrome、iPhone Safari、iPadOS Safari 真机 | 未执行：音频策略、系统文件选择、系统字号、键盘、刘海/手势安全区、边缘返回和双指缩放 |
| 系统后台、真实 BFCache、弱网和中断 | 已测合成事件、请求取消/失败；真实系统情形未完整执行 |
| 背景连续 30 分钟与真机能耗/内存趋势 | 未执行；不能宣称稳定帧率或长时间无积痕 |
| Giscus 登录/评论提交与第三方账户流程 | 未执行；未使用或操作用户账号 |
| 桌面完整验收矩阵 | 仅上述采样通过；其余状态见桌面对比边界 |
| 逐卷全部特殊内容 | 已测第一卷、第三卷切换和最大 IF 卷；其余复杂内容待抽样补齐 |
| 生产开放 | 未执行；必须保留开关关闭，待必需真机与桌面剩余检查通过 |

## 启用与回退

1. 验收后将 `config/_default/params.toml` 的 `[mobile].enabled` 改为 `true`，走既有审核/发布流程。推送 `master` 会自动部署，本次未执行。
2. 回退时改回 `false` 并重新构建/发布。共享 `mobile-config.js` 使独立图库同步回退，无需手工维护第二个布尔开关。
3. 回退不清理 IndexedDB、阅读进度、设置、上传曲目和封面。旧代码仍可读取原 `p/t` 进度字段，新增锚点可被忽略。
4. 临时本地预览进程可终止；`.mobile-validation/` 为本次生成的本地证据目录，源实现均位于 `assets/`、`layouts/`、`config/`、`static/` 和 `scripts/`。

## 继续优化记录（2026-10-28）

[已核实] 在上一轮未提交的实现上继续修改，未覆盖既有源码改动。新增修改集中在 `assets/ts/mobile-reader.ts`、`assets/ts/mobile.ts`、`assets/scss/mobile/_player.scss` 与阅读器模板的移动分支；生产配置仍为 `enabled = false`，未提交、推送或部署。[E12、E17]

### 本轮证据

| ID | 可定位证据 |
|---|---|
| E11 | `.mobile-validation/optimization-before-checks/results.json`：改前四组问题用例失败；改前完整产物 `optimization-before/` |
| E12 | `assets/ts/mobile-reader.ts` 的 `slice()`、`paginate()`、按章节维护的 `chapterIds`；`assets/ts/mobile.ts` 的 `measureObstruction()`；`assets/scss/mobile/_player.scss`；`layouts/_default/novel-reader.html` 的移动 `paginate()` / `gotoPage()` 分支 |
| E13 | `.mobile-validation/optimization-final-checks/results.json`；可复跑入口 `scripts/verify-mobile-optimization.cjs` |
| E14 | `.mobile-validation/optimization-final-acceptance/results.json`、`optimization-final-extended/results.json`、`optimization-online-retry/results.json` |
| E15 | `.mobile-validation/optimization-performance.json`；可复跑入口 `scripts/benchmark-mobile-reader.cjs` |
| E16 | `.mobile-validation/optimization-desktop-verified/` 的 9 个通过场景，加 `optimization-desktop-article/` 的长文章补查；各含截图、几何/样式和像素差异；入口 `scripts/verify-mobile-desktop.cjs` |
| E17 | `.mobile-validation/optimization-build-enabled.log`、`optimization-build-disabled.log`、`optimization-mode-true.json`、`optimization-mode-false.json`；默认开关 `config/_default/params.toml` |

### 修复与覆盖

| 范围 | 改前复现 | 最终结果 |
|---|---|---|
| M07 注释/锚点 | 全书去重删除了第二章的同名 ID；拆分长段落后末尾空锚点丢失 | 去重限定在各章节内部；保留段尾空锚点；两章同名注释和 390→320px 重排用例通过，正文逐字一致 [E11–E13] |
| M07 分页响应 | 2,000 段夹具分页完成后才处理定时事件，取消不能及时介入 | 约 12ms 工作片段之间让出事件循环；完成页暂存，仅当前页参与测量；完成后整体提交，取消时清理自身暂存内容；过期任务不能覆盖新卷 [E12、E13] |
| M05 短横屏 | 667×320 下播放器高 224px、内容高 305px，内容溢出且外层不能滚动 | 播放器局部滚动；播放/收起栏保持可见，最后一首歌可到达 [E13] |
| M01/M05 底部留白 | 固定按播放器高度 +16px 留白，未计入较大的底部安全区 | 按播放器实际顶部到视口底部的距离 +8px 计算；34px 底部偏移夹具中实际遮挡 98px、留白 106px [E13] |
| M01–M09 原有流程 | 需要确认分页优化未影响既有适配 | 主回归 14 组通过：18 个路由、尺寸、搜索、上传播放、全文/目录/注释、旋转/字号、100 次 Swup 导航、图库等；扩展 9 组直接通过，在线 Mermaid 单独重试通过 [E14] |
| 桌面隔离 | 移动优化不能改变桌面及窄桌面窗口 | 10 个场景最终采样通过；关键几何/样式一致，9 组像素完全相同，1440px 阅读器只有 3 个像素的单通道差 1，与重复基线噪声相同 [E16] |
| 构建与开关 | 需验证真实压缩产物 | Hugo 0.156.0 extended：关闭/开启两种生产构建通过；手机/375px 桌面 UA 的开关组合通过 [E17] |

[已核实] 桌面采样包括首页 375/768/1440px、阅读器 375/1440px，以及 1440px 的长文章、搜索、归档、书架和图库，均高 900px、DPR 1。全站原 CSS 的 SHA-256 保持 `ad0b674ad14449d5f4aa166a4b85c6adeeb8560eb88fbe791cb8049a9c7bf12e`。新增播放器规则仍编译在 `html[data-ui="mobile"]` 下。[E13、E16]

### 性能实测

[已核实] Windows / Chrome `156.0.8078.48`，390×844、DPR 1 的移动仿真；同一本实际 `if.epub`（78,523,189 字节），分别使用新的浏览器上下文，按改前→改后顺序测试一次。[E15]

| 指标 | 改前 | 改后 |
|---|---:|---:|
| 分页函数耗时 | 11,179.5ms | 1,108.5ms |
| 导航至内容就绪 | 14,763ms | 4,616ms |
| 分页期间 16ms 定时器执行次数 | 0 | 51 |
| 页数 / 图片数 / 文本字符数 | 1,878 / 205 / 437,273 | 1,878 / 205 / 437,273 |

[已核实] 改前改后文本 SHA-256 同为 `356ae3774b912c9d4519f9af2493caedcd0feb5deebb34267d5e964aa96267f2`。分页耗时在该次测试中约减少 90%；定时器次数证明任务期间让出了事件循环，不等于真实触控延迟或帧率测量。以上不是跨设备或真机性能保证。[E15]

### 失败记录与复查

- [已核实] 初次桌面截图受装饰动画时点和图片加载状态影响。测试现固定动画时点、等待图片解码；长文章曾出现总高度差，等待包括视口外图片在内的解码后，几何/样式与像素均一致。原始失败结果保留，未提高差异阈值或遮掉正文。[E16]
- [已核实] 最终扩展检查的在线 Mermaid 首次在页面 `load` 等待阶段超时；改为等待 DOM 和实际 SVG/Panzoom 就绪后，针对该项重试通过，无未捕获错误。原超时记录保留。[E14]
- [已核实] 两个新增完整构建目录曾耗尽磁盘空间，并导致截图写入失败；只删除本轮失败的 `optimization-final-build/` 与 `optimization-disabled-build/`，随后复用既有 `optimization-after/` 完成两种构建。失败日志保留为 `optimization-build-*-disk-full.log`，磁盘失败截图记录保留在 `optimization-desktop-final/`。[E17]
- [已核实] 分页优化中间版本保留全部章节参与布局，性能回退；最终改为只测量当前页，结果见 E15。中间测量保存在 `optimization-performance-intermediate.json`，不作为最终结果。

### 复跑与待办

本轮移动候选产物为 `.mobile-validation/optimization-after/`，本机预览 `http://127.0.0.1:13135/`；改前产物为 `.mobile-validation/optimization-before/`，对照端口 13134。使用手机 UA 访问才进入移动版。

```powershell
$env:PLAYWRIGHT_MODULE = 'C:/Users/20457/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:SHARP_MODULE = 'C:/Users/20457/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'
node scripts/verify-mobile-optimization.cjs http://127.0.0.1:13135 .mobile-validation/optimization-final-checks
node scripts/verify-mobile.cjs http://127.0.0.1:13135 .mobile-validation/optimization-final-acceptance
node scripts/verify-mobile-extended.cjs http://127.0.0.1:13135 .mobile-validation/optimization-final-extended
node scripts/verify-mobile-desktop.cjs http://127.0.0.1:13134 http://127.0.0.1:13135 .mobile-validation/optimization-desktop-rerun
node scripts/benchmark-mobile-reader.cjs http://127.0.0.1:13134 http://127.0.0.1:13135 .mobile-validation/optimization-performance-rerun.json
```

[未执行] Android/iPhone/iPad 真机、真实系统安全区/键盘/手势、30 分钟背景与能耗、其余桌面浏览器/缩放组合、逐卷特殊内容及线上完整媒体访问，本轮没有补齐；继续保留前文开放前待办。34px 偏移是受控几何夹具，不能替代刘海设备实测。本轮未改媒体地址或发布脚本，未重新执行 CDN 实网验证。P7 生产开放仍未执行。

## 书架入口与顶部背景修正（2026-10-28）

按用户截图的两项要求追加修正：[已核实] 手机/平板入口视频改为同时检查设备识别与移动模式，在视频创建前再次拦截延迟回调；移动书架取消淡入过渡。书架容器去掉继承的顶部内边距（390px 桌面 UA 原为 35px），移动导航与书架之间也不再留空条。全局粒子画布在书架页面隐藏，返回其他页面恢复，顶部和左右留白不再透出星空。[E18]

本次顶部修正也覆盖截图对应的窄桌面三列书架，是用户新要求指定的书架布局调整；前文 E16 的桌面截图结论属于上一轮优化，不代表此次书架截图与旧版逐像素一致。桌面入场视频分支继续保留，生产移动开关仍关闭。

**E18 源码与验证：** `static/js/mobile-mode.js` 的 `__isMobileDevice()`；`layouts/partials/footer/components/script.html` 的 `skipBookshelfIntro()` / `startBookshelfIntro()`；`assets/scss/_novel-bookshelf.scss` 与 `assets/scss/mobile/_bookshelf.scss`。Hugo 0.156.0 extended 压缩构建通过；`.mobile-validation/bookshelf-entry/results.json` 记录 14 个通过场景：iPhone、Android、iPad 仿真的直接打开、刷新、Swup 进入和返回首页，以及 390/1440px 桌面书架顶部。手机三种设备未请求入场视频、没有入场遮罩，书架过渡时长为 0；桌面以已就绪媒体夹具确认入场分支可达。真机测试本次未执行。

截图：`.mobile-validation/bookshelf-entry/iPhone-13.png`、`Pixel-5.png`、`iPad--gen-7-.png`、`desktop-390.png`、`desktop-1440.png`。复跑入口：`.mobile-validation/bookshelf-entry-check.cjs`，对应本地移动候选 `http://127.0.0.1:13135/`。
