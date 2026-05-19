# Kaufland-Sync: 跨境商品智能上架与合规系统 — Implementation Plan

## Context

Greenfield project to build a RAG-enhanced cross-border e-commerce system that helps Chinese sellers list products on Kaufland (German marketplace). Three core modules: (1) Smart Product Library — auto-extract structured JSON from supplier PDFs/Excels with WYSIWYG mapping UI, (2) German Localization Engine — SEO-optimized German copywriting powered by competitor RAG, (3) Compliance Checker — traffic-light audit against Kaufland policies before listing.

**Tech choices confirmed:**
- LLM: Configurable multi-provider, default DeepSeek V4 Flash (generation) + 豆包 seed-2.0-mini (translation)
- RAG: LangChain primary orchestration, LlamaIndex for document parsing/indexing
- Vector DB: ChromaDB (embedded, lightweight)
- Feedback loop: Store corrections in SQLite, periodic re-index script

---

## 1. Project Directory Structure

```
RAG-Listing-Copilot/
├── docker-compose.yml
├── backend/
│   ├── requirements.txt
│   ├── .env.example
│   ├── config/
│   │   └── providers.yaml              # Seed LLM provider configs
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                     # FastAPI entry, CORS, lifespan
│   │   ├── config.py                   # Pydantic Settings
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── router.py               # APIRouter aggregator
│   │   │   ├── documents.py            # /api/v1/documents/*
│   │   │   ├── products.py             # /api/v1/products/*
│   │   │   ├── localization.py         # /api/v1/localization/*
│   │   │   ├── compliance.py           # /api/v1/compliance/*
│   │   │   ├── feedback.py             # /api/v1/feedback/*
│   │   │   └── config_api.py           # /api/v1/config/*
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── document_parser.py      # PDF/Word/Excel parsing
│   │   │   ├── chunker.py              # LangChain text splitter
│   │   │   ├── embedding.py            # Embedding service (provider-aware)
│   │   │   ├── llm_factory.py          # Multi-provider LLM factory
│   │   │   └── streaming.py            # SSE response helpers
│   │   ├── rag/
│   │   │   ├── __init__.py
│   │   │   ├── base.py                 # BaseRAGPipeline (abstract)
│   │   │   ├── product_rag.py          # Product extraction pipeline
│   │   │   ├── localization_rag.py     # German localization pipeline
│   │   │   └── compliance_rag.py       # Compliance checking pipeline
│   │   ├── db/
│   │   │   ├── __init__.py
│   │   │   ├── chroma.py               # ChromaDB singleton + CRUD
│   │   │   ├── sqlite.py               # SQLAlchemy async engine
│   │   │   └── models.py               # 7 ORM models
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── document.py
│   │   │   ├── product.py
│   │   │   ├── localization.py
│   │   │   ├── compliance.py
│   │   │   ├── feedback.py
│   │   │   └── config.py
│   │   └── services/
│   │       ├── __init__.py
│   │       ├── document_service.py
│   │       ├── product_service.py
│   │       ├── localization_service.py
│   │       ├── compliance_service.py
│   │       └── feedback_service.py
│   ├── data/
│   │   ├── chroma/                     # ChromaDB persistence
│   │   ├── uploads/                    # Raw uploaded files
│   │   └── feedback.db                 # SQLite database
│   ├── knowledge/
│   │   ├── de_style_guide/             # German e-commerce style seeds
│   │   │   ├── style_tone.md
│   │   │   ├── legal_terms.md
│   │   │   └── seo_keywords.csv
│   │   └── kaufland_policy/            # Kaufland rules seeds
│   │       ├── terms_and_conditions.md
│   │       ├── restricted_products.md
│   │       └── compliance_requirements.md
│   ├── scripts/
│   │   ├── reindex_feedback.py
│   │   ├── seed_knowledge_base.py
│   │   └── crawl_competitors.py
│   └── tests/
│       ├── conftest.py
│       ├── test_document_parser.py
│       ├── test_product_service.py
│       ├── test_localization_service.py
│       └── test_compliance_service.py
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   ├── env.d.ts
│   ├── src/
│   │   ├── main.ts
│   │   ├── App.vue
│   │   ├── router/index.ts
│   │   ├── stores/
│   │   │   ├── documentStore.ts
│   │   │   ├── productStore.ts
│   │   │   ├── localizationStore.ts
│   │   │   ├── complianceStore.ts
│   │   │   └── configStore.ts
│   │   ├── api/
│   │   │   ├── client.ts               # Axios instance
│   │   │   ├── documents.ts
│   │   │   ├── products.ts
│   │   │   ├── localization.ts
│   │   │   ├── compliance.ts
│   │   │   └── feedback.ts
│   │   ├── composables/
│   │   │   ├── useSSE.ts               # SSE stream composable
│   │   │   ├── useDocumentParser.ts
│   │   │   └── usePdfViewer.ts
│   │   ├── views/
│   │   │   ├── HomePage.vue
│   │   │   ├── SettingsPage.vue
│   │   │   ├── product/
│   │   │   │   ├── ProductListPage.vue
│   │   │   │   └── DocumentMappingPage.vue
│   │   │   ├── localization/
│   │   │   │   ├── LocalizationPage.vue
│   │   │   │   └── StyleGuidePage.vue
│   │   │   └── compliance/
│   │   │       ├── CompliancePage.vue
│   │   │       └── RuleExplorerPage.vue
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── AppLayout.vue
│   │   │   │   ├── AppHeader.vue
│   │   │   │   └── AppSidebar.vue
│   │   │   ├── document/
│   │   │   │   ├── DocumentUploader.vue
│   │   │   │   ├── PdfHighlightViewer.vue
│   │   │   │   └── ExcelPreviewTable.vue
│   │   │   ├── product/
│   │   │   │   ├── ProductForm.vue
│   │   │   │   ├── AttributeEditor.vue
│   │   │   │   └── ExtractionProgress.vue
│   │   │   ├── localization/
│   │   │   │   ├── TypewriterOutput.vue
│   │   │   │   ├── CompetitorPanel.vue
│   │   │   │   └── SeoScoreBadge.vue
│   │   │   └── compliance/
│   │   │       ├── TrafficLight.vue
│   │   │       ├── ViolationCard.vue
│   │   │       └── RuleSourceLink.vue
│   │   ├── types/
│   │   │   ├── document.ts
│   │   │   ├── product.ts
│   │   │   ├── localization.ts
│   │   │   ├── compliance.ts
│   │   │   └── config.ts
│   │   └── utils/
│   │       ├── formatters.ts
│   │       └── constants.ts
│   └── public/
│       └── favicon.ico
```

