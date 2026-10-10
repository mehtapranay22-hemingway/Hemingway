import Link from 'next/link'
import { getAllPosts } from '@/lib/blog'

export const metadata = {
  title: 'Blog — Hemingway',
  description: 'Notes on AI video ads, DTC creative strategy, and what actually converts on paid social.',
  alternates: { canonical: '/blog' },
}

export default function BlogIndexPage() {
  const posts = getAllPosts()

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-16 sm:py-20">
        <Link href="/" className="mb-10 flex items-center gap-2.5 w-fit">
          <div className="w-7 h-7 bg-ink flex items-center justify-center shrink-0">
            <span className="font-display text-cream text-xs font-bold">H</span>
          </div>
          <span className="font-display text-ink text-sm font-semibold tracking-tight">Hemingway</span>
        </Link>

        <h1 className="font-display text-3xl sm:text-4xl text-ink mb-2">Blog</h1>
        <p className="text-muted text-sm mb-12">Notes on AI video ads and DTC creative strategy.</p>

        {posts.length === 0 ? (
          <p className="text-muted text-sm">No posts yet — check back soon.</p>
        ) : (
          <div className="space-y-8">
            {posts.map(post => (
              <Link key={post.slug} href={`/blog/${post.slug}`} className="block group">
                <p className="text-muted text-xs uppercase tracking-widest mb-1.5">
                  {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                <h2 className="font-display text-xl text-ink mb-1.5 group-hover:text-accent transition-colors">
                  {post.title}
                </h2>
                <p className="text-sm text-muted leading-relaxed">{post.description}</p>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-16 pt-8 border-t border-divider flex gap-6 text-xs text-muted">
          <Link href="/terms" className="hover:text-ink transition-colors">Terms</Link>
          <Link href="/privacy" className="hover:text-ink transition-colors">Privacy</Link>
          <Link href="/refund-policy" className="hover:text-ink transition-colors">Refunds</Link>
        </div>
      </div>
    </div>
  )
}
