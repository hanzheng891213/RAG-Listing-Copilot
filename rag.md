个人技术栈展示项目，结合RAG技术解决跨境电商上架痛点

核心功能：从供应商商品信息自动生成符合国外平台规范的上架信息

二、技术栈规划
前端技术栈
1. 核心框架
   - Vue 3.4+ (Composition API)
   - Vite 5.0+ (构建工具)
   - TypeScript 5.0+ (类型安全)

2. UI组件库
   - Element Plus 2.4+ (快速搭建界面)
   - @element-plus/icons-vue (图标库)

3. 状态管理
   - Pinia 2.1+ (轻量级状态管理)

4. HTTP客户端
   - Axios 1.6+ (HTTP请求)
   - 使用Mock Service Worker (MSW) 开发阶段模拟API

5. 代码质量
   - ESLint 8.5+ (代码规范)
   - Prettier 3.0+ (代码格式化)
   - Husky + lint-staged (Git hooks)

6. 工具库
   - dayjs (日期处理)
   - lodash-es (工具函数)
   - marked (Markdown渲染)
   - vue-i18n (国际化-可选)
后端技术栈
1. 服务端
   - Node.js 20+ (运行时)
   - Express 4.18+ (轻量级Web框架)
   - TypeScript (后端类型支持)

2. 大模型集成
   - @deepseek-v4 flash
3. 向量数据库/知识库
   - 使用LanceDB + 本地向量存储 (无需外部服务)
   - 或简单JSON文件存储+语义搜索 (简化版本)
   - 或使用ChromaDB (轻量级本地向量库)

4. 数据处理
   - cheerio (HTML解析)
   - mammoth (Word解析)
   - pdf-parse (PDF解析)
项目架构设计
RAG-listing-copilot/
├── frontend/                    # 前端项目
│   ├── src/
│   │   ├── api/                # API接口
│   │   ├── assets/             # 静态资源
│   │   ├── components/         # 公共组件
│   │   │   ├── layout/        # 布局组件
│   │   │   ├── supplier/      # 供应商相关组件
│   │   │   ├── listing/       # Listing生成组件
│   │   │   └── knowledge/     # 知识库管理组件
│   │   ├── composables/       # Composition API逻辑
│   │   │   ├── useListingGenerator.ts
│   │   │   ├── useSupplierParser.ts
│   │   │   └── useKnowledgeBase.ts
│   │   ├── router/            # 路由配置
│   │   ├── stores/            # Pinia Store
│   │   ├── styles/            # 全局样式
│   │   └── views/             # 页面组件
│   │       ├── Home.vue       # 首页
│   │       ├── SupplierUpload.vue
│   │       ├── ListingGenerator.vue
│   │       └── KnowledgeBase.vue
│   └── vite.config.ts
│
├── backend/                    # 后端项目
│   ├── src/
│   │   ├── services/          # 业务服务
│   │   │   ├── deepseek/     # DeepSeek服务
│   │   │   ├── rag/          # RAG服务
│   │   │   └── parser/       # 文档解析服务
│   │   ├── controllers/      # 控制器
│   │   ├── utils/           # 工具函数
│   │   ├── knowledge/       # 知识库文件
│   │   └── types/           # TypeScript类型定义
│   ├── server.ts            # 主入口
│   └── tsconfig.json
│
└── shared/                   # 共享代码
    └── types/               # 共享类型定义
功能模块详细规划
1. 供应商信息上传模块

文件上传：支持Excel/CSV/TXT文件上传

表单输入：手动输入商品信息

智能解析：自动提取商品标题、描述、规格、价格等字段

预览编辑：上传后可预览和编辑提取的数据

2. 知识库管理模块
RAG知识库设计：
1. 平台规范文档
   - Amazon/Shopify/eBay等平台的上架规范
   - 违禁词库、敏感词过滤规则
   - 分类审核要求文档
   
2. 行业模板库
   - 不同类目的优秀Listing模板
   - 五点描述最佳实践示例
   - SEO关键词优化建议
   
3. 历史优化记录
   - 成功上架的Listing存档
   - 被拒绝案例及修改方案
3. 智能生成模块

Listing生成：自动生成英文标题、五点描述、详细描述

合规检查：基于知识库检查违禁内容

SEO优化：自动建议相关关键词

批量处理：支持多商品同时生成

版本管理：保存历史生成记录

4. 预览导出模块

实时预览：WYSIWYG编辑器

多平台预览：模拟不同平台显示效果

导出功能：导出为CSV/JSON格式

模板应用：应用不同的Listing模板
五、API接口设计
typescript
// 后端API设计
POST /api/upload-supplier  // 上传供应商文件
POST /api/parse-supplier   // 解析供应商信息
POST /api/generate-listing // 生成Listing
POST /api/check-compliance // 合规检查
GET  /api/templates        // 获取模板
GET  /api/knowledge/search // 知识库检索
POST /api/export-listing   // 导出Listing
六、核心实现逻辑
1. RAG工作流
1. 供应商信息 → 文本提取 → 结构化数据
2. 结构化数据 + 关键词 → 知识库检索 → 相关文档
3. 商品信息 + 相关文档 → 提示词工程 → DeepSeek API
4. DeepSeek响应 → 后处理 → 合规检查 → 最终Listing