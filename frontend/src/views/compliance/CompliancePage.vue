<script setup lang="ts">
import { ref } from 'vue'
import { SafetyOutlined } from '@ant-design/icons-vue'

const overallStatus = ref<'green' | 'yellow' | 'red' | null>(null)
void overallStatus
const violations = ref<any[]>([])
void violations
</script>

<template>
  <div class="compliance">
    <h2 class="page-title">合规检查</h2>
    <p class="page-desc">基于 Kaufland 政策对商品进行合规性审计</p>

    <div class="empty-state">
      <div class="empty-icon">
        <SafetyOutlined />
      </div>
      <h3 class="empty-title">选择商品开始合规检查</h3>
      <p class="empty-desc">系统将自动检索 Kaufland 政策条款并对商品进行红黄绿灯审查</p>
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
  max-width: 400px;
}
</style>
