# 商品表格（类 Excel 编辑）

把供应商商品从「上传后只能看」变成「可整块粘贴、可批量保存」的编辑面。实现依据
`excel-grid-implementation-constraints.md`，但**刻意不引入 Handsontable**：该文档第 7 节
已明确「换到 VxeTable 或自研表格，第 2–6 节的分层和约束仍然成立」，而 HOT 的非商业
授权对后续商用是个隐患。自研后，原文档里 4/4.7 两节关于右冻结与外置滚动条的补丁
（运行时写 `<style>`、渲染全列兜底）不再需要，其余约束逐条落实。

## 1. 模块边界

| 模块 | 只做 | 文件 |
|---|---|---|
| 页面 | 测量、装配、弹窗、翻页决策 | `views/ProductGrid.vue` |
| 状态机 | 基线/脏数据/新增/删除/粘贴/导入/保存 | `composables/useProductGrid.ts` |
| 选区 | 矩形选区、扩展、矩阵导出 | `composables/useGridSelection.ts` |
| 剪贴板 | TSV 语义、复制/剪切/粘贴、按键 | `composables/useGridClipboard.ts` |
| 服务端协议 | 分页、3 秒缓存、请求编号 | `composables/useGridQuery.ts` |
| 模型 | 字段、空行、签名、布局修复 | `utils/gridFields.ts` |
| 布局存储 | 按「表格 + 用户」私有化 | `utils/layoutStorage.ts` |
| HOT 适配 | 渲染、虚拟滚动、冻结、编辑、外置滚动条 | `components/grid/ExcelGrid.vue` |

判据同原文档：**一个函数如果既读行数据又改布局，它放错了层。**

## 2. 三份数据

```
服务端页（只读快照）
  → rows      （唯一编辑源，含末尾草稿行）
baseline      （id → 业务签名 + 原始行）
  ├─ dirty / summary
  ├─ 删除集合 = baseline − 当前非空行
  └─ discard = 用 baseline 重建
```

- `rowSignature()` 只序列化业务字段，**排除 id/owner/createdAt/updatedAt**——服务端回写
  这些字段后不会误判成「已修改」。
- 空白行只存在于 `rows`，不进 baseline、不计 dirty、不保存、不可删除。
- 行 id 由客户端生成（`p_<ts>_<rand>`），因此新增行保存后不需要重取列表——原文档里
  为「服务端分配 Id 后需 reload」准备的那条路径在这里不存在。

## 3. 约束对照

| # | 约束 | 落点 |
|---|---|---|
| C1 | 源数据 getter 返回副本，写回用 setter | `cloneRow()`；`applySavedRows()` 整体替换 `row.fields` |
| C2 | 空白草稿行不算数据 | `isBlankRow()`；`collectChanges()` 首行跳过 |
| C3 | 草稿行与空行判定成对，加载传克隆 | `ensureDraftRows()` + `applyServerRows()` 的 `cloneRow` |
| C4 | 四条写入路径都过 `canEdit` | `setCell` / `applyPaste` / `importRecords` / `savePage`(writableRows) |
| C5 | 批量保存一次请求 | `savePage()` → 单个 `POST /api/products/batch` |
| C6 | 删除集合 = 基线 − 现存；补删幂等 | `collectChanges()`；`compensateDeletions()` ≤ 3 次 |
| C7 | 异步前后校验身份/请求号 | `identity() !== stamp`；`useGridQuery` 的 `requestNumber` |
| C8 | 列变更后二次补配置 | 自研表格无此问题；`adoptLayout()` 重建列模型后由 canvas 宽度驱动重排 |
| C9 | 滚动条单向读主表 | `ExcelGrid.onScroll` 只读；`scrollBy()` 是唯一写入点 |
| C10 | 右冻结渲染全列 | 不做横向虚拟化，全列常驻；右冻结用 `position: sticky` |
| C11 | 布局只影响展示 | 保存 DTO 直接取 `row.fields` 全量，含隐藏列 |
| C12 | 字典缓存 TTL + generation + 强刷 | **不适用**：本系统无可变字典，类目/平台为静态常量 |
| C13 | 纯修改不整页刷新 | `needsReload = added > 0 \|\| deleted > 0` |
| C14 | 单行保存静默 + 行级 loading | `saveOne()` 不进 `mutating`；行号列 hover 出现 ✓ 按钮 |
| C15 | 粘贴先整块校验再一次写入 | `applyPaste()` 先 normalize 全块，有错则零写入 |
| C16 | 空白行永不 dirty | `refreshSummary()` 前置过滤 |
| C17 | 卸载清理 timer/listener/实例 | 两个 composable 的 `onBeforeUnmount`；拖拽 cleanup |
| C18 | `summary` 只由 `refreshSummary` 改 | `useProductGrid` 内唯一赋值点 |

