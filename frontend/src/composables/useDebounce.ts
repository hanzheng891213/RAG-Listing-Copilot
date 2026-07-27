import { ref, watch, type Ref } from 'vue'

/**
 * 返回一个防抖后的 ref，只有暂停输入 delay 毫秒后才同步值。
 * 适用于搜索输入框等场景，避免频繁触发请求。
 *
 * @example
 * const searchInput = ref('')
 * const debouncedSearch = useDebounce(searchInput, 300)
 * watch(debouncedSearch, (val) => fetchResults(val))
 */
export function useDebounce<T>(source: Ref<T>, delay = 300): Readonly<Ref<T>> {
  const debounced = ref(source.value) as Ref<T>
  let timer: ReturnType<typeof setTimeout> | null = null

  watch(source, (val) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      debounced.value = val
    }, delay)
  })

  return debounced as Readonly<Ref<T>>
}

/**
 * 防抖一个异步函数。连续调用时只有最后一次生效。
 */
export function debounceFn<T extends (...args: any[]) => any>(
  fn: T,
  delay = 300,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn(...args)
    }, delay)
  }
}
