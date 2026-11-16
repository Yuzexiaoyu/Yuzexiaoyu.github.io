# 移动小说界面：阅读器与书架

## 2026-11-16

[已实现] 手机阅读区改为跟手左右翻页：拖动时连续移动原有页面，松手后按距离／速度翻一页或回弹；支持慢滑、反向、取消与首尾阻尼。保留长按选字、缩放、垂直阅读超长内容、内链和浏览器边缘返回。设置／目录打开以及重新分页时不接收翻页手势，离开阅读器时清理监听和动画；旧版页面脚本缓存保留基础滑动回退。（E149）

[已实现] 手机顶部使用固定网格划分书架、卷切换、阅读设置和目录，按钮改为无边框图标，卷名称可截断；设置弹层为实色背景，主题与字号／行距分行对齐，支持点击外部或 Escape 关闭。入口结构及样式均限制在移动模式，桌面工具栏保留原样。（E149）

[已验证] Chromium 真实触摸检查覆盖超过原 650ms 限制的慢滑、逐点跟手、正反翻页、短滑／取消回弹、边界阻尼、纵向触摸及打开设置／目录时不翻页。320／390px 下按钮无交叠与横向溢出，变更视口后的整卷文本 SHA-256 不变。另以 Firefox 160 Gecko 引擎及安卓 UA 核对两种宽度的工具栏排版；桌面入口未出现移动按钮，仍使用原工具栏。设置弹层在 320px 下完整容纳两个并排控制。两套构建通过。（E150）

- E149：`assets/ts/mobile-reader-swipe.ts`、`assets/ts/mobile-reader.ts` 的 `bindSwipe`；`layouts/_default/novel-reader.html` 的移动输入绑定和顶部按钮；`assets/scss/mobile/_reader.scss`。
- E150：`.local/reader-swipe/check.cjs`、`results.json`、`firefox-check.py`、`firefox-results.json`、`panel.json`、`preview.jpg`。

## 2026-11-16：设置直选与移除底部翻页按钮

[已修复] 原设置面板的字号／行距下拉展开后，会把同一行的其他控件一起拉高。手机改为主题、字号、行距三行固定布局，字号和行距三个选项始终可见；当前选项高亮并同步 `aria-pressed`，返回首页为单独的 40px 行。移除手机页脚的上一页／下一页按钮及事件，仅保留居中页码，继续使用滑动翻页。（E152）

[已验证] 320／390px 下六个选项同时可见、均为 40px 高，无横向溢出；选择大字号和宽松行距后面板高度不变，实际等待重新分页结束后，真实触摸仍能翻到下一页。页脚按钮数量为零，零脚本错误；桌面仍显示原字号下拉入口。内置预览已展示新的设置布局。（E153）

- E152：`layouts/_default/novel-reader.html` 的手机设置分组、选中语义、页码标记与清理逻辑；`assets/scss/mobile/_reader.scss` 的直选行和页脚样式。
- E153：`.local/reader-settings/check.cjs`、`results.json`、`settings-320.jpg`、`settings-390.jpg`、`preview.jpg`。

## 2026-11-16：手机书架四列

[已实现] 隐藏手机书架标题区左上角的返回按钮，所有手机宽度统一每行四卷，缩小横向间距；桌面样式及返回入口保持原样。（E155）

[已验证] 320／390px 下首行均为四卷，无横向溢出，手机返回按钮隐藏、桌面仍可见。两套构建与差异检查通过；内置预览已刷新。（E156）

- E155：`assets/scss/mobile/_bookshelf.scss`。
- E156：`.local/bookshelf-four/verification.json`、`preview.jpg`。

## 2026-11-16：收紧书架标题并移除设置首页入口

[已实现] 手机书架标题改为左对齐的 20px 常规文字，取消蓝色渐变与背景光晕，隐藏英文副标题，保留简短的作者／卷数信息，收紧分类与封面的间距。阅读设置不再放置返回首页链接；原主页入口仍在手机阅读器清理时复原，桌面代码路径不受影响。（E158）

[已验证] 320／390px 下书架标题区均为 94px 高、无横向溢出，仍一行四卷；设置中链接数量为零，六个阅读选项保留。桌面英文副标题和阅读器首页按钮仍可见。两套构建通过，内置预览已核对书架和完整设置面板。（E159）

- E158：`assets/scss/mobile/_bookshelf.scss`、`assets/scss/mobile/_reader.scss`、`layouts/_default/novel-reader.html` 的手机首页入口处理。
- E159：`.local/bookshelf-compact/verification.json`、`preview.jpg`、`settings.jpg`。
