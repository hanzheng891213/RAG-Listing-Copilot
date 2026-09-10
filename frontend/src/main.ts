import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import './styles/element-override.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'
import i18n from './locales'
import { useUiStore } from './stores/uiStore'
import { reportClientError, setupErrorMonitoring } from './utils/errorReporter'
import './styles/theme.css'
import './styles/global.css'
import './styles/transitions.css'

const app = createApp(App)

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(pinia)

// Apply the persisted theme before mount so the first paint has no flash.
if (!useUiStore().isDark) {
  document.documentElement.classList.add('light')
}

app.use(router)
app.use(i18n)
app.use(ElementPlus)

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// ── Global error capture: component errors + uncaught errors → backend log
app.config.errorHandler = (err, _instance, info) => {
  console.error('[Vue Error]', err, info)
  reportClientError(err, 'vue.errorHandler', info)
}
setupErrorMonitoring()

app.mount('#app')
