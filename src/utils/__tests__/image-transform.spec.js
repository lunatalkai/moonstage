import { describe, it, expect } from 'vitest'
import { transformCloudflareImage, cfImageDesktop } from '../image-transform.js'

describe('transformCloudflareImage', () => {
  it('rewrites images on our own host into the Cloudflare resizing form', () => {
    expect(transformCloudflareImage('https://objects.lunatalk.ai/abc/avatar.png', { width: 160, quality: 90, format: 'auto' }))
      .toBe('https://objects.lunatalk.ai/cdn-cgi/image/width=160,quality=90,format=auto/abc/avatar.png')
  })

  it('leaves images on other hosts untouched: resizing only exists on our zone, elsewhere the rewritten path is a 404', () => {
    const external = 'https://meimoaiimg.com/202608/2087193851744796672.gif'
    expect(transformCloudflareImage(external, { width: 160, quality: 90, format: 'auto' })).toBe(external)
    expect(cfImageDesktop(external, 'avatarMedium')).toBe(external)
  })

  it('still strips stale query parameters on external hosts', () => {
    expect(transformCloudflareImage('https://cdn.example.com/a.png?imageView2/1', { width: 100 })).toBe('https://cdn.example.com/a.png')
  })
})
