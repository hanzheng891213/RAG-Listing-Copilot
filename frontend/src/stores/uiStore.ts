import { defineStore } from 'pinia'
import { ref } from 'vue'

/** Global UI preferences, persisted so theme survives a reload. */
export const useUiStore = defineStore(
  'ui',
  () => {
    const isDark = ref(true)

    return { isDark }
  },
  { persist: true },
)
