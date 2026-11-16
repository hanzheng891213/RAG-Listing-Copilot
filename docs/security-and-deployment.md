# 安全改造与部署说明

本次改造把账号、权限、模型密钥从“浏览器 + 硬编码”迁到服务端，并新增财务看板、成本字段和导入恢复缓存。

## 1. 部署前必须做的三步

### 1.1 应用 D1 迁移

```bash
# 本地（wrangler dev 的本地 D1）
npx wrangler d1 migrations apply rag-listing-copilot --local

# 线上
npx wrangler d1 migrations apply rag-listing-copilot --remote
```

`0005_create_users_and_model_configs.sql` 会创建：

- `users`：账号、PBKDF2 密码、角色、页面权限、启用状态、当前模型服务商。
- `user_model_configs`：按用户隔离的模型配置，API Key 只存 AES-GCM 密文。

**管理员账号已保留**：用户名不变，密码不变，权限为全部页面。种子只在新表为空时插入（`INSERT OR IGNORE`），以后重复部署不会覆盖你改过的密码。

> 如果线上已经手动建过同名表，先确认列结构，再决定是否手工补列；迁移脚本使用 `CREATE TABLE IF NOT EXISTS`，不会自动给旧表加缺的列。

### 1.2 配置 Secrets

```bash
# 32 字节十六进制
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npx wrangler secret put JWT_SECRET

# 32 字节 base64，用来加密用户 API Key
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
npx wrangler secret put CONFIG_ENC_KEY

# 可选：限制跨域来源
npx wrangler secret put ALLOWED_ORIGINS
```

- 缺少 `JWT_SECRET`：登录/注册返回 `503 ERR_JWT_SECRET_MISSING`，不会再用默认密钥。
- 缺少 `CONFIG_ENC_KEY`：保存 API Key 返回 `503 ERR_CONFIG_KEY_MISSING`，不会退化成明文存储。
- 轮换 `CONFIG_ENC_KEY` 会让已存的所有 API Key 无法解密，用户需要重新填写（页面会显示为未配置）。

本地开发用 `.dev.vars`（已被 `.gitignore` 忽略），仓库里只保留 `.dev.vars.example`。

如果本地要接一个 `http://localhost:xxxx` 的中转站，在 `.dev.vars` 里加 `ALLOW_LOCAL_PROVIDER="true"`。**线上不要设置**：它允许自定义服务商指向 loopback/内网地址，属于 SSRF 面。

### 1.3 重新构建 / 部署

```bash
npm run build        # 构建前端
npx wrangler deploy  # 部署 Worker + 静态资源
```

`wrangler.toml` 不再包含任何明文 JWT 密钥。

## 2. 账号与权限模型

| 项 | 行为 |
| --- | --- |
| 注册 | `POST /api/auth/register`，用户名大小写不敏感唯一，密码 ≥10 位且含字母+数字 |
| 新用户默认权限 | 无。管理员在“权限设置”里勾选后才能看到对应页面 |
| 管理员 | 始终拥有全部权限，不能被页面勾选限制，也不能停用/降级自己 |
| 最后一个管理员 | 服务端拒绝降级/停用，避免锁死 |
| 权限生效 | 每次请求都从数据库重新读取角色/权限，改完立即生效，不需要等 JWT 过期 |
| JWT | 只包含 userId/username/role，7 天；身份失效或账号停用会被拒绝 |

页面权限键：`productGrid`、`listingGenerator`、`knowledgeBase`、`modelManager`、`finance`。

## 3. 密码与密钥存储

- 密码：PBKDF2-SHA256，60,000 次，16 字节随机盐，格式 `pbkdf2$sha256$60000$salt$hash`。
  - 60,000 次是 Workers 免费版 10ms CPU 预算下的上限；登录/注册是低频操作，若线上出现 1102 CPU 错误，可在 `backend/src/services/auth/password.ts` 调整 `ITERATIONS`（旧哈希仍可验证，因为次数写在哈希里）。
  - 旧的 bcrypt 哈希已不再使用；管理员密码通过新哈希保留。
