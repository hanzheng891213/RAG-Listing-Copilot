<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const router = useRouter()

const features = [
  { titleKey: 'home.features.upload.title', descKey: 'home.features.upload.desc', icon: 'Upload', route: '/supplier-upload', color: 'var(--accent)' },
  { titleKey: 'home.features.listing.title', descKey: 'home.features.listing.desc', icon: 'MagicStick', route: '/listing-generator', color: 'var(--accent-bright)' },
  { titleKey: 'home.features.knowledge.title', descKey: 'home.features.knowledge.desc', icon: 'Collection', route: '/knowledge-base', color: 'var(--accent-dim)' },
  { titleKey: 'home.features.compliance.title', descKey: 'home.features.compliance.desc', icon: 'Checked', route: '/listing-generator', color: 'var(--success)' },
  { titleKey: 'home.features.seo.title', descKey: 'home.features.seo.desc', icon: 'TrendCharts', route: '/listing-generator', color: 'var(--accent-coral)' },
  { titleKey: 'home.features.batch.title', descKey: 'home.features.batch.desc', icon: 'Download', route: '/listing-generator', color: 'var(--warning)' },
]

function navigate(path: string) {
  router.push(path)
}

onMounted(() => {
  if (!CSS.supports('animation-timeline: view()')) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed')
          }
        })
      },
      { threshold: 0.1 },
    )
    document.querySelectorAll('.feature-card').forEach((card) => {
      observer.observe(card)
    })
  }
})
</script>

<template>
  <div class="home-page">
    <section class="hero">
      <div class="hero-content">
        <h1 class="hero-title">
          {{ t('home.heroTitle1') }}
          <span class="hero-accent">{{ t('home.heroTitle2') }}</span>
          {{ t('home.heroTitle3') }}
        </h1>
        <p class="hero-subtitle">{{ t('home.heroSubtitle') }}</p>
        <div class="hero-actions">
          <button class="btn-primary" @click="navigate('/supplier-upload')">
            <el-icon><Upload /></el-icon>
            <span>{{ t('home.uploadBtn') }}</span>
          </button>
          <button class="btn-secondary" @click="navigate('/listing-generator')">
            <span>{{ t('home.demoBtn') }}</span>
            <el-icon><ArrowRight /></el-icon>
          </button>
        </div>
      </div>
      <div class="hero-visual">
        <div class="hero-card">
          <div class="hero-card-header">
            <span class="hero-card-dot" />
            <span class="hero-card-dot" />
            <span class="hero-card-dot" />
          </div>
          <div class="hero-card-body">
            <div class="hero-card-line short" />
            <div class="hero-card-line" />
            <div class="hero-card-line" />
            <div class="hero-card-line medium" />
          </div>
          <div class="hero-card-accent" />
        </div>
        <div class="hero-glow" />
      </div>
    </section>

    <section class="features-section">
      <h2 class="section-title">{{ t('home.sectionTitle') }}</h2>
      <div class="features-grid">
        <div
          v-for="(feature, index) in features"
          :key="feature.titleKey"
          class="feature-card"
          :style="{ animationDelay: `${index * 0.1}s` }"
          @click="navigate(feature.route)"
        >
          <div class="feature-icon" :style="{ color: feature.color }">
            <el-icon><component :is="feature.icon" /></el-icon>
          </div>
          <h3 class="feature-title">{{ t(feature.titleKey) }}</h3>
          <p class="feature-desc">{{ t(feature.descKey) }}</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home-page { padding-bottom: 40px; min-height: 0; }
