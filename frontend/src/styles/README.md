# 样式结构 / Styles

前端已切到 SCSS。组件的 `<style>` 现在只保留一行 `@use`，真正的样式按组件拆分到
`src/styles/components/`，目录结构与 `src/components`、`src/views` 一一对应。

```
src/styles/
├─ theme.scss              # 全局设计令牌（深色 :root / 亮色 html.light）
├─ global.scss             # reset、滚动条、tooltip、排版
├─ element-override.scss   # Element Plus 变量映射
├─ transitions.scss        # 全局过渡 / keyframes
├─ table/
│  └─ _tokens.scss         # 表格独立配色体系（--table-* 的来源）
└─ components/
   ├─ views/listing-generator.scss
   ├─ views/home-page.scss
   ├─ listing/chat-panel.scss
   ├─ listing/supplier-product-selector.scss
   ├─ listing/listing-tabs.scss
   ├─ grid/excel-grid.scss
   └─ …                    # 其余组件同名文件
```

## 改颜色时看哪里

| 想改的内容 | 文件 |
|---|---|
| 全站背景、文字、主色 | `theme.scss` |
| 商品“未生成 / 已生成”的浅绿、深绿 | `theme.scss` 里的 `--product-idle-*` / `--product-done-*` |
| 表格底色、深灰单元格边框、表头、操作列 | `table/_tokens.scss` |
| 单个面板的局部配色 / 布局 | `components/` 下对应组件的 SCSS |
| Element Plus 控件颜色 | `element-override.scss` |

### 表格颜色

表格在深色、浅色主题下都保持“白纸”观感，因此不使用全站的 `--bg-*` / `--text-*`。
颜色只在 `table/_tokens.scss` 中定义，并由 `excel-grid.scss` 输出为 `--table-*`
自定义属性。单元格边框使用 `$grid-line`（深灰 `#5f6663`），外框/表头分隔使用
`$border-strong`。修改这一个文件即可整体换表格配色。

### 新增组件

1. 在 `src/styles/components/` 下按目录建同名 `.scss`；
2. 在组件里写：

```vue
<style scoped lang="scss">
@use '../../styles/components/<dir>/<name>.scss' as *;
</style>
```

`@use` 必须位于样式块第一行；`scoped`、`:deep()` 仍然照常工作。