- API Key：AES-GCM（12 字节 IV）加密后存 D1；API 只返回 `hasKey` 和末四位，前端永远不会拿到明文。
- 生成 Listing 时，浏览器只传 `providerId`；模型、温度、maxTokens、Key 都由服务端从该用户的配置读取，客户端无法抬高 token 预算或替换 Key。
- 旧的 `localStorage` 明文账号、明文密码、明文 API Key 不再被读取；升级后用户需要重新登录，模型 Key 需要在“模型管理”重新填写一次。

### 轮换管理员密码

旧提交和旧的前端 bundle 里存在过明文密码。如果仓库/站点曾经公开，建议轮换一次（保留账号与权限）：

```bash
node scripts/hash-password.mjs '新的强密码'
# 把输出的 pbkdf2$... 填到下面
npx wrangler d1 execute rag-listing-copilot --remote --command \
  "UPDATE users SET password_hash='pbkdf2$sha256$60000$...', updated_at=datetime('now') WHERE username_lower='hanzheng891213@gmail.com'"
```

密码规则：≥10 位、字母+数字；不要复用旧密码。

另外，旧版本留下的 `backend/data/provider-configs.json` 里有明文 AI API Key（该目录已被 `.gitignore` 忽略，但文件仍在磁盘上）。当前代码不再读取它，建议删除并到各服务商控制台轮换这些 Key。

## 4. 免费版请求量控制

| 设计 | 作用 |
| --- | --- |
| `/api/models/configs` 一次返回 provider 目录 + 配置 + 当前服务商 | 模型页从 2 次请求降到 1 次 |
| 登录/`/me` 返回权限，前端不再单独拉权限 | 少 1 次请求 |
| 权限组 localStorage 已移除，服务端按用户存 | 不再有“前端权限”第二套状态 |
| 商品列表分页 ≤500，默认 100 | 单次响应可控 |
| 财务汇总服务端一次扫描 | 财务页固定 1 次请求，不拉全表到浏览器 |
| 知识库 embedding 批量 32 条/请求 | 种子文档从 ~22 次 AI 调用降到 1-2 次 |
| 导入草稿存 sessionStorage（≤2000 行/3MB/2 小时） | 保存失败可恢复，不额外打接口 |
| 登录失败限流（内存，每 isolate） | 不产生 D1 写入；全局兜底仍需 WAF/Cloudflare Access |
| 模型配置按需加载 | 只在登录/切换账号时请求一次 |

仍建议：

- 免费版每天 100,000 请求、D1 行读取有配额；不要做轮询、不要在前端循环调用 API。
- 登录限流是 per-isolate 的尽力而为；公开部署建议再开 Cloudflare WAF Rate Limiting 或 Access。
- 大批量导入/财务扫描会消耗 D1 行读取；当前上限：财务最多扫描 5,000 行，单页 500 行，单批保存 500 行。

## 5. 数据与行为变化

- 商品列表读接口从“公开”改为“登录 + `productGrid` 或 `listingGenerator`”。
- 商品顺序改为**新数据在前**（`created_at DESC`）。
- 新用户注册后没有任何页面权限，需要管理员授权；注册成功会自动登录，但只能看到首页。
- 访客账号保留，权限调整为 `productGrid + listingGenerator + knowledgeBase`；没有 Key 时生成会走演示数据。
- 成本字段（采购成本/头程运费/佣金率/广告费/其他成本）进入同一条 `fields` JSON，导入表头会自动映射。
- 财务看板只统计同时有“价格”和“采购成本”的行；其余进入“待补成本”列表。

## 6. 回归检查清单

```bash
cd backend && npm test
npx tsc --noEmit
cd ../frontend && npx vue-tsc --noEmit -p tsconfig.app.json && npm run build
```

手动：

1. 用原管理员账号登录。
2. 注册一个新账号 → 应看到“等待管理员分配权限”。
3. 管理员在权限设置里给新账号勾选页面 → 新账号刷新后出现对应菜单。
4. 模型管理填入 Key + 模型 → 保存后只显示末四位；刷新页面仍在。
5. 商品表导入 Excel → 新行在最前；财务看板出现预估利润。
6. 断开网络后导入 → 刷新页面 → 提示恢复未保存的导入。
