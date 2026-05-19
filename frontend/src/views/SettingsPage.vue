<script setup lang="ts">
import { ref } from 'vue'
import type { LLMProvider } from '@/types/config'
import { message } from 'ant-design-vue'

const providers = ref<LLMProvider[]>([
  {
    id: 1,
    name: 'DeepSeek',
    api_base: 'https://api.deepseek.com/v1',
    default_model: 'deepseek-v4-flash',
    is_enabled: true
  },
  {
    id: 2,
    name: '豆包 (Doubao)',
    api_base: 'https://ark.cn-beijing.volces.com/api/v3',
    default_model: 'seed-2.0-mini',
    is_enabled: true
  }
])

const loading = ref(false)
void loading

async function toggleProvider(id: number) {
  const p = providers.value.find(x => x.id === id)
  if (p) {
    p.is_enabled = !p.is_enabled
    message.success(`${p.name} ${p.is_enabled ? '已启用' : '已禁用'}`)
  }
}
</script>

<template>
  <div class="settings">
    <h2 class="page-title">LLM 服务商配置</h2>
    <p class="page-desc">管理 AI 模型服务商连接与 API 密钥</p>

    <div class="provider-list">
      <div
        v-for="p in providers"
        :key="p.id"
        class="provider-card"
      >
        <div class="provider-info">
          <div class="provider-header">
            <span class="provider-name">{{ p.name }}</span>
            <span :class="['provider-status', { enabled: p.is_enabled }]">
              {{ p.is_enabled ? '已启用' : '已禁用' }}
            </span>
          </div>
          <div class="provider-detail">
            <span class="detail-label">端点</span>
            <span class="detail-value">{{ p.api_base }}</span>
          </div>
          <div class="provider-detail">
            <span class="detail-label">默认模型</span>
            <span class="detail-value mono">{{ p.default_model }}</span>
          </div>
        </div>
        <div class="provider-actions">
          <button
            :class="['toggle-btn', { on: p.is_enabled }]"
            @click="toggleProvider(p.id)"
          >
            {{ p.is_enabled ? '禁用' : '启用' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings {
  max-width: 720px;
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
  margin-bottom: 28px;
}

.provider-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.provider-card {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition:
    border-color var(--duration-slow) var(--ease-out),
    box-shadow var(--duration-slow) var(--ease-out);
}

.provider-card::before {
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

.provider-card:hover::before {
  transform: translateX(0);
}

.provider-card:hover {
  border-color: var(--border-strong);
  box-shadow: 0 0 24px var(--accent-glow);
}

.provider-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.provider-name {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  color: var(--emphasis);
}

.provider-status {
  font-size: var(--fs-xs);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--status-red-bg);
  color: var(--status-red);
}

.provider-status.enabled {
  background: var(--status-green-bg);
  color: var(--status-green);
}

.provider-detail {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  font-size: var(--fs-sm);
}

.detail-label {
  color: var(--text-tertiary);
  min-width: 60px;
}

.detail-value {
  color: var(--text-secondary);
}

.detail-value.mono {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
}

.toggle-btn {
  padding: 8px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text-secondary);
  font-family: var(--font-sans);
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  cursor: pointer;
  transition:
    background var(--duration-fast),
    color var(--duration-fast),
    border-color var(--duration-fast);
}

.toggle-btn:hover {
  background: var(--emphasis-dim);
  color: var(--emphasis);
}

.toggle-btn.on {
  border-color: var(--accent);
  color: var(--accent-bright);
}

.toggle-btn.on:hover {
  background: var(--accent-dim);
}
</style>