.hero { display: flex; align-items: center; gap: 48px; padding: 24px 0 32px; position: relative; }
.hero-content { flex: 1; max-width: 520px; }
.hero-title { font-size: clamp(36px, 5vw, 56px); font-weight: 400; color: var(--text-primary); line-height: 1.15; margin-bottom: 16px; letter-spacing: -0.5px; }
.hero-accent { color: var(--accent); font-style: italic; }
.hero-subtitle { font-size: 16px; color: var(--text-secondary); line-height: 1.65; margin-bottom: 28px; max-width: 460px; }
.hero-actions { display: flex; gap: 12px; }
.btn-primary { display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; background: var(--accent); border: 1px solid var(--accent); border-radius: var(--radius-md); color: var(--bg-primary); font-family: var(--font-body); font-size: 14px; font-weight: 600; cursor: pointer; transition: all var(--transition-base); position: relative; overflow: hidden; }
.btn-primary:hover { background: var(--accent-bright); border-color: var(--accent-bright); transform: translateY(-1px); box-shadow: 0 8px 24px var(--accent-glow-strong); }
.btn-secondary { display: inline-flex; align-items: center; gap: 6px; padding: 12px 24px; background: transparent; border: 1px solid var(--border-light); border-radius: var(--radius-md); color: var(--text-primary); font-family: var(--font-body); font-size: 14px; font-weight: 500; cursor: pointer; transition: all var(--transition-base); }
.btn-secondary:hover { border-color: var(--accent); color: var(--accent); box-shadow: 0 8px 24px var(--accent-glow); }
.hero-visual { flex: 1; position: relative; display: flex; align-items: center; justify-content: center; min-height: 220px; max-height: 260px; }
.hero-card { width: 280px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 18px; position: relative; overflow: hidden; box-shadow: 0 16px 48px var(--shadow-color); }
.hero-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(to right, var(--accent), var(--accent-bright), var(--accent-dim)); }
.hero-card-header { display: flex; gap: 6px; margin-bottom: 18px; }
.hero-card-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--border-light); }
.hero-card-dot:first-child { background: var(--accent-coral); }
.hero-card-body { display: flex; flex-direction: column; gap: 10px; }
.hero-card-line { height: 10px; border-radius: 3px; background: var(--bg-primary); width: 100%; }
.hero-card-line.short { width: 40%; }
.hero-card-line.medium { width: 70%; }
.hero-card-accent { margin-top: 16px; height: 32px; border-radius: var(--radius-sm); background: var(--accent-glow); border: 1px dashed var(--accent-dim); }
.hero-glow { position: absolute; top: -80px; right: -80px; width: 280px; height: 280px; border-radius: 50%; background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%); pointer-events: none; }
.features-section { padding-top: 8px; }
.section-title { font-size: 24px; font-weight: 400; color: var(--text-primary); margin-bottom: 24px; text-align: center; }
.features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; grid-auto-flow: dense; }
.feature-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 22px 24px; cursor: pointer; transition: all var(--transition-base); position: relative; overflow: hidden; opacity: 0; transform: scale(0.92) translateY(24px); }
.feature-card.revealed { opacity: 1; transform: scale(1) translateY(0); transition: opacity 0.6s ease, transform 0.6s ease, border-color 0.4s, background 0.4s; }
@supports (animation-timeline: view()) { .feature-card { animation: slide-fade-in both; animation-timeline: view(); animation-range: contain 0% contain 35%; } }
.feature-card::before { content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 2px; background: linear-gradient(to right, transparent, var(--accent-dim), transparent); transform: translateX(-100%); transition: transform 0.6s; }
.feature-card:hover::before { transform: translateX(0); }
.feature-card:hover { border-color: var(--accent-dim); background: var(--bg-card-hover); transform: translateY(-2px); box-shadow: 0 8px 30px var(--shadow-color); }
.feature-card:nth-of-type(4n) { grid-column: span 2; }
.feature-icon { margin-bottom: 14px; width: 44px; height: 44px; border-radius: var(--radius-md); background: var(--accent-glow); display: flex; align-items: center; justify-content: center; }
.feature-icon .el-icon { font-size: 22px; }
.feature-title { font-family: var(--font-body); font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; }
.feature-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.6; }
@media (max-width: 1024px) { .hero { flex-direction: column; gap: 32px; padding: 20px 0 28px; } .hero-content { max-width: 100%; } .features-grid { grid-template-columns: repeat(2, 1fr); } .feature-card:nth-of-type(4n) { grid-column: span 1; } }
@media (max-width: 768px) { .hero { padding: 16px 0 28px; } .hero-title { font-size: 32px; } .hero-actions { flex-direction: column; } .hero-visual { display: none; } .features-grid { grid-template-columns: 1fr; } .section-title { font-size: 20px; margin-bottom: 20px; } }
</style>
