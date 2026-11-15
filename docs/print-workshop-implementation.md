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

## 2026-11-14：精简工坊、连续入场与可选／现货语义修正

[已验证] 删除目录首屏宣传区、右侧宣传语、工具栏标语、卡片英文标签，以及详情页的英文标语和缩略图提示。工坊直接从栏目及物品列表开始；现有两件条目使用普通展示和选购流程，已移除演示标记、演示说明及 SVG 封面水印。（E46、E48）

[已验证] 入场改为 240 毫秒加速、620 毫秒减速，峰值 32，首尾速度 5，没有高速停留。速度按独立时钟恢复，页面加载延迟不会延长高速阶段，内容到达也不会再次加速。内容淡入只施加一次透明度，内部元素仅做小幅位移。工坊内切页不再触发全站旧版加速。（E47、E50）

[已验证] 栏目含义统一为：`work` 对应“可选”，提供颜色、15%～100% 填充及线性报价；`product` 对应“现货”，使用固定售价 `fixed_price` 和固定重量 `weight_g`，不提供配置选项。后台保存会清除另一类型的报价字段，现货上架需填写售价与重量，可选上架需勾选颜色；两类均可不上传模型。公开快照和本地接口采用相同报价规则，现货忽略颜色／填充参数，价格保持固定。（E49、E50）

[已验证] 当前“扭纹花器”现货售价 39 元、重量 120 克，数值由用户授权自行设定；“形态练习 · 光与纹理”为可选，保留六种颜色及 20～100 元的配置价格范围。变更保留原条目 ID，先备份本地数据库，再通过正常保存接口写入并重新导出公开目录。（E48）

[已验证] 详情媒体及缩略图按视频、图片、模型排序，有视频时默认视频，否则默认图片。3D 查看器及模型在点击后加载；离开视频视图会暂停播放。现货详情右侧展示名称、介绍、固定售价、重量及联系购买；可选详情展示名称、介绍和制作配置。生成清单时重新确认最新条目数据，两类清单分别包含配置或固定重量信息。（E49、E50）

| 覆盖项 | 本轮验证 | 证据 |
| --- | --- | --- |
| 宣传文案、演示标记与封面 | 桌面／手机目录和详情检查无对应文案；公开导出通过素材哈希验证 | E46、E48、E50 |
| 入场与导航 | 桌面／手机各两种动态偏好实际点击；入场约 863～880 毫秒结束；慢导航已恢复速度 5 后才到达内容；内部切页不加速 | E47、E50 |
| 可选配置 | 浏览器验证颜色、填充边界、50% 报价 53 元、3D 换色及清单；本地 HTTP 报价与持久化测试通过 | E49、E50 |
| 现货 | 浏览器验证 39 元／120 克、无配置控件、清单不含颜色与填充；本地 HTTP 验证附带配置参数也不改变价格 | E49、E50 |
| 媒体排序 | 两种设备、两个栏目均验证视频优先、缩略图排序、暂停播放、图片切换；现货视频场景不含模型也正常 | E49、E50 |
| 后台编辑器 | 5 组浏览器检查：可选字段、现货字段、上架必填、已有售价重量、已有配置色卡；仅检查编辑器，不写入实际条目 | E49、E50 |
| 构建与回归 | 生产及本地 Hugo 构建成功；24 项 Python、19 项 Node 测试通过；11 组公开页面浏览器场景通过，页面脚本错误为空；差异空白检查通过 | E50 |
| 内置预览 | 已启动 `http://127.0.0.1:13136/prints/` 并保留用户浏览器标签；后台预览运行于 `http://127.0.0.1:13135/admin/prints/` | E50 |

