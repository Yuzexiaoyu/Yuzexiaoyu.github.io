# 工坊本地原型实施记录

日期：2026-11-11。原需求见 `plans/3d-print-showroom-plan.md`。本记录补充计划书的实施状态，不将计划阶段的“未执行”记录视为当前状态。

## 已实施范围

| 模块 | 结果与验证范围 | 证据 |
| --- | --- | --- |
| 目录首页 | 两个互斥栏目、搜索、详情入口；按最新要求移除顶部介绍和装饰区 | E20、E24 |
| 商品详情 | 本地 GLB 旋转、缩放控件、整体换色；15%–100% 的滑块与数字输入；整数元报价 | E21、E24 |
| 作品详情 | 图片为主、模型选填，无商品配置和下单操作 | E20、E21、E23 |
| QQ 清单 | 一件商品、颜色、填充、报价和编号；复制成功反馈；二维码未配置时明确显示缺失状态 | E21、E24 |
| 本地后台 | 内容增删改、草稿／上架／下架、图片与模型上传、公共色卡、联系设置 | E22、E23、E24 |
| 持久保存 | SQLite 和本机文件；重新创建 Store 后读取一致；实际浏览器上传并保存草稿后刷新仍可读取 | E22、E23、E24 |
| 仅本机管理 | 固定回环监听、Host 校验、会话及同源写入校验；独立 HTML 不进入 Hugo 发布内容 | E22、E23、E25 |
| 双端样式 | 桌面双栏详情；手机纵向详情、底部固定报价和清单按钮；延续 `data-ui="mobile"` 判定 | E26、E24 |

## 实际执行的检查

[已核实] 后端测试命令：`python -m unittest discover -s services/print-workshop -p test_server.py -v`，16 项全部通过。包括 5 组价格边界的全部 86 个整数填充步长、非法输入、发布条件、数据／素材重开读取、版本冲突、颜色引用、增删改上传、原件不公开、会话／来源校验、本机绑定及端口排他性、独立后台响应、演示种子只初始化一次。（E23）

[已核实] Hugo 0.157.0 本地构建成功：28 个 Pages、146 个 Static files。另构建 `.local/print-workshop/publish-check`，检查 29 个 HTML 文件：不存在 `admin/prints/index.html`，不存在 `data-workshop="admin"` 页面，工坊目录没有 `/admin/prints/` 链接。没有发布或推送。（E25）

[已核实] 已通过 `cmd.exe /d /c ".\启动工坊.cmd"` 实际运行启动脚本，中文输出、构建和服务启动成功；重启后健康接口正常、独立后台返回 200，两条演示内容仍在。验证用服务在交付前停止，日常使用由站主双击启动脚本开启。（E27）

[已核实] 桌面浏览器操作：目录进入详情；GLB 显示并拖动旋转；颜色切换为陶土橘；示例价格 20–100 元时 50% 显示 53 元、100% 显示 100 元；14% 显示错误且禁用清单按钮；生成清单字段正确；复制后显示成功；返回目录可再次进入详情。后台上传 PNG、保存临时草稿、刷新仍可读取。临时草稿在验证后清理。（E24）

[已核实] 手机浏览器模拟：iPhone UA、390 × 844 视口，实际启用 `data-ui="mobile"`；内容纵向排列，未出现横向溢出；50% 与丁香紫选择同步显示，底部按钮显示 53 元。模拟状态会在检查结束时恢复。（E24、E26）

[已核实] 浏览器记录中存在主题的目录缺失提示 `No toc matched query #TableOfContents` 和 Swup 的 `No elements found matching animationSelector body` 警告；本次工坊目录往返与详情重新初始化操作成功。未修改全站主题的目录或动画逻辑。（E24）

[已核实] 复查发现主题在首次解析时可能提前创建 body，造成页面样式标记丢失；工坊加载器现在在初始加载和 Swup 切页时恢复 `template-workshop` 标记。修复后刷新、回到博客再进入工坊均成功；桌面实测滚轮放大和重置视角正常。已移除工坊模板中不需要的博客侧栏。（E20、E24、`layouts/partials/workshop/loader.html`）

## 未完成与后续输入

