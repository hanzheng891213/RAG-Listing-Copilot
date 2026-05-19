<script setup lang="ts">
import { ref } from 'vue'
import { PlusOutlined } from '@ant-design/icons-vue'

const products = ref<any[]>([])
void products
const loading = ref(false)
void loading
</script>

<template>
  <div class="product-list">
    <div class="page-header">
      <div>
        <h2 class="page-title">商品库</h2>
        <p class="page-desc">管理从供应商文档中提取的商品信息</p>
      </div>
      <button class="btn-primary">
        <PlusOutlined />
        <span>上传文档</span>
      </button>
    </div>

    <div class="empty-state">
      <div class="empty-icon">
        <InboxOutlined />
      </div>
      <h3 class="empty-title">暂无商品</h3>
      <p class="empty-desc">上传供应商 PDF / Excel / Word 文档开始提取商品信息</p>
    </div>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 28px;
}

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
}

.btn-primary {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: var(--radius-md);
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--emphasis);
  font-family: var(--font-sans);
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  cursor: pointer;
  overflow: hidden;
  transition:
    color var(--duration-normal) var(--ease-in-out),
    border-color var(--duration-normal) var(--ease-in-out);
}

.btn-primary::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--bg-surface);
  transform: translateY(100%);
  transition: transform var(--duration-normal) var(--ease-in-out);
  z-index: 0;
}

.btn-primary:hover::after {
  transform: translateY(0);
}

.btn-primary:hover {
  color: var(--accent-bright);
  border-color: var(--accent-bright);
}

.btn-primary > * {
  position: relative;
  z-index: 1;
}

/* ── Empty State ── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  color: var(--text-tertiary);
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-title {
  font-size: var(--fs-lg);
  font-weight: var(--fw-semibold);
  color: var(--text-secondary);
}

.empty-desc {
  margin-top: 6px;
  font-size: var(--fs-sm);
  color: var(--text-tertiary);
  max-width: 360px;
}
</style>