- E46：`layouts/_default/print-catalog.html`、`layouts/_default/print-detail.html`、`assets/ts/print-workshop.ts` 的 `catalog`／`detail`、桌面与手机 `_print-workshop.scss`。
- E47：`assets/ts/workshop-intro.ts` 的 `ease`／`tick`／`reveal`；`layouts/partials/footer/components/script.html` 的 `visit:start`；`services/print-workshop/test_intro.cjs`。
- E48：`services/print-workshop/demo.py` 的 `poster`／`seed`；`static/workshop/catalog.json`；`.local/print-workshop/qa/starter-promotion.json`、`category-correction.json`。数据库备份为同目录 `before-starter-promotion.sqlite3` 和 `before-category-correction.sqlite3`。
- E49：`assets/ts/print-workshop.ts` 的 `detail`／`selectView`；`assets/ts/workshop-public.ts` 的 `publicApi`；`assets/ts/print-admin.ts` 的 `editorType`；`services/print-workshop/admin.html`；`server.py` 的 `Store.save_entry`／`Handler.get`；`export_public.py` 的 `ENTRY_FIELDS`。
- E50：实际执行 `python -m unittest discover -s services/print-workshop -p 'test_*.py' -v`（24 项通过）、`node --test services/print-workshop/test_intro.cjs services/print-workshop/test_preload.cjs`（19 项通过）、`scripts/verify-workshop.cjs`（11 组通过）；`.local/print-workshop/qa/cleanup/results.json`、`admin-results.json` 及 `desktop-product.png`／`mobile-work.png` 等截图。视频场景使用测试浏览器拦截的 WebM 素材，不写入实际工坊数据。

未覆盖／待办：实体手机验收、真实物品的视频与图片替换。本轮未提交 Git 或执行线上部署；保留已有 `.workbuddy/` 内容。

## 2026-11-14：移除卡片装饰、收紧现货信息

[已验证] 两个栏目均移除卡片封面上的跳转箭头和媒体标签。现货说明删除“这件为现货，按展示的成品直接售卖。”，同步更新初始化内容、本地条目及公开快照。详情页售价与重量改成一行 `¥39 · 120 g`，取消双列标题和大号数字。（E51）

| 覆盖项 | 本轮验证 | 证据 |
| --- | --- | --- |
| 两栏卡片 | 桌面及手机的可选、现货卡片均无箭头或媒体覆盖标签 | E52 |
| 现货详情与数据 | 桌面及手机均无指定说明；紧凑信息行高约 26.4 像素，价格字号 16 像素；固定报价仍为 39 元、重量 120 克 | E51、E52 |
| 构建与预加载 | 两套 Hugo 构建成功，6 项预加载回归通过，公开快照完整性及差异空白检查通过 | E52 |

- E51：`assets/ts/print-workshop.ts` 的 `catalog`／`detail`；两套 `_print-workshop.scss`；`services/print-workshop/demo.py` 的 `DESCRIPTIONS`；`static/workshop/catalog.json`；`.local/print-workshop/qa/card-cleanup-data.json`。
- E52：`.local/print-workshop/qa/cleanup/card-simplification-results.json`（6 组通过），同目录 `desktop-product-clean-card.png`、`desktop-stock-compact.png` 等截图；实际 `test_preload.cjs` 执行输出 6 项通过。

本轮仅更新本地预览；未执行线上部署。实体手机检查仍待验收。

## 2026-11-14：可选重量、无框图片及多图切换

[已验证] 可选条目增加 `min_weight_g`（15%）与 `max_weight_g`（100%）。详情和后台面板按 `W15 + (W100 - W15) × (填充百分数 - 15) / 85` 计算中间重量，结果四舍五入到 0.01 克，显示时省略末尾零。本地接口、公开快照及清单使用相同规则。重量未提供时显示破折号，已上架条目不接受只填写一端、倒置端点、非正数或超过两位小数的重量；草稿可暂存一端。切换为现货后清除两端重量，继续使用现货固定重量。（E53、E55）

[已验证] 详情图片移除外层边框、底板、圆角与固定比例容器，按图片原始比例显示。现有可选条目新增第二张配色图；缩略图支持切换、选中高亮与 `aria-pressed` 状态。视频优先、离开视频暂停及 3D 按需加载流程保持正常。（E54、E56）

[已验证] 实际预览条目使用临时端点 60 克／180 克，50% 填充显示 109.41 克。数据变更前保存 `.local/print-workshop/qa/before-configurable-weight.sqlite3`，条目 ID 保持不变。两张图分别使用现有暖色及绿色 SVG 素材。后台保存测试使用独立的 `qa/weight-admin-data` 数据库，未修改实际条目的临时端点；测试服务已停止。（E55、E56）