| 项目 | 当前状态 |
| --- | --- |
| Bambu Studio 真实 3MF 转换与几何兼容性 | 样本待补；只实现原件存储，没有执行自动转换 |
| 实际商品、图片、颜色及价格 | 待站主提供；当前只有明确标注的演示数据 |
| 真实 QQ 二维码扫码及 QQ 客户端识别 | 二维码待补；未验证真实 QQ 扫码 |
| 实体手机 Safari／Chrome 验收 | 尚未执行；当前为桌面浏览器的移动端模拟 |
| 正式部署、托管与顾客远程访问 | 按用户要求后定；当前仅本机原型 |
| 额外分类、批量操作、自动备份、商品复制等 | 第 24 题未确认，未纳入第一版；可手工备份本地数据目录 |

## 证据索引

- E20：`layouts/_default/print-catalog.html`、`layouts/_default/print-detail.html`、`layouts/partials/workshop/header.html`。
- E21：`assets/ts/print-workshop.ts` 的 `catalog`／`detail`／`destroy`；`assets/ts/workshop-shared.ts` 的 `quote`。
- E22：`services/print-workshop/server.py` 的 `Store`、`price`、`Server.server_bind`、`Handler.check_host`、`Handler.check_admin`、`Handler.get`；独立模板 `services/print-workshop/admin.html`。
- E23：`services/print-workshop/test_server.py`；执行日志 `.local/print-workshop/qa/backend-tests.log`，`Ran 16 tests` / `OK`。
- E24：本次 CUA 浏览器可访问性状态、DOM 测量及截图；截图保存在 `.local/print-workshop/qa/`。实际临时草稿名称“界面保存验证（临时）”。
- E25：本次 Hugo 构建与产物检查命令日志，`Pages 28`、`Static files 146`、`Static publication check: 29 HTML files, no admin page or catalog admin link.`。
- E26：`assets/scss/_print-workshop.scss`、`assets/scss/mobile/_print-workshop.scss` 及浏览器计算样式（`display: flex`、固定按钮、移动端属性与无横向溢出）。
- E27：`启动工坊.cmd` 的实际启动输出及重启检查日志：`Launcher restart verified: local API healthy, independent admin 200, two persisted demo entries, no static admin page.`。

## 2026-11-12：工坊跃迁入场与动态背景

[已核实] 从博客进入工坊、直接打开工坊时，桌面和手机都先隐藏页面内容，只保留主页原有的星空画布。背景用 400 毫秒加速，隐藏阶段共 1600 毫秒；随后用 900 毫秒减速，并让导航、目录或详情内容错开浮现。结束后恢复交互。工坊内目录与详情互跳不重复整段入场；开启系统“减少动态效果”时只做短淡入。（E28）

| 覆盖项 | 验证结果 | 证据 |
| --- | --- | --- |
| 桌面背景与入场 | 实际点击博客的工坊入口；隐藏阶段可访问性树只剩画布，内容恢复后画布持续显示 | E28、E30 |
| 手机背景与入场 | iPhone UA、390 × 844 模拟；隐藏阶段 body 子容器 opacity 为 0、visibility 为 hidden，body 为 inert；完成后透明背景、画布可见、inert 解除 | E28、E30 |
| 手机布局 | 模拟视口中可用宽度与 scrollWidth 均为 375，没有横向溢出；截图包含浏览器滚动条占用空间 | E30 |
| 导航与异常恢复 | 自动测试覆盖直接进入、Swup 更换 body、离开取消、内部导航、后台排除、超时、减少动态效果及 pagehide；手机模拟中跃迁时返回主页，最终恢复显示和交互 | E29、E30 |
| 构建与检查 | 本地 Hugo 构建成功；8 项入场测试全部通过；`git -c core.whitespace=cr-at-eol diff --check` 无差异空白错误 | E29 |

[已核实] 本次浏览器记录未出现 error 级别日志。手机模拟完成后已恢复桌面 UA、视口和触摸设置。实体手机测试尚未执行，仍列入上面的后续项目。（E30）

