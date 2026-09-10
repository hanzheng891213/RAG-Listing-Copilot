/**
 * localStorage wrapper that never throws.
 * Persisted state is best-effort: quota errors and unavailable storage are
 * swallowed so a full localStorage never breaks the app.
 */
export const safeLocalStorage: Storage = {
  get length() {
    try {
      return window.localStorage.length
    } catch {
      return 0
    }
  },
  clear() {
    try {
      window.localStorage.clear()
    } catch { /* ignore */ }
  },
  getItem(key: string) {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  key(index: number) {
    try {
      return window.localStorage.key(index)
    } catch {
      return null
    }
  },
  removeItem(key: string) {
    try {
      window.localStorage.removeItem(key)
    } catch { /* ignore */ }
  },
  setItem(key: string, value: string) {
    try {
      // Skip writes that would exceed the ~5MB quota; large payloads
      // (e.g. thousands of parsed products) should not break persistence.
      if (value.length > 2 * 1024 * 1024) return
      window.localStorage.setItem(key, value)
    } catch { /* ignore */ }
  },
}