| 覆盖项 | 本轮验证 | 证据 |
| --- | --- | --- |
| 重量算法与字段 | 两端值、50% 值、所有 86 个整数填充档位、非法输入、持久化、类型切换及导出通过 Python 测试 | E53、E55、E56 |
| 详情与清单 | 桌面和手机逐档核对 15%～100% 重量，50% 的页面和清单均显示 109.41 克 | E56 |
| 多图与图片样式 | 两张实际图片切换、缩略图选中状态、透明背景及零边框／圆角检查通过；视频与模型回归通过 | E54、E56 |
| 后台面板 | 独立数据库验证输入端点、实时预览、保存、重新打开、接口报价和切换现货后的清理，共 6 组通过 | E56 |
| 构建与回归 | 两套 Hugo 构建成功；30 项 Python、19 项 Node 测试通过；11 组公开浏览器场景及 6 组后台场景通过，脚本错误为空；导出和差异空白检查通过 | E56 |

- E53：`assets/ts/workshop-shared.ts` 的 `weightAt`／`grams`；`workshop-public.ts` 的 `publicApi`；`print-workshop.ts` 的 `update`／清单事件；`services/print-workshop/server.py` 的 `weight_endpoint`／`weight_at`／`Store.save_entry`／`Handler.get`。
- E54：两套 `_print-workshop.scss`；`assets/ts/print-workshop.ts` 的 `selectView`／缩略图事件；`services/print-workshop/demo.py` 的 `seed`；`static/workshop/catalog.json` 的可选条目图片顺序。
- E55：`assets/ts/print-admin.ts` 的 `samplePrice`／编辑表单事件；`services/print-workshop/admin.html` 的两端重量输入；`export_public.py` 的 `ENTRY_FIELDS`；`.local/print-workshop/qa/configurable-weight-data.json`。
- E56：实际 `unittest`、`test_intro.cjs`、`test_preload.cjs`、`scripts/verify-workshop.cjs` 执行结果；`.local/print-workshop/qa/cleanup/results.json`、`weight-admin-results.json`、`desktop-work.png`、`mobile-work.png`、`admin-weight-panel.png`。

待补：用户提供的实际重量端点、真实物品图片与视频、实体手机验收。本轮更新本地预览，未执行线上部署。

## 2026-11-14：标题与介绍、滑块及详情小字精简

[已验证] 可选详情移除填充数字输入框，仅通过滑块调整 15%～100% 填充。当前百分比改为无框只读文本，并同步滑块无障碍值、地址参数、报价、重量和选购清单。移除两端“15% · 轻盈”“100% · 充实”提示及颜色／填充／数量摘要；清单仍包含实际购买配置。（E57、E59）

[已验证] 后台字段、占位提示及校验文案统一为“标题”“介绍”，搜索提示改为“搜索标题”。现有两件临时条目的内容和首次初始化内容均使用“标题”“介绍”；详情继续读取各自数据字段。写入前备份数据库，条目 ID、素材、栏目、价格及重量均保持原值，重新导出两件公开条目。（E58、E59）

| 覆盖项 | 本轮验证 | 证据 |
| --- | --- | --- |
| 桌面与手机模拟 | 无数字输入框、两端提示及配置摘要；滑块键盘操作可到两端且不会越界；逐档核对 86 个百分比、无障碍值、地址参数和重量；清单、颜色、多图与模型流程通过 | E57、E59 |
| 两件条目与后台 | 两类编辑表单均显示“标题”“介绍”及对应内容；本地实时接口详情 75% 显示 144.71 克 | E58、E59 |
| 构建与回归 | 两套 Hugo 构建成功，11 组公开浏览器场景、3 组本地后台／实时详情检查、6 项预加载测试通过；浏览器脚本错误为空；公开快照及差异空白检查通过 | E59 |
| 内置浏览器 | 已显示修改后的详情，75% 对应报价 76 元、重量 144.71 克，截图留存 | E59 |

