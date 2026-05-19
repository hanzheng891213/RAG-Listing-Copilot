<script setup lang="ts">
</script>

<template>
  <div class="style-guide">
    <h2 class="page-title">德语风格指南</h2>
    <p class="page-desc">管理德国电商文案风格规则与 SEO 关键词</p>

    <div class="empty-state">
      <p class="empty-text">风格指南管理（Phase 7 集成）</p>
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