---

## 2. Storage Schema

### 2.1 ChromaDB Collections (4)

| Collection | Purpose | Chunking |
|---|---|---|
| `product_documents` | Chunks from uploaded supplier PDFs/Excels | chunk_size=800, overlap=150 |
| `de_style_guide` | German e-commerce style rules | chunk_size=500, overlap=50 |
| `competitor_listings` | Top German competitor descriptions | chunk_size=600, overlap=100 |
| `kaufland_policies` | Kaufland T&C + restricted products | chunk_size=800, overlap=150 |

### 2.2 SQLite Tables (7)

- **documents** — id, filename, file_type, file_path, parse_status, page_count, chunk_count, error_message, timestamps
- **products** — id, document_id(FK), title_cn, title_de, description_cn, description_de, attributes(JSON), status, extraction_refs, timestamps
- **localizations** — id, product_id(FK), input_cn, output_de, output_html, competitor_refs, style_refs, seo_score, model_name, token_count, timestamps
- **compliance_checks** — id, product_id(FK), overall_status(green/yellow/red), violations(JSON), policy_refs, weee_mark, ce_mark, timestamps
- **feedback** — id, product_id(FK), document_id(FK), module, field_name, original_value, corrected_value, context_chunks, timestamps
- **generation_logs** — id, product_id(FK), module, provider, model_name, prompt_tokens, completion_tokens, total_tokens, latency_ms, timestamps
- **llm_providers** — id, name(unique), api_base, api_key_encrypted, default_model, is_enabled, extra_config, timestamps

