const fallbackOrigin = 'http://127.0.0.1'

export function resolveAvatarUrl(value: string | null | undefined, baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/') {
  const source = value?.trim()
  if (!source) return undefined

  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(source)) {
    return source
  }

  const absoluteBaseUrl = /^https?:\/\//i.test(baseUrl)
    ? baseUrl
    : new URL(baseUrl, globalThis.location?.origin ?? fallbackOrigin).toString()
  const normalizedBaseUrl = absoluteBaseUrl.endsWith('/') ? absoluteBaseUrl : absoluteBaseUrl + '/'

  return new URL(source.replace(/^\/+/, ''), normalizedBaseUrl).toString()
}
