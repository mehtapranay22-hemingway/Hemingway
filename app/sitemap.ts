import type { MetadataRoute } from 'next'
import { getAllPosts } from '@/lib/blog'

// Kept in sync with app/robots.ts's allow list — only pages worth a crawler
// indexing on their own (see that file for why the rest are excluded).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://www.hemingwayengine.com'
  const now = new Date()

  const posts = getAllPosts()

  return [
    { url: base, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/blog`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    ...posts.map(post => ({
      url: `${base}/blog/${post.slug}`,
      lastModified: new Date(post.date),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    { url: `${base}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/refund-policy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
