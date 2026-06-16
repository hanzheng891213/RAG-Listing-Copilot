import { createI18n } from 'vue-i18n'
import en from './en'
import zh from './zh'
import de from './de'
import fr from './fr'
import ru from './ru'
import th from './th'
import vi from './vi'
import ar from './ar'

const savedLang = localStorage.getItem('app-lang') || 'zh'

const i18n = createI18n({
  legacy: false,
  locale: savedLang,
  fallbackLocale: 'en',
  messages: { en, zh, de, fr, ru, th, vi, ar },
})

export default i18n

export const LANGUAGES: { code: string; label: string; native: string }[] = [
  { code: 'zh', label: 'Chinese', native: '中文' },
  { code: 'en', label: 'English', native: 'English' },
  { code: 'de', label: 'German', native: 'Deutsch' },
  { code: 'fr', label: 'French', native: 'Français' },
  { code: 'ru', label: 'Russian', native: 'Русский' },
  { code: 'th', label: 'Thai', native: 'ไทย' },
  { code: 'vi', label: 'Vietnamese', native: 'Tiếng Việt' },
  { code: 'ar', label: 'Arabic', native: 'العربية' },
]

export function setLocale(lang: string) {
  i18n.global.locale.value = lang as any
  localStorage.setItem('app-lang', lang)
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang === 'ar' ? 'ar' : lang
  document.dir = lang === 'ar' ? 'rtl' : 'ltr'
}
