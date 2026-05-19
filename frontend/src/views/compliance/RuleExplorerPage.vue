<script setup lang="ts">
</script>

<template>
  <div class="rule-explorer">
    <h2 class="page-title">政策浏览器</h2>
    <p class="page-desc">浏览与搜索 Kaufland 平台政策条款</p>

    <div class="empty-state">
      <p class="empty-text">政策浏览（Phase 8 集成 ChromaDB 政策检索）</p>
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
  align-items: center;
  justify-content: center;
  padding: 80px 0;
}

.empty-text {
  color: var(--text-tertiary);
  font-size: var(--fs-sm);
}
</style>