- E57：`assets/ts/print-workshop.ts` 的 `detail`／`update`／清单事件；`assets/scss/_print-workshop.scss` 的 `.wk-infill-value`、`.wk-price-box`；移动样式中删除原数字框规则。
- E58：`services/print-workshop/admin.html`；`server.py` 的 `Store.save_entry`；`demo.py` 的 `DESCRIPTIONS`／`seed`；`static/workshop/catalog.json`；`.local/print-workshop/qa/title-intro-data.json` 及 `before-title-intro.sqlite3`。
- E59：实际两套 Hugo 构建、`test_preload.cjs`、`scripts/verify-workshop.cjs`、公开导出检查及差异空白检查；`.local/print-workshop/qa/slider-only/results.json`、`admin-results.json`、`desktop-work.png`、`mobile-work.png`、`admin-title-intro.png`、`in-app-preview.png`。

待补：实际物品资料、重量端点及实体手机验收。本轮未执行线上部署。

## 2026-11-14：具体物品文案、统一媒体展示区及测试视频

[已验证] 两件现有条目分别填写为可选“扭纹花器”、现货“青绿扭纹花器”，介绍改为对应外形及干花／桌面摆放用途。后台字段继续使用“标题”“介绍”，详情读取条目内容。首次初始化文案同步更新。实际数据库写入前备份，原 ID、栏目、图片、模型、颜色、价格及重量保持不变。（E60）

[已验证] 将现有 1 秒、320×240、VP9 编码的 WebM 测试画面保存为普通视频素材，两件条目共用该素材；文件大小 39,420 字节，SHA-256 为 `42c978c7e160e57e513c0e0286ae237f400c550ff7e4067825993ca86f4cfe80`。公开快照已包含实际视频引用，可直接播放测试，默认顺序继续为视频、图片、模型；视频可在后台移除或替换。（E60、E62）

[已验证] `.wk-stage` 使用响应式正方形，三类媒体绝对定位并填满同一展示区。图片及视频使用 `object-fit: contain` 完整缩放，3D 查看器使用相同宽高；切换媒体或图片时不改变展示区及工具栏位置。桌面测试宽度 1440、手机模拟宽度 390；帧尺寸及切换结果记录于浏览器结果。（E61、E62）

| 覆盖项 | 本轮验证 | 证据 |
| --- | --- | --- |
| 条目文案与视频 | 两件条目均有具体标题和介绍；本地接口及静态快照可读取视频，四次 HTTP 检查均验证 MIME、文件长度及哈希 | E60、E62 |
| 统一展示区 | 桌面、手机模拟均核对视频、两张图片及加载后的模型元素宽高；工具栏位置差小于 0.1 像素，图片和视频采用完整缩放 | E61、E62 |
| 媒体与业务回归 | 12 组浏览器场景通过，覆盖实际视频播放／切走暂停、多视频、多图、模型按需加载、无视频时默认图片、报价、重量、清单与入场动画；脚本错误为空 | E62 |
| 构建与公开快照 | 两套 Hugo 构建、6 项预加载测试、公开快照完整性及差异空白检查通过 | E62 |
| 内置浏览器 | 刷新当前现货详情，已显示具体标题、介绍及视频／图片／模型入口；当前模型视图截图留存 | E62 |

- E60：`services/print-workshop/demo.py` 的 `TITLES`／`DESCRIPTIONS`／`seed`；`static/workshop/catalog.json`；`static/workshop/media/42c978c7e160e57e513c0e0286ae237f400c550ff7e4067825993ca86f4cfe80.webm`；`.local/print-workshop/qa/unified-gallery-data.json`、`before-unified-gallery.sqlite3`；实际 `ffprobe` 元数据输出。
- E61：`assets/scss/_print-workshop.scss` 的 `.wk-stage`、`.wk-stage-image`、`.wk-stage-video` 及 `model-viewer` 规则；`scripts/verify-workshop.cjs` 的 `galleryFrame`／`sameFrames`。
- E62：实际两套 Hugo 构建、`test_preload.cjs`、`scripts/verify-workshop.cjs`、公开导出检查及差异空白检查；`.local/print-workshop/qa/unified-gallery/results.json`、`live-media-results.json`、`desktop-work-video.png`、`desktop-work-model.png`、`mobile-work-model.png`、`in-app-preview.png`。

待补：实际物品图片与视频、重量端点及实体手机验收。当前为本地预览，未执行线上部署。

## 2026-11-14：合并媒体按钮、移除缩略图

