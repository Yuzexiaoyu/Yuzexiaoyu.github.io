# 移动小说阅读器：交互与顶部栏

## 2026-11-16

[已实现] 手机阅读区改为跟手左右翻页：拖动时连续移动原有页面，松手后按距离／速度翻一页或回弹；支持慢滑、反向、取消与首尾阻尼。保留长按选字、缩放、垂直阅读超长内容、内链和浏览器边缘返回。设置／目录打开以及重新分页时不接收翻页手势，离开阅读器时清理监听和动画；旧版页面脚本缓存保留基础滑动回退。（E149）

[已实现] 手机顶部使用固定网格划分书架、卷切换、阅读设置和目录，按钮改为无边框图标，卷名称可截断；设置弹层为实色背景，主题与字号／行距分行对齐，支持点击外部或 Escape 关闭。入口结构及样式均限制在移动模式，桌面工具栏保留原样。（E149）

[已验证] Chromium 真实触摸检查覆盖超过原 650ms 限制的慢滑、逐点跟手、正反翻页、短滑／取消回弹、边界阻尼、纵向触摸及打开设置／目录时不翻页。320／390px 下按钮无交叠与横向溢出，变更视口后的整卷文本 SHA-256 不变。另以 Firefox 160 Gecko 引擎及安卓 UA 核对两种宽度的工具栏排版；桌面入口未出现移动按钮，仍使用原工具栏。设置弹层在 320px 下完整容纳两个并排控制。两套构建通过。（E150）

- E149：`assets/ts/mobile-reader-swipe.ts`、`assets/ts/mobile-reader.ts` 的 `bindSwipe`；`layouts/_default/novel-reader.html` 的移动输入绑定和顶部按钮；`assets/scss/mobile/_reader.scss`。
- E150：`.local/reader-swipe/check.cjs`、`results.json`、`firefox-check.py`、`firefox-results.json`、`panel.json`、`preview.jpg`。
