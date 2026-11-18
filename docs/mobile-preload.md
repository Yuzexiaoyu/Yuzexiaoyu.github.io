# 桌面端与移动端预加载

首页先为头像和第一张文章封面提供图片预载提示，其余卡片图片使用原生懒加载和异步解码。Swup 就绪后，先缓存当前分组的文章 HTML，再缓存同源菜单页面。两端共用两个后台任务槽，翻页时替换等待队列，已发出的 HTML 请求可以供点击导航复用。移动端按 URL 恢复页码后才选择预取分组。（E1）

首页加载完成且浏览器空闲后，工坊脚本与目录才开始预热，每个工坊分类仅预取首张封面。书架封面的预取预算为桌面 8 张、移动 4 张。桌面另预热一个入场视频，进入书架时复用已缓冲的视频元素。省流模式、浏览器报告的 3G 或更慢连接、离线和后台标签页会暂停自动预取。条件恢复后按当前页面重新调度，直接打开工坊仍按需获取脚本和目录。（E1、E2）

## 本地对比

同一份内容、Hugo 0.156.0 生产压缩构建、桌面 Chrome 和 Pixel 7 模拟，屏蔽外部 HTTPS。表中流量为首页 load 后 5 秒内书架封面的响应正文总量。网络档位通过浏览器信号模拟。（E3）

| 冷启动首页 | 优化前 | 优化后 |
| --- | ---: | ---: |
| 桌面书架封面 | 57 张，21.23 MiB | 8 张，1.21 MiB |
| 移动书架封面 | 8 张，1.21 MiB | 4 张，0.73 MiB |
| 桌面／移动图片预载提示 | 7 个 | 2 个 |
| 桌面自动缓存当前组文章 | 0 篇 | 4 篇 |

桌面另进行了三轮点击对照，为文章 HTML 请求固定增加 250 ms 延迟。首页 load 后等待 3.2 秒，直接点击首篇文章，从点击到 Swup 触发 page:view 的中位数从 306 ms 降到 50 ms。该计时不包含后续绘制。（E4）

- E1 对应 `assets/ts/page-preload.ts`、`assets/ts/preload-policy.ts`、`layouts/partials/head/custom.html` 和 `layouts/partials/workshop/loader.html`。
- E2 对应 `scripts/verify-mobile-preload.cjs` 和 `.local/preload-tuning/final/results.json`，包含 Android／iPhone 模拟、分页与刷新、失败重试、弱网与后台恢复、桌面书架视频复用。
- E3 对应 `.local/preload-tuning/before.json`、`.local/preload-tuning/after.json`。
- E4 对应 `.local/preload-tuning/navigation.json`。真机 Safari 和线上 CDN 的耗时待验证。

## 历史基线

以下记录来自上一版移动端预加载的独立验收，保留作前后对照。

[已核实] 移动端补充了文章 HTML、菜单 HTML 和书架首批封面的主动预载；首次进入时与首页入场动画并行。头像、文章封面沿用 head 中原有的预载。（E11、E12）

### 资源与时机

| [已核实] 资源 | 启动时机与范围 | 证据 |
| --- | --- | --- |
| 头像、文章卡片封面 | head 解析到原有 image preload 时启动 | E11 |
| 当前首页分组的文章 HTML | DOM 和 Swup 就绪后立即启动，最多 6 篇；本地翻页后补预载新分组 | E11、E12 |
| 移动菜单 HTML | 与文章共用每批 2 个 worker 的队列；同源、非新窗口链接去重，跳过当前页面 | E11、E12 |
| 书架封面 | 独立 2 个 worker，预载前 8 张，图片 fetch priority 为 low | E11、E12 |
| 工坊 | 保留既有脚本、目录、首图、HTML 预载 | E11 |
| 书架视频、音乐、EPUB | 本次补充预载不引入这些资源 | E11、E12 |

[已核实] 新预载不等待 `window.load`、浏览器 idle 或动画结束。实际初始化顺序中，移动脚本可能先于 Swup 完成页面初始化，因此在 `swupReady = true` 后再调用一次 `initMobilePage()`，使预载在依赖就绪时启动。（E11）