[已验证] 详情移除整行图片／视频缩略图及相应样式、事件，所有媒体直接排列在原切换按钮组中。顺序为全部视频、全部图片、模型。单个媒体显示“视频”或“图片”，多个同类媒体按“视频1、视频2”“图片1、图片2”编号；每次只有当前媒体按钮高亮并设置 `aria-pressed=true`。按钮在窄屏自动换行，保持全部入口可见。（E63、E64）

[已验证] 每个按钮直接定位对应媒体，不再先选择媒体类型再选缩略图。切走视频后暂停，切换不同视频更新地址，点击同一视频按钮保留当前进度。模型仍在首次选择时加载，图片、视频和模型继续共用相同尺寸的展示区。（E63、E64）

| 覆盖项 | 本轮验证 | 证据 |
| --- | --- | --- |
| 实际条目与媒体切换 | 桌面及手机模拟检查可选／现货无缩略图；两张实际图片通过编号按钮切换；尺寸、模型、颜色、重量、报价及清单回归通过 | E64 |
| 多视频与编号 | 两类条目在桌面及手机模拟中验证视频1／视频2、图片1／图片2的顺序、地址、唯一选中状态及切走视频暂停 | E64 |
| 最大媒体数量 | 手机模拟展示 6 个视频、12 张图片、1 个模型，共 19 个按钮，自动换行且无横向溢出，最后一个视频及图片可直接选择 | E64 |
| 构建与回归 | 两套 Hugo 构建成功；13 组浏览器场景、6 项预加载测试通过；浏览器脚本错误为空；差异空白检查通过 | E64 |
| 内置预览 | 已显示“视频、图片1、图片2、3D 预览”按钮，无下方缩略图，截图留存 | E64 |

- E63：`assets/ts/print-workshop.ts` 的 `detail`／`selectView`／媒体按钮事件；`assets/scss/_print-workshop.scss` 的 `.wk-gallery-tools`、`.wk-view-switch`；移动样式删除缩略图尺寸规则；`services/print-workshop/README.md`。
- E64：实际两套 Hugo 构建、`test_preload.cjs`、`scripts/verify-workshop.cjs`、差异空白检查；`.local/print-workshop/qa/media-buttons/results.json`、`desktop-work.png`、`mobile-work.png`、`mobile-all-media-buttons.png`、`in-app-preview.png`。

待补：实体手机验收。本轮更新本地预览，未执行线上部署。

## 2026-11-14：进入详情自动播放视频

[已验证] 有视频时，进入详情页默认选择第一个视频并静音自动播放，使用 `autoplay muted playsinline`、自动预加载及初始化播放请求。保留原生控件，可手动开启声音、暂停或重播。播放请求被浏览器拒绝或被导航／媒体切换中断时，捕获 Promise 拒绝，继续保留控件。无视频时默认图片。（E65、E66）

| 覆盖项 | 本轮验证 | 证据 |
| --- | --- | --- |
| 自动播放 | 桌面、手机模拟中，两种栏目通过列表进入及直接打开详情均记录到未由测试启动播放前的非零播放时间；静音、内联及播放控件状态均正确，共 8 次自动播放检查 | E66 |
| 加载与切换 | 两种视口均延迟视频响应，加载前切到图片后，视频保持隐藏、暂停、时间为零；已播放视频切走后暂停，无视频条目仍默认图片 | E66 |
| 构建与回归 | 两套 Hugo 构建成功；15 组浏览器场景、6 项预加载测试通过，浏览器脚本错误为空；差异空白检查通过 | E66 |
| 预览 | 内置浏览器已刷新；自动播放画面及当前内置页面截图留存 | E66 |

- E65：`assets/ts/print-workshop.ts` 的视频元素、`selectView` 后的初始化播放请求；`services/print-workshop/README.md`。
- E66：`scripts/verify-workshop.cjs` 的 `automaticVideoState` 与延迟视频响应场景；实际两套 Hugo 构建、`test_preload.cjs`、浏览器回归及差异空白检查；`.local/print-workshop/qa/autoplay/results.json`、`desktop-work-video.png`、`mobile-work-video.png`、`in-app-preview.png`。

待补：实体手机验收。本轮更新本地预览，未执行线上部署。

## 2026-11-14：工坊小字与材质关联

