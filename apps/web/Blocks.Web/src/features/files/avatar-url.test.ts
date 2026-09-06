import { describe, expect, it } from 'vitest'

import { resolveAvatarUrl } from './avatar-url'

describe('resolveAvatarUrl', () => {
  it('resolves stored relative file paths against the API base URL', () => {
    expect(resolveAvatarUrl('System/Avatar/user.png', 'https://api.example.test')).toBe(
      'https://api.example.test/System/Avatar/user.png',
    )
  })

  it('preserves absolute and browser-managed URLs', () => {
    expect(resolveAvatarUrl('https://cdn.example.test/user.png', 'https://api.example.test')).toBe(
      'https://cdn.example.test/user.png',
    )
    expect(resolveAvatarUrl('data:image/png;base64,abc', 'https://api.example.test')).toBe(
      'data:image/png;base64,abc',
    )
    expect(resolveAvatarUrl('blob:http://localhost/avatar', 'https://api.example.test')).toBe(
      'blob:http://localhost/avatar',
    )
  })

  it('returns no source for an empty avatar value', () => {
    expect(resolveAvatarUrl(null, 'https://api.example.test')).toBeUndefined()
    expect(resolveAvatarUrl('', 'https://api.example.test')).toBeUndefined()
  })
})
