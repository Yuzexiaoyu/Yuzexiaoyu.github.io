---
title: Markdown基本语法
date: 2026-03-30
lastmod: 2026-06-13
weight: 50
description: Markdown 语法和 HTML 元素格式。
image: star.webp
comments: true
---

## 标题

使用“#”控制标题大小，最大为1个“#”，最小为6个“#”，此标题为"##"

```html
写法：
#(一个空格)(文字)
##(一个空格)(文字)
...
```

## 引用

### 不带出处的引用

> Cyka Blyat.
```html
写法： 
> Cyka Blyat.
```

### 带有出处的引用

> 不要通过共享内存来通信，而要通过通信来共享内存。<br>
> — <cite>Rob Pike[^1]</cite>&nbsp;（点击1跳转页脚）
[^1]: 以上引用摘自 Rob Pike 在Gopherfest期间的[演讲](https://www.youtube.com/watch?v=PAAkCSZUG1c)。

```html
出处在页脚可以看到 ,用[ ]括起来的文字可以转化为超链接并隐藏跳转链接
写法：  
> 不要通过共享内存来通信，而要通过通信来共享内存。<br>
> — <cite>Rob Pike[^1]</cite>&nbsp;（点击1跳转页脚）
[^1]: 以上引用摘自 Rob Pike 在Gopherfest期间的[演讲](https://www.youtube.com/watch?v=PAAkCSZUG1c)。 


```



### 带提示的引用

> [!NOTE]
> 突出显示用户在快速浏览时也应注意的信息。

> [!TIP]
> 可选信息，帮助用户更顺利地完成任务。

> [!IMPORTANT]
> 用户成功所必需的关键信息。

> [!WARNING]
> 由于潜在风险而需要用户立即关注的关键内容。

> [!CAUTION]
> 某个操作可能带来的负面后果。

> [!NOTE] 自定义标题
> 如果你想使用自定义标题，可以在方括号后面添加标题文本，如上所示。

```html
写法：
> [!NOTE]
> 突出显示用户在快速浏览时也应注意的信息。
> [!TIP]
> 可选信息，帮助用户更顺利地完成任务。
> [!IMPORTANT]
> 用户成功所必需的关键信息。
> [!WARNING]
> 由于潜在风险而需要用户立即关注的关键内容。
> [!CAUTION]
> 某个操作可能带来的负面后果。
> [!NOTE] 自定义标题
> 如果你想使用自定义标题，可以在方括号后面添加标题文本，如上所示。
```

## 表格

   | 姓名  | 年龄 |
   | ----- | ---- |
   | Nikita   | 27   |
   | Suka | 23   |
```html
写法：
   | 姓名  | 年龄 |
   | ----- | ---- |
   | Nikita   | 27   |
   | Suka | 23   |
```


### 表格内的 Markdown

| *斜体* | **加粗** | `代码` |
```html
写法:
| *斜体* | **加粗** | `代码` | 
普通文本如果误用代码标记，可以在代码标记前加\
示例： \*斜体\*
``` 
<br> 

| A    | B             | C         | D          | E                   |
| --------- | ------------- | ---------------- | -------------- | ---------------- |
| 对应A下方的内容. | 对应B下方的内容.. | 对应C下方的内容. | 对应D下方的内容. | 对应E下方的内容.|

```html
表格与其他元素间无法换行用：
<br>放置在单行用于换行，
且表格会自适应，
写法：
| A    | B             | C         | D          | E                   |
| --------- | ------------- | ---------------- | -------------- | ---------------- |
| 对应A下方的内容. | 对应B下方的内容.. | 对应C下方的内容. | 对应D下方的内容. | 对应E下方的内容.|

```

## 代码块
```html
Cyka Blyat
Cyka Blyat
```
如果要代码块内嵌代码块，加 \` 的数量，注意 \` 的配对
````html
写法： 
```html
Cyka Blyat
Cyka Blyat
```
````

## 列表类型

### 有序列表
1. 第一项
2. 第二项
3. 第三项
```html
1. 第一项
2. 第二项
3. 第三项
```
### 无序列表

* 列表项
* 另一项
* 还有一项
```html
* 列表项
* 另一项
* 还有一项
```
### 嵌套列表

* 水果
  * 苹果
  * 橘子
  * 香蕉
* 乳制品
  * 牛奶
  * 奶酪
```html
* 水果
  * 苹果
  * 橘子
  * 香蕉
* 乳制品
  * 牛奶
  * 奶酪
```
## 其他元素

H<sub>2</sub>O

X<sup>n</sup> + Y<sup>n</sup> = Z<sup>n</sup>

按 <kbd>CTRL</kbd> + <kbd>ALT</kbd> + <kbd>Delete</kbd> 结束会话。

大多数<mark>蝾螈</mark>是夜行性的，捕食昆虫、蠕虫和其他小型生物。
```html
H<sub>2</sub>O

X<sup>n</sup> + Y<sup>n</sup> = Z<sup>n</sup>

按 <kbd>CTRL</kbd> + <kbd>ALT</kbd> + <kbd>Delete</kbd> 结束会话。

大多数<mark>蝾螈</mark>是夜行性的，捕食昆虫、蠕虫和其他小型生物。
```
## marmaid图表
直接用\`\`\`mermaid和\`\`\`包裹标准marmaid内容即可
```mermaid
%%{init: {'themeVariables': { 'fontSize': '24px' }}}%%

graph LR
    %% ================= 1. 样式定义 (节点内文字双重保险放大) =================
    classDef client fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#000,font-size:24px;
    classDef gateway fill:#fff3e0,stroke:#e65100,stroke-width:2px,color:#000,font-size:24px;
    classDef service fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px,color:#000,font-size:24px;
    classDef db fill:#fce4ec,stroke:#880e4f,stroke-width:2px,color:#000,font-size:24px;
    classDef external fill:#fff8e1,stroke:#f57f17,stroke-width:2px,stroke-dasharray: 5 5,color:#000,font-size:24px;
    classDef decision fill:#f3e5f5,stroke:#4a148c,stroke-width:2px,color:#000,font-size:24px;

    %% ================= 2. 全局纯白线条 =================
    linkStyle default stroke:#ffffff,stroke-width:2px,fill:none;

    %% ================= 3. 客户端与网关层 =================
    subgraph ClientLayer [📱 客户端与网关]
        direction TB
        Web[Web 浏览器]:::client
        App[移动端 App]:::client
        MiniProgram[微信小程序]:::client
        Gateway[API Gateway]:::gateway
        Auth{认证鉴权}:::decision
        RateLimit[限流熔断]:::gateway
    end

    %% ================= 4. 核心业务微服务层 =================
    subgraph BusinessLayer [⚙️ 核心业务微服务层]
        direction TB
        OrderService[订单服务]:::service
        ProductService[商品服务]:::service
        UserService[用户服务]:::service
        InventoryService[库存服务]:::service
        PayService[支付服务]:::service
    end

    %% ================= 5. 共享中间件层 =================
    subgraph MiddlewareLayer [🔗 共享中间件]
        direction TB
        MQ[(消息队列 MQ)]:::db
        Redis[(Redis 共享缓存)]:::db
    end

    %% ================= 6. 数据存储与外部服务层 =================
    subgraph DataExternalLayer [💾 专属存储与外部服务]
        direction TB
        DB_Order[(订单数据库)]:::db
        DB_Product[(商品数据库)]:::db
        DB_User[(用户数据库)]:::db
        DB_Inventory[(库存数据库)]:::db
        
        ES[(ElasticSearch)]:::db
        WechatPay((微信支付)):::external
        Alipay((支付宝)):::external
        SMS[短信网关]:::external
        Logistics[物流 API]:::external
    end

    %% ================= 7. 连接关系 =================
    Web & App & MiniProgram ==> Gateway
    Gateway ==> Auth
    Gateway ==> RateLimit
    Auth ==>|Token 验证| UserService
    RateLimit ==>|请求分发| OrderService
    RateLimit ==>|请求分发| ProductService

    OrderService -->|查询| ProductService
    OrderService -->|校验| UserService
    OrderService -->|扣减| InventoryService
    OrderService -->|发起支付| PayService

    OrderService -.->|发布事件| MQ
    MQ -.->|消费: 通知| SMS
    MQ -.->|消费: 物流| Logistics

    PayService --> WechatPay & Alipay

    %% ================= 8. 防重叠核心技巧：隐形垂直对齐线 =================
    OrderService ~~~ DB_Order
    ProductService ~~~ DB_Product
    UserService ~~~ DB_User
    InventoryService ~~~ DB_Inventory
    
    OrderService --- DB_Order
    ProductService --- DB_Product
    UserService --- DB_User
    InventoryService --- DB_Inventory
    PayService --- DB_Order
    
    ProductService -.->|同步| ES
    
    ProductService --- Redis
    UserService --- Redis
    InventoryService --- Redis
```