- E28：`assets/ts/workshop-intro.ts` 的 `start`、`tick`、`reveal`、`finish`；`assets/scss/workshop-intro.scss`；`layouts/partials/workshop/intro.html`；`layouts/partials/footer/components/script.html` 的 Swup 钩子；`assets/ts/mobile-background.ts` 的 `__mobileWarp.setSpeed`。
- E29：`node --test services/print-workshop/test_intro.cjs` 实际输出 `tests 8`、`pass 8`、`fail 0`。该测试运行 Hugo 构建产物中的入场脚本，以受控帧时钟验证生命周期；真实绘制另由浏览器检查。
- E30：本次 CUA 可访问性树、DOM 计算样式与浏览器日志；完成态截图 `.local/print-workshop/qa/intro-desktop-complete.png`、`.local/print-workshop/qa/intro-mobile-complete.png`。

## 2026-11-12：部署适配

[已核实] 用户本轮要求部署，取代前面“上线方案后定”的阶段限制。现有远程仓库为 `Yuzexiaoyu/Yuzexiaoyu.github.io`，`master` 推送触发 `.github/workflows/deploy.yml`，目标域名为 `https://yuzexiaoyu.space/`。保留现有发布流程，增加公开工坊数据校验。（E31）

| 覆盖项 | 已执行结果 | 证据 |
| --- | --- | --- |
| 静态发布数据 | 两条已上架演示内容及关联预览素材导出；只包含明确白名单字段 | E32 |
| 本机管理隔离 | 生产构建未包含管理 HTML、SQLite 或 3MF；本地构建使用 `local` 数据源、生产构建使用 `static` | E32、E33 |
| 公开页面功能 | 无 API 的静态 HTTP 服务下，目录、详情、GLB 预览、陶土橘选择、50% 填充显示 53 元、生成完整清单成功；商品地址不再误标为“仅供本机” | E34 |
| 自动检查 | 20 项 Python 测试通过（含原有 16 项及新增 4 项导出测试），8 项入场测试通过；生产和本地 Hugo 构建成功 | E33 |
| 线上状态 | 首次发布 `8a1173c` 的 GitHub Actions 运行成功；线上 `/prints/` 和 `/workshop/catalog.json` 返回 200，`/admin/prints/` 返回 404；后续样式修正沿用同一部署流程 | E35 |
| 手机滚动导航 | 390 × 844 静态浏览器模拟无横向溢出，底部显示 53 元；顶部导航增加局部遮罩与模糊，修复滚动内容透过导航造成的重叠 | E36 |

- E31：`.github/workflows/deploy.yml`；`config/_default/hugo.toml`；本轮 `git ls-remote` 和 GitHub Actions API 返回。
- E32：`services/print-workshop/export_public.py` 的 `export_public`／`verify_snapshot`；`services/print-workshop/test_export.py`；`static/workshop/catalog.json`。
- E33：本轮实际命令 `python -m unittest discover -s services/print-workshop -p 'test_*.py' -v`（`Ran 20 tests` / `OK`）、`node --test services/print-workshop/test_intro.cjs`（`pass 8` / `fail 0`）、Hugo 两套构建及产物隔离检查输出。
- E34：`assets/ts/workshop-public.ts`、`assets/ts/print-workshop.ts` 的静态数据读取与清单；本轮 CUA 可访问性树显示陶土橘、50%、53 元和完整清单，浏览器 error 日志为空。
- E35：`https://github.com/Yuzexiaoyu/Yuzexiaoyu.github.io/actions/runs/43161701332` 返回 `completed` / `success`，提交 `8a1173c42dc78ed13b7cff7f5c51c1ab79770f67`；本轮线上 HTTP 检查输出。
- E36：`assets/scss/mobile/_print-workshop.scss` 的 `.m-header`；实际计算样式 `rgba(0, 0, 0, 0.82)` / `blur(12px)`；截图 `.local/print-workshop/qa/static-mobile-product.png`。

## 2026-11-12：工坊预加载与页面精简

