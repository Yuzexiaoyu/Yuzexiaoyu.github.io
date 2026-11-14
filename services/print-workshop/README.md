# 雨泽小鱼的工坊 · 本地版

## 启动

双击项目根目录的 `启动工坊.cmd`，等待窗口打印地址后打开：

- 工坊：<http://127.0.0.1:13135/prints/>
- 独立本地后台：<http://127.0.0.1:13135/admin/prints/>

需要 Python 3.10+；使用项目已有的 `hugo.exe` 构建，不需要安装 pip 依赖。关闭启动窗口或按 Ctrl+C 可停止服务，已保存内容仍保留。每次重新运行会重新构建页面。

也可在项目目录执行：

```powershell
python services/print-workshop/server.py --build --demo
```

首次启动会加入明确标注的演示作品、商品和示例色卡。删除演示内容后再次启动不会自动补回。演示模型、价格和颜色不代表实际在售内容。

## 管理内容

1. 在“公共色卡”维护实际可用的颜色名称和预览色值。
2. “新建内容”中选择可选或现货，填写名称、说明，上传图片和视频。第一张图片作为封面，可更换封面或移除图片。
3. 作品可以只上传图片；商品上架需要图片、GLB 预览模型、可用颜色和价格。视频用于详情页播放，不作为封面。
4. 设置 15% 填充最低价和 100% 填充最高价。价格按线性比例计算，并四舍五入到整数元。
5. 选择草稿、上架或下架后保存。未上架内容不会出现在顾客目录中。
6. 在“联系设置”上传自己的 QQ 联系二维码。顾客每次为一件商品生成配置清单，自行复制到 QQ 联系确认。

图片支持 PNG、JPG、WebP，单张最大 12 MB，单条内容最多 12 张。视频支持 MP4、WebM、MOV，单个最大 64 MB，单条内容最多 6 个。模型最大 64 MB；GLB 须自包含，当前离线预览不接收 Draco、Meshopt 或 KTX2/Basis 压缩资源。色卡被内容引用时不能直接停用，应先取消相关商品的勾选。

3MF 可以作为原件保存，但暂不自动转换成 GLB。代表性 Bambu Studio 样本尚未提供，兼容性验证待补。原件没有顾客下载入口；浏览器预览必需的 GLB 会发送到浏览器。

## 本地范围与保存位置

- 服务固定监听 `127.0.0.1`，只允许本机 Host；不开放局域网或公网访问。
- 后台 HTML 在 `services/print-workshop/admin.html`，不属于 Hugo 的 `content` 或 `static`，不会被构建成公开页面。
- 顾客页面没有管理入口。本地管理写入使用会话 Cookie、同源检查和每次启动更新的请求令牌。
- 本地后台不设独立账号密码；可以访问这台电脑的用户能够打开后台。
- 数据保存在 `.local/print-workshop/data/workshop.sqlite3`；上传文件在同目录的 `files/`。这些路径已排除 Git 跟踪。
- 备份时先关闭服务，再复制整个 `.local/print-workshop/data` 文件夹；恢复时在服务停止状态下恢复该文件夹。
- `.local/print-workshop/site` 是可重新生成的页面；清除浏览器缓存不会删除数据库。
- 删除内容后未引用的上传文件暂保留在本机，不自动清理。

## 发布到现有网站

线上工坊使用静态公开目录，本地管理后台仍只在当前电脑运行。管理后台保存内容不会立即改变线上页面；修改完成后，在项目目录执行：

```powershell
python services/print-workshop/export_public.py
```

该命令更新 `static/workshop/catalog.json` 和 `static/workshop/media/`，仅包含已上架内容、对应预览图片／视频／GLB、公共联系二维码。草稿、下架内容、3MF 原件、数据库和管理页面不导出。重新导出会移除已下架内容及不再引用的公开素材。

检查导出结果后，将 `static/workshop/` 的变更提交并推送到现有 `master` 分支；GitHub Actions 会上传图片、视频和 GLB 到 R2，把目录中的工坊媒体地址重写为 CDN，再发布到 `https://yuzexiaoyu.space/prints/`。发布副本使用静态数据，本地启动脚本使用 `workshop-local` 配置连接实时本机接口。

## 当前边界

没有在线支付、购物车、多件数量、数字文件出售或自动 3MF 转换。真实商品、图片、价格、色卡、QQ 二维码由站主补充。移动端已做浏览器模拟检查，尚未在实体手机上验收；本地回环服务不能直接在另一台手机上打开，公开页面可通过网站域名访问。

## 验证

```powershell
python -m unittest discover -s services/print-workshop -p test_server.py -v
```

测试使用独立临时数据库和文件，不修改实际工坊数据。实施与验证证据见 `docs/print-workshop-implementation.md`。

页面构建完成后，可使用 Node.js 运行入场动画生命周期检查：

```powershell
node --test services/print-workshop/test_intro.cjs
```

工坊复用主页动态星空。首次进入时隐藏内容 0.45 秒，随后用 0.55 秒错开浮现；工坊内部切页不重复入场。系统开启“减少动态效果”时使用短淡入。动画时长位于 `assets/ts/workshop-intro.ts` 的 `HOLD`、`REVEAL` 和 `RAMP`。手机端隐藏工坊独立顶栏与首屏文案，直接从栏目标签开始。