未采纳的项：**`getComplete()` 多页完整快照重分页**。该能力要求「某组页连续、总数一致、
Id 不重复」才可信任，本系统按 100 行/页直连服务端，重建快照带来的收益小于其出错面，
因此只做「单页 3 秒缓存 + 请求编号」，不假装知道没读过的页。

## 4. 数据契约

```http
GET /api/products?page=1&pageSize=100&q=关键词
→ { items: Row[], totalItems, currentPage, itemsPerPage, totalPages,
    tableMissing?, ephemeral? }

POST /api/products/batch          # 需要登录
{ items: [{ id, fields }], deletedIds: [...] }
→ { saved: Row[], deleted: string[], rejected: [{ id, reason }] }
```

- **删除幂等**：删除不存在的 id 返回成功，这是客户端补删重试的前提。
- **整行接受或整行拒绝**：单行校验失败进 `rejected`，不会写半行。
- **所有权**：非管理员只能写自己创建的行；越权写进 `rejected`，越权删静默无效。
- `tableMissing: true` 表示迁移未执行，页面顶部给出提示而不是 500。

字段集非固定：核心 8 列（title/sku/category/price/currency/moq/supplier/description），
上传文件里多出来的表头会作为「上传列」追加到末尾（上限 20 列）。

## 5. 运行与迁移

```bash
npm --prefix frontend ci
npm --prefix backend ci
npx wrangler d1 migrations apply rag-listing-copilot   # 建 supplier_products 表
npm run dev                                            # 前端 5175 / 后端 3001
```

本地 Express 没有 D1，商品表走进程内存（`ephemeral: true`，工具栏显示「内存模式」），
接口契约与生产一致；重启即清空。生产走 D1。

## 6. 验收清单

**首帧**：首屏只有一段 loading，表头与草稿行先于数据出现，无高度跳变。

**草稿/新增**：末尾多个空行时点新增仍可见；空白行不计 dirty；导入不落在草稿下方。

**粘贴**：3×4 粘贴行列对齐；含制表符/换行/引号的内容完整；超出当前行数自动补行；
只读行跳过并计数；单元格编辑器内 Ctrl+V 不被劫持；整块有错时零写入并提示首个问题。

**保存/删除**：单行保存不遮全表、只有该行转圈；纯修改保存后不闪屏；新增/删除后刷新；
服务端部分删除能补删（≤3 次）；保存期间其他单元格只读。

**分页**：有脏数据翻页时三选一（保存并翻页 / 放弃并翻页 / 取消）；取消后页码不动；
搜索走 320ms 防抖并回到第 1 页；3 秒内重复查询不重复请求。

**布局**：隐藏/重排/左右冻结刷新后保持；左右冻结合计不超过可见列数；隐藏列仍保存、
仍参与复制映射；「存为我的默认」只影响当前账号。

**权限**：未登录只读；非创建人只读且粘贴跳过；新增行归当前用户。

## 7. 已知限制

- 行高固定 30px，长文本省略号显示（固定行高是虚拟滚动与冻结位移的前提）。
- 粘贴上限 1MB；超过抛 `TsvError('too-large')` 并提示，不静默截断。
- 数字规范化只处理「货币符号/单位后缀/千分位」；欧洲式 `1.234,50` 会判为非法而不是猜。
- 无自定义右键菜单：浏览器原生菜单的复制/粘贴会触发同一套捕获处理，功能不缺。
- 多标签同时编辑同一页时不做实时协同，后保存者覆盖。
