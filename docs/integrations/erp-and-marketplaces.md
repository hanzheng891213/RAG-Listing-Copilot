# ERP / 电商平台接入与批量上架

## 1. 结论先说

- **可以接**，但只能走各平台的**官方开放 API / 授权应用**，不能靠爬虫或模拟登录。
- 合规底线：平台 API 条款、OAuth 授权范围、数据保护（买家 PII）、速率限制、类目审核。
- **最快落地的批量上架方式不是直连 API，而是“表格 → 平台批量模板 CSV → 平台后台/API 导入”**。当前项目已经能导出商品 CSV，这是最稳的第一步。
- 真正做 Amazon 自动上架，需要注册 SP-API 开发者、创建应用并通过审核、拿到 LWA 凭证；这不是“填个 API Key”能完成的。

## 2. 各平台可行性

| 平台 | 接入方式 | 前置条件 | 批量上架 |
| --- | --- | --- | --- |
| Amazon | Selling Partner API (SP-API) | 开发者注册、应用审核、LWA client id/secret、卖家授权、对应角色（Product Listing） | `JSON_LISTINGS_FEED` / 分类 flat file；有严格限流 |
| Shopify | Admin API（GraphQL/REST）、自定义应用 | 店铺管理员安装应用、`write_products` scope | `productCreate`/`productUpdate`，或 CSV 导入 |
| eBay | Sell APIs（Inventory/Listing） | Developer Program 账号、OAuth、eBay 卖家授权 | `createOffer` + `publishOffer`，或 CSV/File Exchange |
| TikTok Shop | Partner Center API | 开发者账号、应用审核、店铺授权 | 商品创建 API / 批量模板 |
| Temu | 卖家中心/开放平台（按地区政策） | 入驻与类目资质 | 以后台批量模板为主 |
| 独立站/ERP | 自建 REST/Webhook、金蝶/用友/店小秘等 | 对方开放接口与授权 | CSV / API 双向同步 |

> 平台政策变化很快，接入前以对应平台开发者文档和卖家协议为准。

## 3. 合规要点

1. **只走官方 API**：不要抓取平台页面、不要共享卖家账号密码、不要绕过审核。
2. **OAuth 凭证服务端保存**：client secret、refresh token 只能放在 Cloudflare Secret 或服务端环境变量里，绝不能进浏览器 localStorage。
3. **最小权限**：只申请上架所需 scope；不要申请订单/买家 PII 权限，除非业务确实需要。
4. **速率限制**：SP-API 按操作维度限流，批量上架必须做队列、退避重试、幂等键（SKU + 店铺）。
5. **内容合规**：标题/图片/认证/类目准入由卖家负责；RAG 只能辅助，不能替代平台审核。
6. **数据留存**：商品成本、供应商、API Key 属于商业敏感数据；当前实现已把 API Key 加密存服务端，商品表要求登录访问。

## 4. 推荐落地顺序（低成本、可回滚）

1. **表格导出 CSV**（现在就能用）
   - 商品上架表右上角“导出”按钮 → CSV。
   - 用平台的批量上传模板（Amazon flat file / Shopify CSV / eBay File Exchange）做一次人工校验。
2. **脚本生成平台模板**（本仓库 `scripts/export-products-csv.mjs`）
   - 用只读 token 拉取商品，按平台列顺序输出 CSV。
   - 在 CI 或本地跑，不占 Worker 请求额度。
3. **半自动 API 上架**
   - 一个独立的小 Worker / 本地脚本负责 SP-API / Shopify 调用。
   - 用 `SKU` 做幂等键；每批 10-50 条；失败写回一个 `publish_status` 字段。
4. **全自动**
   - 引入 Queues / Cron（Cloudflare 免费版有次数限制），或外部任务队列。
   - 做“草稿 → 校验 → 提交 → 回读状态”的状态机，不要同步长请求。

## 5. 当前仓库已经提供的能力

- 商品上架表的 CSV 导出（前端）。
- `GET /api/products`（登录 + `productGrid` 权限，分页 ≤500）。
- `GET /api/finance/summary`（登录 + `finance` 权限，服务端聚合）。
- 每个用户独立的模型配置（服务端 AES-GCM 加密）。

## 6. 脚本示例

```bash
API_BASE="https://your-domain.example" \
API_TOKEN="<粘贴登录后的 JWT>" \
node scripts/export-products-csv.mjs > products.csv
```

脚本只读取商品并输出 CSV，不包含任何平台签名逻辑；平台签名请放在独立服务里，避免把 SP-API 凭证带进浏览器或前端仓库。

## 7. 不建议的做法

- 把 Amazon/Shopify 的 client secret 或 refresh token 放进 `VITE_*` 环境变量或前端代码。
- 在 Worker 请求里串行调用几十个平台 API（免费版 50 subrequest/请求，且耗时会被客户端超时截断）。
- 用同一个卖家账号密码做“模拟登录”批量上架，违反平台条款且极易被封。
- 把平台返回的买家姓名/地址写入商品表或 localStorage。
