<script setup lang="ts">
</script>

<template>
  <div class="mapping">
    <h2 class="page-title">文档映射</h2>
    <p class="page-desc">WYSIWYG 商品字段与原始文档区域映射</p>

    <div class="mapping-layout">
      <div class="pdf-panel">
        <div class="panel-label">PDF 原文</div>
        <div class="panel-placeholder">PDF 高亮查看器（Phase 5 集成 pdf.js）</div>
      </div>
      <div class="form-panel">
        <div class="panel-label">商品表单</div>
        <div class="panel-placeholder">自动提取的产品表单（Phase 5 集成）</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-title {
  font-family: var(--font-sans);
  font-size: var(--fs-2xl);
  font-weight: var(--fw-bold);
  color: var(--emphasis);
  letter-spacing: -0.02em;
}

.page-desc {
  margin-top: 4px;
  font-size: var(--fs-base);
  color: var(--text-secondary);
  margin-bottom: 28px;
}

.mapping-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  height: calc(100vh - 200px);
}

.pdf-panel,
.form-panel {
  position: relative;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition:
    border-color var(--duration-slow) var(--ease-out);
}

.pdf-panel::before,
.form-panel::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: linear-gradient(to right, transparent, var(--accent-dim), transparent);
  transform: translateX(-100%);
  transition: transform 0.6s var(--ease-out);
}

.pdf-panel:hover::before,
.form-panel:hover::before {
  transform: translateX(0);
}

.pdf-panel:hover,
.form-panel:hover {
  border-color: var(--border-strong);
}

.panel-label {
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-light);
}

.panel-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: var(--fs-sm);
}
</style>