[已验证] 工坊的栏目数量、卡片重量、返回导航、媒体按钮、配置标签、报价说明及重量等辅助信息从原先部分 9～12px 调整至 13～14px，介绍为 15px，并调亮灰绿色文字。修改均限定在 `body.template-workshop` 下，手机样式也保留工坊作用域。其余 27 个 SCSS 文件哈希不变；首页及归档在桌面／手机共 4 组字号、颜色、行高及字重快照与修改前一致。（E67、E69）

[已验证] 色卡新增材质字段，后台新增／编辑色卡时填写；可选详情随当前颜色更新材质。现货的材质在物品编辑器内单独填写并持久保存，切为可选时清除独立值。详情、实时接口、静态报价及选购清单均使用对应来源。材质最多 80 字，旧数据空值兼容；旧版颜色表自动增加材质列，旧调用未传材质时保留已有色卡材质。（E68、E69）

[已验证] 实际数据库变更前保存 `before-material.sqlite3`，现有六个示例颜色及现货暂填 PLA，保留物品 ID、媒体、价格及重量，导出两件公开物品。后台手机页接入已有设备判断脚本，启用工坊手机样式，新增材质输入字号 16px，无横向溢出。后台写入验证使用独立测试数据库，当前真实本地数据仍为 PLA，测试服务已停止。（E68、E69）

| 覆盖项 | 本轮验证 | 证据 |
| --- | --- | --- |
| 工坊字体及作用域 | 1440、390、320 像素宽度的两栏目录和两类详情，共 12 组检查；辅助文字至少 13px，媒体按钮无横向溢出；其他页面 4 组样式快照不变 | E67、E69 |
| 材质与数据兼容 | 旧颜色表升级、材质保存／清除／校验、颜色改变后可选材质更新、现货独立材质、类型切换和公开导出通过后端测试 | E68、E69 |
| 前台与清单 | 15 组浏览器场景通过，包含桌面／手机 PLA→PETG 切换与清单、现货 TPU 独立值、自动播放及原有媒体和报价回归，脚本错误为空 | E69 |
| 后台面板 | 6 组独立数据库写入及重新打开验证通过；另 1 组实际后台手机只读检查通过，390px 页面无溢出，材质输入为 16px | E69 |
| 构建与回归 | 两套 Hugo 构建成功；34 项 Python、19 项 Node 测试通过；公开快照及差异空白检查通过 | E69 |
| 内置预览 | 已刷新详情，当前可选材质为 PLA，小字及媒体按钮可见，截图留存 | E69 |

- E67：`assets/scss/_print-workshop.scss` 与 `assets/scss/mobile/_print-workshop.scss`；`.local/print-workshop/qa/readability/styles-before.json`、`style-scope-results.json`、`other-pages-before.json`、`results.json`、`1440-work-detail.png`、`390-work-detail.png`。
- E68：`services/print-workshop/server.py` 的颜色表升级、`Store.save_color`／`Store.save_entry`／报价接口；`export_public.py` 的 `ENTRY_FIELDS`；`admin.html`；`demo.py`；`assets/ts/workshop-shared.ts`、`workshop-public.ts`、`print-admin.ts`、`print-workshop.ts`；`static/workshop/catalog.json`；`.local/print-workshop/qa/material-data.json`、`before-material.sqlite3`。
- E69：实际 Python、Node、Hugo、公开快照与差异检查输出；`services/print-workshop/test_server.py`／`test_export.py`、`scripts/verify-workshop.cjs`；`.local/print-workshop/qa/material/results.json`、`admin-results.json`、`admin-colors.png`、`admin-stock.png`、`admin-colors-mobile.png`、`in-app-preview.png`；`.local/print-workshop/qa/verify-material-ui.cjs`、`check-workshop-readability.cjs`。

待补：实际物品材质、图片、视频、重量端点及实体手机验收。本轮未执行线上部署。

## 2026-11-14：左右配置文字亮度一致

[已验证] 工坊详情的颜色名、材质与填充百分比统一使用与左侧标签相同的 `#d3e0d7`、500 字重；颜色名同时与标签保持 14px。重量使用与左侧报价相同的 `#c7e7d3`、500 字重。修改限定在工坊样式内。（E70）

