<script setup lang="ts">
import { useRoute } from 'vue-router'
import { computed } from 'vue'
import { BellOutlined, SearchOutlined } from '@ant-design/icons-vue'

const route = useRoute()
const pageTitle = computed(() => route.meta.title as string || 'Kaufland Sync')
</script>

<template>
  <header class="header">
    <div class="header-left">
      <h1 class="page-title">{{ pageTitle }}</h1>
    </div>
    <div class="header-right">
      <button class="header-btn">
        <SearchOutlined />
      </button>
      <button class="header-btn">
        <BellOutlined />
        <span class="badge">3</span>
      </button>
      <div class="user-avatar">KS</div>
    </div>
  </header>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--header-height);
  padding: 0 28px;
  background: var(--bg-overlay);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
}

.page-title {
  font-family: var(--font-sans);
  font-size: var(--fs-xl);
  font-weight: var(--fw-semibold);
  color: var(--emphasis);
  letter-spacing: -0.01em;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-btn {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background var(--duration-fast),
    color var(--duration-fast);
}

.header-btn:hover {
  background: var(--emphasis-dim);
  color: var(--emphasis);
}

.badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--status-red);
  color: #fff;
  font-family: var(--font-sans);
  font-size: 10px;
  font-weight: var(--fw-semibold);
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-avatar {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: var(--emphasis);
  font-family: var(--font-sans);
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 8px;
  letter-spacing: -0.02em;
}
</style>
