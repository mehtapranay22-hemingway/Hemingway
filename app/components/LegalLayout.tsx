import Link from 'next/link'

export default function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-16 sm:py-20">
        <Link href="/" className="mb-10 flex items-center gap-2.5 w-fit">
          <div className="w-7 h-7 bg-ink flex items-center justify-center shrink-0">
            <span className="font-display text-cream text-xs font-bold">H</span>
          </div>
          <span className="font-display text-ink text-sm font-semibold tracking-tight">Hemingway</span>
        </Link>

        <h1 className="font-display text-3xl sm:text-4xl text-ink mb-2">{title}</h1>
        <p className="text-muted text-xs uppercase tracking-widest mb-10">Last updated {updated}</p>

        <div className="space-y-8 text-sm text-ink leading-relaxed [&_h2]:font-display [&_h2]:text-xl [&_h2]:text-ink [&_h2]:mb-3 [&_p]:text-muted [&_p]:mb-3 [&_li]:text-muted [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:text-ink [&_a]:underline hover:[&_a]:text-accent">
          {children}
        </div>

        <div className="mt-16 pt-8 border-t border-divider flex gap-6 text-xs text-muted">
          <Link href="/terms" className="hover:text-ink transition-colors">Terms</Link>
          <Link href="/privacy" className="hover:text-ink transition-colors">Privacy</Link>
          <Link href="/refund-policy" className="hover:text-ink transition-colors">Refunds</Link>
        </div>
      </div>
    </div>
  )
}
