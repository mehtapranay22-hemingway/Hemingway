import type { MetadataRoute } from 'next'

// Only the marketing/legal pages are worth indexing — everything else
// either requires a signed-in session (no unique content for a crawler to
// see) or is dead legacy UI kept around harmlessly but not linked anywhere.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/terms', '/privacy', '/refund-policy'],
      disallow: [
        '/api/',
        '/signin',
        '/signup',
        '/forgot-password',
        '/reset-password',
        '/onboarding',
        '/library',
        '/billing',
        '/avatar',
        '/output',
        '/pick',
        '/describe',
        '/brief',
        '/scripts',
      ],
    },
    sitemap: 'https://www.hemingwayengine.com/sitemap.xml',
  }
}