---

## 3. API Endpoints (all under `/api/v1/`)

### Documents
- `POST /documents/upload` — multipart upload
- `GET /documents/` — list with filters
- `GET /documents/{id}` — detail + raw text
- `DELETE /documents/{id}` — cascade delete
- `POST /documents/{id}/parse` — async parse → chunk → embed
- `GET /documents/{id}/chunks` — list chunks from ChromaDB

### Products
- `GET /products/` — paginated list with filters
- `GET /products/{id}` — detail with extraction refs
- `POST /products/` — manual create
- `PUT /products/{id}` — update
- `POST /products/extract` — RAG extraction from document
- `GET /products/{id}/references` — chunk IDs for PDF highlighting

### Localization
- `POST /localization/generate` — SSE streaming generation
- `POST /localization/regenerate` — SSE streaming with history
- `GET /localization/history/{product_id}` — past generations

### Compliance
- `POST /compliance/check/{product_id}` — run compliance scan
- `GET /compliance/check/{check_id}` — get check result
- `GET /compliance/rules/` — search policy rules
- `POST /compliance/rules/upload` — add policy document

### Feedback
- `POST /feedback/` — record correction
- `GET /feedback/` — list with filters
- `POST /feedback/reindex` — trigger re-indexing job

### Config
- `GET/POST/PUT /config/llm-providers` — CRUD for LLM providers
- `GET /config/health` — service health check

---

## 4. Frontend Routes

| Path | View | Module |
|---|---|---|
| `/` | HomePage | Dashboard |
| `/products` | ProductListPage | Product Library |
| `/products/:id/mapping` | DocumentMappingPage | WYSIWYG Mapping |
| `/localization` | LocalizationPage | Localization |
| `/localization/style-guide` | StyleGuidePage | Style Guide Mgmt |
| `/compliance` | CompliancePage | Compliance Checker |
| `/compliance/rules` | RuleExplorerPage | Policy Browser |
| `/settings` | SettingsPage | LLM Config |

---

## 5. RAG Pipeline Design

### 5.1 BaseRAGPipeline (abstract)
```
retrieve(query, k) → ChromaDB.query()
build_prompt(query, chunks) → str
generate(prompt, provider) → LLM.ainvoke()
run(query) → retrieve → build_prompt → generate
```

### 5.2 Product Extraction Pipeline
```
Document chunks → Build extraction prompt → LLM(DeepSeek) → Parse JSON
→ { title_cn, description_cn, attributes: {}, warning_keywords: [] }
→ Store in products table + return with chunk IDs
```

### 5.3 Localization Pipeline (Streaming)
```
Chinese input → Extract German keywords → Parallel retrieve:
  - competitor_listings collection
  - de_style_guide collection
→ Build localization prompt → LLM(豆包).astream() → SSE token stream
→ Compute SEO score → Save to localizations table
```

### 5.4 Compliance Pipeline
```
Product data → Build query → Retrieve kaufland_policies collection (k=10)
→ Build compliance prompt → LLM(DeepSeek) → Parse JSON
→ { overall_status, violations[], required_marks[], missing_marks[] }
→ Save to compliance_checks table
```

---

## 6. Key Design Decisions

### LLM Factory (`backend/app/core/llm_factory.py`)
- Factory pattern with provider registry in SQLite + YAML fallback
- All providers use `langchain_openai.ChatOpenAI` with custom `base_url` (most Chinese LLMs expose OpenAI-compatible APIs)
- Cached per provider+model key
- Seeds: DeepSeek (deepseek-v4-flash for generation), 豆包 (seed-2.0-mini for translation)

### Streaming (Typewriter Effect)
- SSE (Server-Sent Events) via FastAPI `StreamingResponse`
- Frontend `useSSE.ts` composable: `fetch()` + `ReadableStream` reader → reactive `outputText` ref
- Events: `chunk {token}`, `meta {seo_score, refs}`, `done {output_de, output_html, id}`

