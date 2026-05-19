<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  InboxOutlined,
  TranslationOutlined,
  SafetyOutlined,
  FileTextOutlined,
  ArrowRightOutlined
} from '@ant-design/icons-vue'
import { useRouter } from 'vue-router'

const router = useRouter()

interface StatCard {
  key: string
  label: string
  value: string
  sub: string
  icon: any
  route: string
  accent: string
}

const stats = ref<StatCard[]>([
  {
    key: 'products',
    label: '商品总数',
    value: '--',
    sub: '已提取 / 待处理',
    icon: InboxOutlined,
    route: '/products',
    accent: 'var(--accent-bright)'
  },
  {
    key: 'localization',
    label: '已本土化',
    value: '--',
    sub: '德语版本已生成',
    icon: TranslationOutlined,
    route: '/localization',
    accent: 'var(--status-green)'
  },
  {
    key: 'compliance',
    label: '合规通过率',
    value: '--',
    sub: '绿色 / 总计',
    icon: SafetyOutlined,
    route: '/compliance',
    accent: 'var(--status-yellow)'
  },
  {
    key: 'documents',
    label: '文档数量',
    value: '--',
    sub: '已解析 / 已上传',
    icon: FileTextOutlined,
    route: '/products',
    accent: 'var(--text-secondary)'
  }
])

onMounted(() => {
  // TODO: fetch real stats from API

  // IntersectionObserver fallback for scroll-driven reveal
  if (!CSS.supports('animation-timeline: view()')) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed')
          }
        })
      },
      { threshold: 0.1 }
    )

    document.querySelectorAll('.stat-card, .quick-card').forEach((el) => {
      observer.observe(el)
    })
  }
})

function goRoute(path: string) {
  router.push(path)
}
</script>

<template>
  <div class="home">
    <div class="hero">
      <h2 class="hero-title">跨境智能上架系统</h2>
      <p class="hero-desc">
        RAG 驱动的商品信息提取、德语本土化与 Kaufland 合规检查一站式工作台
      </p>
    </div>

    <div class="stat-grid">
      <div
        v-for="s in stats"
        :key="s.key"
        class="stat-card"
        @click="goRoute(s.route)"
      >
        <div class="stat-head">
          <span class="stat-icon" :style="{ color: s.accent }">
            <component :is="s.icon" />
          </span>
          <ArrowRightOutlined class="stat-arrow" />
        </div>
        <div class="stat-value" :style="{ color: s.accent }">{{ s.value }}</div>
        <div class="stat-label">{{ s.label }}</div>
        <div class="stat-sub">{{ s.sub }}</div>
      </div>
    </div>

    <div class="quick-section">
      <h3 class="section-title">快速开始</h3>
      <div class="quick-grid">
        <div class="quick-card" @click="goRoute('/products')">
          <div class="quick-card-icon">
            <InboxOutlined />
          </div>
          <div class="quick-card-text">
            <span class="quick-card-title">上传供应商文档</span>
            <span class="quick-card-desc">PDF / Excel / Word → 结构化商品数据</span>
          </div>
        </div>
        <div class="quick-card" @click="goRoute('/localization')">
          <div class="quick-card-icon">
            <TranslationOutlined />
          </div>
          <div class="quick-card-text">
            <span class="quick-card-title">德语本土化生成</span>
            <span class="quick-card-desc">AI 驱动 SEO 优化的德语商品描述</span>
          </div>
        </div>
        <div class="quick-card" @click="goRoute('/compliance')">
          <div class="quick-card-icon">
            <SafetyOutlined />
          </div>
          <div class="quick-card-text">
            <span class="quick-card-title">合规检查</span>
            <span class="quick-card-desc">Kaufland 政策红线自动审查</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home {
  max-width: 1100px;
}

/* ── Hero ── */
.hero {
  position: relative;
  margin-bottom: 36px;
}

.hero::before {
  content: '';
  position: absolute;
  top: -80px;
  right: -40px;
  width: 360px;
  height: 360px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%);
  pointer-events: none;
}

.hero-title {
  font-family: var(--font-sans);
  font-size: var(--fs-3xl);
  font-weight: var(--fw-bold);
  color: var(--emphasis);
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.hero-desc {
  margin-top: 8px;
  font-size: var(--fs-md);
  color: var(--text-secondary);
  line-height: var(--lh-relaxed);
}

/* ── Stat Grid ── */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 40px;
}

.stat-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: 20px;
  cursor: pointer;
  transition:
    border-color var(--duration-slow) var(--ease-out),
    transform var(--duration-slow) var(--ease-out);
  position: relative;
  overflow: hidden;
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: linear-gradient(to right, transparent, var(--accent), transparent);
  transform: translateX(-100%);
  transition: transform 0.6s var(--ease-out);
}

.stat-card:hover::before {
  transform: translateX(0);
}

.stat-card:hover {
  border-color: var(--border-strong);
  transform: translateY(-2px);
}

.stat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.stat-icon {
  font-size: 22px;
}

.stat-arrow {
  font-size: 12px;
  color: var(--text-tertiary);
  opacity: 0;
  transition:
    opacity var(--duration-fast),
    transform var(--duration-fast);
  transform: translateX(-4px);
}

.stat-card:hover .stat-arrow {
  opacity: 1;
  transform: translateX(0);
}

.stat-value {
  font-family: var(--font-sans);
  font-size: 28px;
  font-weight: var(--fw-bold);
  letter-spacing: -0.02em;
  line-height: 1;
}

.stat-label {
  margin-top: 6px;
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  color: var(--text-primary);
}

.stat-sub {
  margin-top: 2px;
  font-size: var(--fs-xs);
  color: var(--text-tertiary);
}

/* ── Quick Section ── */
.section-title {
  font-family: var(--font-sans);
  font-size: var(--fs-lg);
  font-weight: var(--fw-semibold);
  color: var(--emphasis);
  margin-bottom: 16px;
  letter-spacing: -0.01em;
}

.quick-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quick-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  cursor: pointer;
  overflow: hidden;
  transition:
    border-color var(--duration-slow) var(--ease-out),
    transform var(--duration-slow) var(--ease-out);
}

.quick-card::before {
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

.quick-card:hover::before {
  transform: translateX(0);
}

.quick-card:hover {
  border-color: var(--border-strong);
  transform: translateY(-1px);
}

.quick-card-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: var(--accent-dim);
  color: var(--accent-bright);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.quick-card-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.quick-card-title {
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  color: var(--text-primary);
}

.quick-card-desc {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

/* ── Scroll-Driven Reveal ── */
@keyframes slide-fade-in {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
}

.stat-card,
.quick-card {
  animation: slide-fade-in both;
  animation-timeline: view();
}

.stat-card:nth-of-type(1) { animation-range: contain 0% contain 25%; }
.stat-card:nth-of-type(2) { animation-range: contain 0% contain 30%; }
.stat-card:nth-of-type(3) { animation-range: contain 0% contain 35%; }
.stat-card:nth-of-type(4) { animation-range: contain 0% contain 40%; }
.quick-card:nth-of-type(1) { animation-range: contain 0% contain 25%; }
.quick-card:nth-of-type(2) { animation-range: contain 0% contain 30%; }
.quick-card:nth-of-type(3) { animation-range: contain 0% contain 35%; }

/* Fallback when animation-timeline is not supported */
@supports not (animation-timeline: view()) {
  .stat-card,
  .quick-card {
    animation: none;
    opacity: 0;
    transform: translateY(24px);
    transition:
      opacity 0.6s var(--ease-out),
      transform 0.6s var(--ease-out);
  }

  .stat-card.revealed,
  .quick-card.revealed {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