| 本轮需求 | 已执行结果 | 证据 |
| --- | --- | --- |
| 进入前预加载 | 博客阶段提前加载工坊脚本、目录快照、两栏封面及 Swup 页面缓存；桌面和手机实际进入后目录请求仍为一次 | E37、E40 |
| 统一工坊名称 | 桌面品牌及网站导航名称改为“雨泽小鱼的工坊” | E38、E40 |
| 删除工坊搜索 | 移除公开目录的输入框、搜索筛选与清空搜索逻辑；两栏切换正常 | E38、E39、E40 |
| 删除底部横线及下方内容 | 移除整个工坊页脚和对应桌面、手机样式 | E38、E40 |

[已核实] 生产与 `workshop-local` 两套 Hugo 构建均成功。`node --test services/print-workshop/test_preload.cjs` 输出 `tests 6` / `pass 6` / `fail 0`，覆盖后台预载启动、并发去重、两栏复用、取消导航、失败重试及本地数据重新读取。原有 `test_intro.cjs` 输出 `tests 8` / `pass 8` / `fail 0`。`git -c core.whitespace=cr-at-eol diff --check` 通过。（E39）

[已核实] 实际浏览器从博客进入工坊时 `catalogRequests: 1`，`search: 0`、`footer: 0`、`coverReady: true`。手机模拟 `width: 390`、`scrollWidth: 390`。详情及清单生成正常；50% 填充显示 53 元，生成清单时额外请求一次目录以确认最新报价。浏览器 error 日志为空，手机模拟设置已恢复。（E40）

本节记录本地验收结果；用户随后追加“发布”指令，授权将上述改动提交并推送至 `master`，由 `.github/workflows/deploy.yml` 执行部署。实体手机验收尚未执行。

- E37：`layouts/partials/head/custom.html` 的工坊脚本预载；`layouts/partials/workshop/loader.html` 的 `load`；`assets/ts/workshop-public.ts` 的 `loadSnapshot`／`preloadPublicCatalog`／`publicApi`；`layouts/partials/footer/components/script.html` 的 `swup.preload('/prints/')`。
- E38：`content/page/prints/index.md`；`layouts/partials/workshop/header.html`；`layouts/_default/print-catalog.html`；`assets/ts/print-workshop.ts` 的 `catalog`；两套 `_print-workshop.scss`。
- E39：本轮实际构建与命令输出；`services/print-workshop/test_preload.cjs` 和 `services/print-workshop/test_intro.cjs`。
- E40：本轮 CUA 浏览器状态及 CDP 网络计时；`.local/print-workshop/qa/preload-browser.json`、`preload-desktop.png`、`preload-mobile.png`。

## 2026-11-12：修复减少动态效果下工坊背景不加速

[已核实] 线上浏览器的 `prefers-reduced-motion: reduce` 为 `true`。旧版 `tick` 在该分支始终设置速度 5，并将背景保持阶段缩短为零，实际点击记录也只出现速度 5。因此用户进入工坊时看不到加速。（E43）

[已核实] 按本轮明确要求，工坊背景在两种动态偏好下均使用前 400 毫秒加速、页面隐藏共 1600 毫秒、随后 900 毫秒减速的既有流程。减少动态效果仍使内容使用 160 毫秒淡入，省略位移；无需修改系统或浏览器设置。（E43、E44）

| 覆盖项 | 验证结果 | 证据 |
| --- | --- | --- |
| 桌面真实点击 | 减少动态效果开启，速度最小 5、峰值 40、最终 5；结束后 `inert: false` | E45 |
| 手机真实点击 | iPhone UA、390 像素视口、减少动态效果开启；速度 5→40→5；无横向溢出 | E45 |
| 生命周期回归 | 9 项入场测试通过，包含减少动态效果的桌面与手机回归；6 项预加载测试通过；两套 Hugo 构建成功 | E44 |

- E43：`assets/ts/workshop-intro.ts` 的 `tick`／`reveal`；旧版提交 `17bbce9` 的动态偏好条件；本轮线上 CDP 的 `reduced: true` 与速度记录。
- E44：`services/print-workshop/test_intro.cjs`；本轮执行输出 `tests 9` / `pass 9` / `fail 0` 及 `test_preload.cjs` 的 `pass 6` / `fail 0`。
- E45：`.local/print-workshop/qa/warp-reduced-desktop.json`、`warp-reduced-mobile.json`，保存实际点击过程的完整速度采样。浏览器模拟设置已恢复，实体手机验收未执行。
