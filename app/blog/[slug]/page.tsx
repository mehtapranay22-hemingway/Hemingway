import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAllPosts, getPostBySlug } from '@/lib/blog'

export function generateStaticParams() {
  return getAllPosts().map(post => ({ slug: post.slug }))
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const post = getPostBySlug(params.slug)
  if (!post) return {}
  return {
    title: `${post.title} — Hemingway`,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.date,
    },
  }
}

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = getPostBySlug(params.slug)
  if (!post) notFound()

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-16 sm:py-20">
        <Link href="/" className="mb-10 flex items-center gap-2.5 w-fit">
          <div className="w-7 h-7 bg-ink flex items-center justify-center shrink-0">
            <span className="font-display text-cream text-xs font-bold">H</span>
          </div>
          <span className="font-display text-ink text-sm font-semibold tracking-tight">Hemingway</span>
        </Link>

        <Link href="/blog" className="text-xs text-muted hover:text-ink transition-colors mb-6 inline-block">
          ← Back to blog
        </Link>

        <p className="text-muted text-xs uppercase tracking-widest mb-3">
          {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
        <h1 className="font-display text-3xl sm:text-4xl text-ink mb-10 leading-tight">{post.title}</h1>

        <div
          className="space-y-5 text-[15px] text-ink leading-relaxed [&_h2]:font-display [&_h2]:text-xl [&_h2]:text-ink [&_h2]:mt-10 [&_h2]:mb-3 [&_p]:text-ink/90 [&_p]:mb-1 [&_li]:text-ink/90 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:text-ink [&_strong]:font-semibold [&_em]:italic [&_a]:text-ink [&_a]:underline hover:[&_a]:text-accent [&_hr]:border-divider [&_hr]:my-10"
          dangerouslySetInnerHTML={{ __html: post.html }}
        />

        <div className="mt-16 pt-8 border-t border-divider flex gap-6 text-xs text-muted">
          <Link href="/blog" className="hover:text-ink transition-colors">Blog</Link>
          <Link href="/terms" className="hover:text-ink transition-colors">Terms</Link>
          <Link href="/privacy" className="hover:text-ink transition-colors">Privacy</Link>
        </div>
      </div>
    </div>
  )
}