[已验证] 桌面 1440px、手机模拟 390px 分别核对四组左右文字的计算颜色与字重，全部一致且无横向溢出；两套 Hugo 构建及差异空白检查通过。内置预览已刷新。（E71）

- E70：`assets/scss/_print-workshop.scss` 的 `.wk-label-row > span`、`.wk-material`、`.wk-infill-value`、`.wk-unit`。
- E71：实际两套 Hugo 构建、浏览器计算样式核对及差异空白检查；`.local/print-workshop/qa/label-brightness/results.json`、`desktop.png`、`mobile.png`、`in-app-preview.png`。

## 2026-11-14：统一配置区实际字体及明度

[已验证] 进一步检查实际渲染字体：原中文使用 MicrosoftYaHei，PLA、百分比等使用 SegoeUI-Semibold。现将工坊配置区统一为微软雅黑优先；左右标签及颜色、材质、填充百分比、报价说明和重量均使用 14px、600 字重与 `#eef5f0`，同时提亮并加实。修改限定在工坊样式内。（E72）

[已验证] 桌面 2091×1244、手机模拟 390×844 的七组标签和值均为上述字号、字重和颜色，CDP 返回实际字体均为 MicrosoftYaHei-Bold，页面无横向溢出。两套 Hugo 构建及差异空白检查通过；内置浏览器已刷新并留存截图。（E73）

- E72：`assets/scss/_print-workshop.scss` 的 `.wk-config`、`.wk-label-row`、`.wk-material`、`.wk-infill-value`、`.wk-price-box`、`.wk-unit`；`.local/print-workshop/qa/value-readability/fonts-before.json`、`before.png`。
- E73：实际两套 Hugo 构建与差异空白检查输出；`.local/print-workshop/qa/value-readability/results.json`、`after.png`、`mobile-after.png`、`desktop-page.png`、`mobile-page.png`、`in-app-preview.png`。

## 2026-11-14：点击颜色直接打开 3D 预览

[已验证] 可选物品带模型时，点击任一颜色（包括当前颜色）立即选择 3D 媒体并应用颜色；从视频切换时暂停视频。首次模型未加载时显示已有加载状态，加载完成后使用最后选择的颜色。无模型时继续显示当前媒体，填充比例调整保持当前媒体。（E74、E75）

| 覆盖项 | 验证结果 | 证据 |
| --- | --- | --- |
| 桌面／手机颜色联动 | 视频→3D、图片→3D、重复点击当前颜色、加载期间再次选色、实际材质由橙色变为蓝色均通过 | E75 |
| 无模型及填充调整 | 无模型时选色保留视频／图片且不请求 3D 资源；滑块调整保留图片 | E75 |
| 原有媒体及配置 | 浏览器共 19 组场景通过，脚本错误为空；两套 Hugo 构建成功，差异空白检查通过 | E75 |

- E74：`assets/ts/print-workshop.ts` 的 `[data-color-id]` 点击处理、`selectView`、`paint` 与模型 `load` 处理。
- E75：`scripts/verify-workshop.cjs` 的颜色联动场景；实际两套 Hugo 构建、19 组浏览器验证及差异空白检查输出；`.local/print-workshop/qa/color-opens-model/results.json`、`desktop-color-opens-model.png`、`mobile-color-opens-model.png`。测试使用本机 Chrome；本地预览及后台服务已恢复。

## 2026-11-14：视频按钮每次从头播放

[已验证] 点击任意视频按钮时，选择对应媒体后将视频进度重置为 0 并调用播放；重复点击当前视频也执行重播。切换图片或模型时仍暂停视频，播放请求中断由已有同类处理捕获。（E76）

- E76：`assets/ts/print-workshop.ts` 的 `[data-view]` 点击处理；`scripts/verify-workshop.cjs` 的 `restartVideoFromButton` 与多视频场景。

[已验证] 桌面及手机的可选／现货共四组媒体场景通过：暂停后重复点击、播放中重复点击、播放结束重播、切换另一段视频、从图片返回视频，以及可选物品从模型返回视频，均从头播放；切走后暂停。完整浏览器回归 19 组通过，脚本错误为空；两套 Hugo 构建、脚本语法及差异空白检查通过。（E77）