[已核实] Android、iPhone 的 Chrome 模拟中，首个文章 HTML 请求分别在页面开始约 341 ms、71 ms 发出；记录时 `introReady=true`、`introHidden=false`。这些数值来自本地构建，只证明请求与开场并行，不是线上速度基准。（E12）

[已核实] 动画结束不代表全部预载完成。头像响应人为延迟 4000 ms 的场景中，文章预载已启动且完成，页面仍处于 interactive，头像未完成，动画遮罩尚未收起。（E12）

### 缓存与生命周期

[已核实] 页面 HTML 通过 `swup.preload()` 写入 Swup 自身缓存。Android、iPhone 模拟中，预载后 tap 第一篇文章，HTML 与封面请求均保持各 1 次。新预载只取 HTML，不执行缓存文章中的脚本，也不预先绘制正文图表。（E11、E12）

[已核实] 同一 body、同一文章分组重复初始化不会重复调度；切页会使旧队列停止启动后续任务。已发出的 Swup 请求可以完成并填充缓存；返回首页时继续预载缺失条目。书架封面 Promise 跨页面复用，加载失败会从预载记录移除。（E11、E12）

[已核实] 当前 Swup 版本可能缓存部分非 500 错误响应；新主动预载发现响应缺少站点的 `main.main` 容器时移除该缓存。故障注入的 503 页面未保留在缓存，返回首页后重新请求成功。（E11、E12）

### 验证覆盖

| 检查 | [已核实] 结果 | 证据 |
| --- | --- | --- |
| Hugo 生产压缩构建 | `--environment production --minify` 构建成功，28 页面 | E12 |
| Android／iPhone 开场并行预载 | 两组通过；6 篇文章、4 个菜单目标已缓存，前 8 张书架封面已请求 | E12 |
| 文章导航与重复初始化 | 两组通过；HTML／封面各 1 次，正文可读，重复初始化不重复请求 | E12 |
| 无开场刷新 | 两组通过；sessionStorage 已标记时跳过开场，预载仍启动 | E12 |
| 本地分页 | 通过；把现有 6 篇真实文章分为 2 组，切换后补载第 2 组 | E12 |
| 头像延迟 | 通过；预载早于 load 与开场结束 | E12 |
| 切页与失败重试 | 通过；离开后只保留已发出的 2 个文章请求，失败条目返回时重试 | E12 |
| 桌面回归 | 通过；不主动预载文章 HTML，原有 57 封面预载链正常启动 | E12 |
| 既有入场动画检查 | 7 组通过，覆盖 5 种尺寸、35 个颜色阶段比较 | E13 |
| 差异空白 | `git -c core.whitespace=cr-at-eol diff --check` 通过 | E13 |

[已核实] 原入场动画脚本在修改前构建和修改后构建上，都于 `verify-mobile-intro.cjs:128` 的刷新重播断言失败：当前产品已按标签页记忆开场播放状态。脚本现仅在“刻意重播以检查最后一帧”的步骤前清除该 sessionStorage 标记；正常刷新跳过开场仍由新增预载检查验证。（E13）

[未验证] 物理 Android、iPhone／Safari、线上 CDN 和真实弱网未执行；本轮浏览器为 Chrome，外部 HTTPS 请求被阻断。最终专项检查 6 组通过，所有记录的 pageerror 为空。（E12）

### 证据

- E11：`assets/ts/mobile-preload.ts` 的 `preloadMobilePage`、`warmCover`、`stopMobilePreload`；`assets/ts/mobile.ts` 的 `markCurrent`／`initMobilePage`／`destroyMobilePage`；`layouts/partials/footer/components/script.html` 的 `swupReady = true`；`layouts/partials/head/custom.html:164`。
- E12：`scripts/verify-mobile-preload.cjs`；`.local/mobile-preload-2026-11-18/final-checks/results.json`；实际 Hugo 生产压缩构建输出。
- E13：`scripts/verify-mobile-intro.cjs`；`.local/mobile-preload-2026-11-18/intro-final/results.json`；修改前构建的实际执行输出，以及本轮差异检查输出。
