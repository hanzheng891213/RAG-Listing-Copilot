<script setup lang="ts">
import { ref } from 'vue'
import { TranslationOutlined } from '@ant-design/icons-vue'

const inputText = ref('')
const outputText = ref('')
const generating = ref(false)
const seoScore = ref<number | null>(null)

function generate() {
  // Phase 7: SSE streaming localization
  generating.value = true
}
</script>

<template>
  <div class="localization">
    <h2 class="page-title">德语本土化</h2>
    <p class="page-desc">AI 驱动的 SEO 优化德语商品描述生成</p>

    <div class="l10n-grid">
      <div class="input-panel">
        <div class="panel-header">
          <span class="panel-label">中文输入</span>
        </div>
        <textarea
          v-model="inputText"
          class="input-area"
          placeholder="输入商品中文标题 / 描述..."
        />
        <button
          class="generate-btn"
          :disabled="!inputText.trim() || generating"
          @click="generate"
        >
          <TranslationOutlined />
          <span>{{ generating ? '生成中...' : '生成德语描述' }}</span>
        </button>
      </div>

      <div class="output-panel">
        <div class="panel-header">
          <span class="panel-label">德语输出</span>
          <span v-if="seoScore !== null" class="seo-score">
            SEO {{ seoScore }}/100
          </span>
        </div>
        <div class="output-area">
          <p v-if="!outputText" class="placeholder-text">
            德语结果将在此处以打字机效果逐字呈现...
          </p>
          <p v-else class="output-text">{{ outputText }}</p>
        </div>
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

.l10n-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.input-panel,
.output-panel {
  position: relative;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition:
    border-color var(--duration-slow) var(--ease-out);
}

.input-panel::before,
.output-panel::before {
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

.input-panel:hover::before,
.output-panel:hover::before {
  transform: translateX(0);
}

.input-panel:hover,
.output-panel:hover {
  border-color: var(--border-strong);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-light);
}

.panel-label {
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.seo-score {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  color: var(--accent-bright);
  background: var(--accent-dim);
  padding: 2px 10px;
  border-radius: var(--radius-full);
}

.input-area {
  flex: 1;
  min-height: 240px;
  padding: 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: var(--fs-base);
  line-height: var(--lh-relaxed);
  resize: vertical;
  outline: none;
  transition: border-color var(--duration-fast);
}

.input-area:focus {
  border-color: var(--accent);
}

.input-area::placeholder {
  color: var(--text-tertiary);
}

.generate-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 14px;
  padding: 11px 0;
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
    border-color var(--duration-normal) var(--ease-in-out),
    opacity var(--duration-fast);
}

.generate-btn::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--bg-surface);
  transform: translateY(100%);
  transition: transform var(--duration-normal) var(--ease-in-out);
  z-index: 0;
}

.generate-btn:hover:not(:disabled)::after {
  transform: translateY(0);
}

.generate-btn:hover:not(:disabled) {
  color: var(--accent-bright);
  border-color: var(--accent-bright);
}

.generate-btn > * {
  position: relative;
  z-index: 1;
}

.generate-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.output-area {
  flex: 1;
  min-height: 240px;
  padding: 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
}

.placeholder-text {
  color: var(--text-tertiary);
  font-size: var(--fs-sm);
  font-style: italic;
}

.output-text {
  color: var(--text-primary);
  font-size: var(--fs-base);
  line-height: var(--lh-relaxed);
}
</style>