- E77：实际构建与检查输出；`.local/print-workshop/qa/video-restart/results.json` 中的 `restarts` 播放进度及暂停状态；同目录桌面／手机两类物品的 `*-gallery-video-fixture.png` 截图。

## 2026-11-14：3D 默认留白与双向缩放

[已验证] 修改前实际默认轨道半径为 0.542845；向外滚动后半径、视野均不变，向内滚动则会缩短距离。现将默认相机距离改为自适应基准的 150%，最大距离放宽至 400%；当前模型默认半径为 0.775493，画面留白增加。重置视角复用同一默认值，媒体展示框尺寸保持一致。（E78、E79）

| 覆盖项 | 验证结果 | 证据 |
| --- | --- | --- |
| 桌面可选／现货 | 实际鼠标滚轮可拉远至约 2.17，再拉近；重置恢复 0.775493 与原角度 | E79 |
| 手机模拟可选／现货 | 双指收拢可拉远至约 2.08，双指展开可拉近；重置恢复默认距离 | E79 |
| 选色及布局 | 可选物品点击颜色继续切入 3D，默认距离保持；四组页面无横向溢出，脚本错误为空 | E79 |
| 构建与检查 | 两套 Hugo 构建及差异空白检查通过 | E79 |

- E78：`assets/ts/print-workshop.ts` 的 `DEFAULT_CAMERA_ORBIT`、`max-camera-orbit` 及 `[data-reset-view]` 处理；`.local/print-workshop/qa/camera-framing/before.json`、`before.png`。
- E79：实际构建与差异空白检查输出；`.local/print-workshop/qa/camera-framing/verify.cjs`、`results.json` 及四组 `*-initial.png`、`*-zoom-out.png`、`*-page.png`。手机为 Chromium 触屏模拟，本轮未做实体手机验收。

## 2026-11-14：放缓缩放并隐藏顶部加载横条

[已验证] 查看器的 `zoom-sensitivity` 从默认 1 调整为 0.1，放缓滚轮与双指缩放，保留默认 150% 距离及最大 400% 距离。工坊样式通过 `::part(default-progress-bar)` 隐藏查看器内置顶部进度条，原有“正在打开 3D 预览”提示继续显示，加载完成后隐藏。（E80、E81）

| 覆盖项 | 验证结果 | 证据 |
| --- | --- | --- |
| 缩放与重置 | 桌面／手机两类物品共四组实际滚轮及双指输入通过；相同输入的距离变化比上轮小，仍可拉远、拉近及重置 | E81 |
| 慢加载横条 | 四组均延迟模型响应，加载期间及完成后内置进度条计算样式为 `display:none`；现有加载提示正确显示／隐藏 | E81 |
| 配置与构建 | 默认展示比例、选色联动保留；无横向溢出或脚本错误；两套 Hugo 构建及差异空白检查通过 | E81 |

- E80：`assets/ts/print-workshop.ts` 的 `zoom-sensitivity="0.1"`；`assets/scss/_print-workshop.scss` 的 `model-viewer::part(default-progress-bar)`；本地查看器源码中对应命名 part 及缩放灵敏度处理。
- E81：实际构建与差异空白检查输出；`.local/print-workshop/qa/camera-framing/verify.cjs`；`.local/print-workshop/qa/gentle-zoom/results.json` 中的 `change`、`oldChange`、`progressDisplay` 及四组 `*-loading.png`、`*-initial.png`、`*-page.png`。手机为触屏模拟。

## 2026-11-15：发布前验证

[已验证] 已重新导出两件上架物品并通过完整性校验；生产构建成功，发布产物中无后台页面、数据库或 3MF 原件。34 项 Python、19 项 Node 及 19 组桌面／手机浏览器回归通过，包含颜色自动切换 3D、视频重播、媒体布局与报价。缩放及加载横条另有 E81 的四组检查。本轮沿用 `master` → GitHub Actions → R2 媒体与 GitHub Pages 的已有发布流程。（E82）

- E82：实际测试与生产构建输出；`.local/print-workshop/release`；`.local/print-workshop/qa/pre-deploy-20261115/results.json`；`.github/workflows/deploy.yml`。本次提交仅包含本轮工坊与头像改动，未纳入 `.workbuddy/` 或 `.local/`。
