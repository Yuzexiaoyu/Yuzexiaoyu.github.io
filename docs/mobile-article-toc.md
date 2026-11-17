# 移动端文章悬浮目录

## 2026-11-17

[已实现] 移动端文章目录移至右下角 44px 高的“目录”悬浮按钮，点击向上展开实色面板。正文开头的目录隐藏；目录支持层级展开、内部滚动、章节跳转后收起、点外部／关闭按钮／Escape 收起。按钮及面板考虑安全区域和可用视口，页面切换时沿用移动端监听器清理流程。桌面目录保持原样。（E170）

[已验证] 390px 页面默认收起、正文无内嵌目录、按钮固定；子目录展开及章节跳转后收起正常，跳转标题位于页头下方。320px 面板未超出视口，Escape 焦点回到按钮，外部点击及关闭按钮可收起，重复初始化没有重复目录。1440px 桌面仍使用侧边目录。生产和本地面板构建、差异检查通过；内置预览已核对展开效果。（E171）

- E170：`assets/ts/mobile.ts` 的 `initMobileToc()`；仅由 `html[data-ui="mobile"]` 引入的 `assets/scss/mobile/_content.scss`。
- E171：`.local/mobile-toc/verification.json`、`preview.jpg` 及实际 Hugo 构建、差异检查输出。

## 2026-11-17：修复目录无法滑动

[已修复] 原来的外层 widget 标记为可滚动，但其 flex 子容器收缩并裁剪内容，外层没有产生滚动范围。改为逐层允许收缩，在 `#TableOfContents` 本身建立唯一的纵向滚动区；标题和关闭按钮不滚动，目录滚动不传递给正文。桌面样式未修改。（E175）

[已验证] 390×844 和 320×568 下用浏览器触摸输入拖动目录，列表分别由 0 滚动至 54px、193px，正文及目录标题位置保持不变。滑动后点击章节仍能跳转并自动收起。生产构建及差异检查通过。（E176）

- E175：`assets/scss/mobile/_content.scss` 中 `.m-toc .widget`、`.widget--toc`、`#TableOfContents` 的 flex 高度与滚动设置。
- E176：`.local/mobile-toc-scroll/verification.json`，实际 `Input.dispatchTouchEvent` 手势与 Hugo 构建、差异检查结果。
