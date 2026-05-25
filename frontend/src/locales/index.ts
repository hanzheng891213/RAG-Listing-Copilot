import { createI18n } from 'vue-i18n'
import en from './en'
import zh from './zh'

const savedLang = localStorage.getItem('app-lang') || 'zh'

const i18n = createI18n({
  legacy: false,
  locale: savedLang,
  fallbackLocale: 'en',
  messages: { en, zh },
})

export default i18n

export function setLocale(lang: string) {
  i18n.global.locale.value = lang as 'zh' | 'en'
  localStorage.setItem('app-lang', lang)
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
}