### Feedback Loop (RLHF-lite)
- User corrections stored in SQLite `feedback` table
- `scripts/reindex_feedback.py` embeds corrected values → upserts into `feedback_examples` ChromaDB collection
- Future extractions include feedback context in prompt: "Previous corrections: ..."

### WYSIWYG Mapping (DocumentMappingPage.vue)
- Left panel: pdf.js renders PDF pages, overlays highlighted text spans tied to chunks
- Right panel: Auto-filled ProductForm (title, description, attributes)
- Click chunk → scrolls to corresponding form field

---

## 7. Implementation Phases (9 phases)

### Phase 1: Project Scaffold
- Backend: FastAPI app, CORS, config skeleton, empty routers
- Frontend: Vite + Vue 3 + TS + Pinia + Ant Design Vue + router
- Verify: "Hello World" API call frontend → backend

### Phase 2: LLM Factory + Config + Database
- `llm_factory.py` with DeepSeek + 豆包 defaults
- SQLite engine + all 7 ORM models
- Config API endpoints (CRUD LLM providers)
- Frontend: Axios client, configStore, SettingsPage.vue

### Phase 3: Document Upload + Parse Pipeline
- `document_parser.py` — PDF (pypdf/unstructured), Excel (openpyxl), Word (python-docx)
- `chunker.py` — `RecursiveCharacterTextSplitter`
- Document upload/list/parse API endpoints
- Frontend: DocumentUploader.vue, documentStore

### Phase 4: ChromaDB Integration + Embedding
- `chroma.py` — ChromaDB singleton, collection CRUD
- `embedding.py` — EmbeddingService (provider-aware)
- Integrate: Parse → Chunk → Embed → ChromaDB upsert
- `seed_knowledge_base.py` — ingest style guide + policy seeds

### Phase 5: Product Library RAG
- `rag/base.py` — BaseRAGPipeline
- `rag/product_rag.py` — ProductExtractionPipeline
- Product CRUD API + extract endpoint
- Frontend: ProductListPage, DocumentMappingPage (WYSIWYG with pdf.js)

### Phase 6: Feedback Loop
- Feedback API + feedback_service
- `reindex_feedback.py` script
- Integrate feedback into product extraction prompt

### Phase 7: Localization RAG
- `streaming.py` — SSE utilities
- `rag/localization_rag.py` — LocalizationPipeline (streaming)
- Localization API with SSE streaming
- Frontend: useSSE composable, TypewriterOutput, CompetitorPanel, SeoScoreBadge

### Phase 8: Compliance RAG
- `rag/compliance_rag.py` — CompliancePipeline
- Compliance API endpoints
- Frontend: TrafficLight, ViolationCard, RuleSourceLink, RuleExplorerPage

### Phase 9: Polish + Integration
- AppLayout with navigation sidebar
- HomePage dashboard with stats
- Error handling, graceful degradation
- E2E flow: Upload → Extract → Correct → Localize → Check Compliance

---

## 8. Verification Plan

1. **Phase 1**: `curl http://localhost:8000/api/v1/config/health` → 200; frontend dev server loads AppLayout
2. **Phase 2**: POST new provider via API → GET returns it; Settings page can add/remove providers
3. **Phase 3**: Upload PDF → document row created → parse status progresses to `completed` → raw text returned
4. **Phase 4**: Upload doc → chunks stored in ChromaDB → query via chunks endpoint returns results
5. **Phase 5**: Upload supplier PDF → click Extract → right panel populates with structured JSON → left panel shows highlighted PDF text
6. **Phase 6**: Correct a field → feedback saved → run reindex → next extraction of similar doc shows improved output
7. **Phase 7**: Enter Chinese text → click Generate → German text streams character by character → competitor references shown → SEO score displayed
8. **Phase 8**: Select product → run compliance check → traffic light shows green/yellow/red → violations listed with rule citations
9. **Phase 9**: Full flow: upload doc → extract → correct field → localize title → check compliance → all modules linked via sidebar
