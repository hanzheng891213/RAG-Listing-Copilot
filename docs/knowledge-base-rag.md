# RAG 知识库链路（当前实现）

本文对应当前代码：`backend/src/services/knowledge/*`、`backend/src/worker.ts`、`backend/src/controllers/knowledgeController.ts`。

## 1. 是否真的用了 embedding 模型？

**是，生产环境用的是真实向量，不是“死向量”。**

| 环境 | Embedder | 说明 |
| --- | --- | --- |
| Cloudflare Worker（`wrangler dev/deploy`，有 `AI` binding） | `@cf/baai/bge-m3` | 1024 维、多语言，文本向量由 Workers AI 现算 |
| Express 本地开发（`npm run dev`，没有 AI binding） | `LocalEmbedder` | 关键词哈希 + L2 归一化的**降级实现**，只用于本地无网调试，检索效果明显弱于 bge-m3 |

关键点：

- 向量在**写入时生成**：`ingestDocument()` → `chunkMarkdown()` → `embedder.embed()` → `Vectorize.upsert()`。
- 查询时同样用同一个 embedder 现算 query 向量，再调 `Vectorize.query()`。
- 不存在“提前生成一批向量然后永远不再变化”的死向量；新增文档会即时向量化。
- 本地 `LocalEmbedder` 的向量与线上 bge-m3 向量**不在同一语义空间**。本地写入的向量不要同步到线上 Vectorize 索引。

## 2. 完整链路

```
文档 (md/txt; Express 还支持 pdf/docx)
  │  POST /api/knowledge/upload   (仅管理员)
  ▼
chunkMarkdown()                      512 字符 / 128 重叠，按段落→句子→字符回退
  │                                 每个 chunk 前置最近的 Markdown 标题
  ▼
[英文本 + 中文本] 分别 chunk
  │
  ▼
CloudflareEmbedder.embed()           bge-m3，一次请求批量最多 32 条文本
  │
  ▼
Vectorize.upsert()                   id = `${docId}-${lang}-${index}`
  │
  ▼
D1 `documents` 表                    正文、标题、分类、平台、chunk 数
```

检索：

```
query
  ▼
embed(query)
  ▼
Vectorize.query(topK)                不带 metadata filter
  ▼
按 metadata.platform 在代码里过滤    平台不匹配的 chunk 丢弃
  ▼
按 category 分两路                   platform_rules → 规则；templates → 风格
  ▼
buildPromptContext()                 英文本优先，最多 4 条规则 + 2 条模板
  ▼
注入 Listing 生成 prompt
```

### 2.1 为什么不用 Vectorize 的 metadata filter？

Vectorize 对 `platform`过滤需要先创建 metadata index（`wrangler vectorize create-metadata-index ...`）。没有索引时过滤会**静默返回 0 条**，于是生成 prompt 丢掉全部平台规则。现在改为：查询更宽的池子（平台查询 `topK × 4`，上限 50），在代码里按 `platform` 过滤。代价一样，但不依赖索引，也不会因漏建索引而“看起来正常、实际没有 RAG”。

### 2.2 中文能检索吗？

- bge-m3 支持中英混合；文档的中文正文也会被 chunk + embed。
- 生成 prompt 优先用英文本 chunk 做 grounding，避免中文正文把模型输出语言带偏；这是业务选择，不是模型限制。
- 本地开发用的 `LocalEmbedder` 只做关键词哈希，对中文分词很粗糙，不能拿它评估线上检索质量。

### 2.3 “分词”是怎么回事？

当前没有引入独立分词器（jieba / tiktoken / BM25）：

- 切块是**字符级**的：先按空行分段，段落过长再按句号/换行/空格回退，512 字符一块，128 字符重叠。
- 真正的 tokenization 在 bge-m3 模型内部完成。
- 因此**新增库/新增文档不需要改分词逻辑**，只要文档是 Markdown/纯文本即可；中文、英文、混合文本都能进同一条链路。
- 如果以后要 BM25 混合检索，才需要额外引入分词器；当前是纯向量检索。

## 3. 新增知识库文档的三种方式

1. **后台页面上传**（推荐）
   - 路由：`POST /api/knowledge/upload`，管理员权限。
   - 字段：`file`、`title`、`category`（`platform_rules` / `templates`）、`platform`（amazon/shopify/ebay/…）、`tags`。
   - Worker 运行时：`.txt/.md/.pdf` 按文本读取，`.docx` 不支持；Express 本地：`.pdf` 用 `pdf-parse`，`.docx` 用 `mammoth`。
2. **重新生成种子数据**
   - 把中英文 Markdown 放进 `knowledge-base/{platform-rules,templates}/` 和 `knowledge-base/zh/...`，在 `scripts/generate-seed-data.mjs` 的 `SEED_METADATA` 里登记标题/平台/标签。
   - 执行 `npm run seed:generate`，再部署。
   - 线上需要调用 `POST /api/knowledge/seed`，每次最多处理 3 篇（`DEFAULT_SEED_BATCH`），响应里的 `remaining` 为 0 时完成。重复调用是幂等的（按标题判重）。
3. **直接调 API**：`POST /api/knowledge/upload`（管理员 token）。

> 新增文档会消耗 Workers AI neurons 和 Vectorize 写入额度。免费版建议一次加 1-3 篇，观察 `remaining` 后再继续。

## 4. 存储位置

| 数据 | 位置 |
| --- | --- |
| 文档正文/元数据 | D1 `documents` 表（`migrations/0001`、`0002`） |
| 向量 | Cloudflare Vectorize 索引 `knowledge-chunks-prod` |
| 本地开发 | 进程内 Map + 内存向量，重启即丢 |

## 5. 已知限制

- 检索是纯向量，没有 BM25/关键词混合，专有名词（型号、认证编号）召回一般。
- 切块是字符数而非 token 数；极长表格行可能被切开。
- 平台过滤是精确字符串匹配；`platform` 写错就等于该文档在所有平台都检索不到。
- 免费版 Workers AI 有每日 neurons 限制；批量上传大文档可能触发限流。
- 本地 `LocalEmbedder` 与线上向量不兼容，不能混用同一索引。
