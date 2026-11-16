# 模型管理与用量统计

模型管理页（`/model-manager`）分左右两栏：左边维护**模型服务商与接入凭据**，右边展示
**真实调用用量**。页面访问由权限组的「模型管理」权限控制（管理员默认拥有）；所有配置只写浏览器
`localStorage`，API Key 从不上传服务端；配置按**登录账号**命名空间保存，同一个账号换一次登录
不需要重填 Key。

页面结构参考 DeepSeek Harness 的模型设置页：每个服务商一行，同一时刻只展开一张编辑卡片，
凭据和其余字段都收在卡片里。

## 0. Key 随登录人保存

`modelStore` 的存储键带账号后缀：

| 数据 | 键 |
|---|---|
| 服务商配置（含 API Key、模型名称） | `rag-copilot-provider-configs:<userId>` |
| 当前默认服务商 | `rag-copilot-active-provider:<userId>` |
| 自定义服务商目录 | `rag-copilot-custom-providers`（与账号无关） |

登录 / 刷新用户 / 退出时，`authStore` 调用 `modelStore.bindUser(userId)` 切换作用域：登录后读回
该账号的 Key，退出后回到 `guest` 作用域，另一个账号登录不会继承前一个人的 Key。旧版本只有
一个全局键 `rag-copilot-provider-configs`；第一个登录的账号会把它迁移到自己的命名空间并删除
旧键，之后其他账号不会再看到这份配置。

`X-Active-Provider` 请求头仍然从全局镜像键读取，它只是服务端日志提示，不是凭据。

## 1. 左侧：模型服务商

服务商列表来自两处合并：

- 后端内置目录 `GET /api/models/providers`（DeepSeek / 通义千问 / 豆包 / 自定义）；
- 本机声明的自定义服务（`rag-copilot-custom-providers`），可添加任意 OpenAI 兼容端点。

每一行显示：状态点（绿=已配置 Key，灰=未配置）、名称、「自定义」标签（本机声明）、
「默认」标签（当前默认服务）、端点主机名，以及「编辑 / 删除」操作。点击「编辑」展开该服务的
编辑卡片，再次点击或「取消」收起。

编辑卡片可改：

| 字段 | 说明 |
|---|---|
| API 密钥 | 只写不读；留空表示保留原 Key；可显示/隐藏、可删除 |
| 模型名称 | 用户从服务商官网查到的模型名称，决定请求里的 `model` |
| 自定义设置 → API 地址 | 覆盖目录里的 baseUrl；服务商没有默认地址（自定义）时必填 |
| 自定义设置 → Temperature / Max Tokens | 生成参数 |

保存时写入当前账号的 `rag-copilot-provider-configs:<userId>`，包含 `activeModel` 与 `baseUrl`。
自定义服务还会写入 `rag-copilot-custom-providers`；删除自定义服务会同时清掉它的配置，内置服务
不可删除。保存至少需要 API 密钥和一个模型名称；服务商目录里没有默认地址时还需要填 API 地址。

### 为什么不再维护模型清单

服务商的模型名字变化很快，页面内置的清单和默认模型很快就会过时（旧版的 `models` 数组就是
这样烂掉的）。因此：

- 后端 `BUILTIN_PROVIDERS` 不再携带 `models`，`callProviderAPI*` 也不再回退到
  `provider.models[0]`；请求必须带用户填写的模型名称，否则直接失败并写日志；
- 页面只展示「模型名称」一个自由输入框，提示用户到服务商官网查询后填写；
- 旧版本存储在 `localStorage` 里的 `models` 数组会在读取配置时丢弃（见 `modelStore` 里的
  `parseConfigs`），`activeModel` 原样保留，已有配置继续可用；
- 生成页、AI 对话、用量统计读到的 `model` 都是这一个值，不需要改代码；用量统计按实际
  `modelId` 展示。

## 2. 右侧：用量统计

- 时间范围：近 7 / 30 / 90 天（`GET /api/models/usage/stats?days=N`）。
- 四个汇总卡：总花费（RMB）、总 Tokens、调用次数、平均每次 Tokens。
- **各模型用量**表：模型、Tokens、调用次数、费用、占比条。
- 费用占比饼图（按模型，同服务商用色阶区分）、每日 Token 柱状图。
- 无数据时显示空状态而不是报错。

## 3. 曾经打不开的原因

`/api/models/usage/stats` 的处理函数调用了 `modelService.getUsageStats(days)`，但该方法返回
`Promise`，处理函数没有 `await`：

```ts
const stats = modelService.getUsageStats(days)   // Promise
res.json(stats)                                   // 序列化成 {}
```

前端拿到 `{}` 后执行 `usageStats.totalCost.toFixed(4)`，在渲染函数里抛
`TypeError: Cannot read properties of undefined (reading 'toFixed')`，整个页面白屏（只在请求成
功时出现，后端不可用时反而正常，所以表现为「有时候打不开」）。

修复分两层：

1. 服务端 `await` 并包 try/catch，失败返回 500 而不是静默空对象；
2. 前端 `normaliseUsageStats()` 把每个字段强制成数字/数组，任何缺字段的响应都不会再让渲染
   崩掉。
