# 模型管理与用量统计

模型管理页（`/model-manager`，仅管理员）分左右两栏：左边维护**模型服务商与接入凭据**，右边展示
**真实调用用量**。所有配置只写浏览器 `localStorage`，API Key 从不上传服务端。

页面结构参考 DeepSeek Harness 的模型设置页：每个服务商一行，同一时刻只展开一张编辑卡片，
凭据和其余字段都收在卡片里。

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
| 默认模型 | 一个自由填写的模型 ID，决定请求里的 `model` |
| 自定义设置 → API 地址 | 覆盖目录里的 baseUrl；服务商没有默认地址（自定义）时必填 |
| 自定义设置 → Temperature / Max Tokens | 生成参数 |

保存时写入 `rag-copilot-provider-configs`，包含 `activeModel` 与 `baseUrl`。自定义服务还会写入
`rag-copilot-custom-providers`；删除自定义服务会同时清掉它的配置，内置服务不可删除。
保存至少需要 API 密钥和一个模型 ID；服务商目录里没有默认地址时还需要填 API 地址。

### 为什么不再维护模型清单

服务商的模型名字变化很快，页面内置的清单很快就会过时（旧版的 `models` 数组就是这样烂掉的）。
因此页面只保留服务商，每个服务商配一个手填的 `activeModel`：

- 不再展示、也不再要求维护「模型列表」；
- 旧版本存储在 `localStorage` 里的 `models` 数组会在读取配置时丢弃（见
  `modelStore` 里的 `loadConfigsFromStorage`），`activeModel` 原样保留，已有配置继续可用；
- 生成页、AI 对话、用量统计读到的 `model` 都是这一个值，不需要改代码。

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
