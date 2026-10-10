import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { marked } from 'marked'

// File-based blog: every post is a markdown file in content/blog/*.md with
// frontmatter (title, description, date). Publishing a post = adding a file
// and pushing — no CMS, no database, no separate login. Content is fully
// trusted (authored in the repo, not user-submitted), so rendering the
// converted HTML directly is safe.
const BLOG_DIR = path.join(process.cwd(), 'content/blog')

export type BlogPostMeta = {
  slug: string
  title: string
  description: string
  date: string
}

export type BlogPost = BlogPostMeta & {
  html: string
}

function readSlugs(): string[] {
  if (!fs.existsSync(BLOG_DIR)) return []
  return fs
    .readdirSync(BLOG_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''))
}

export function getAllPosts(): BlogPostMeta[] {
  return readSlugs()
    .map(slug => {
      const raw = fs.readFileSync(path.join(BLOG_DIR, `${slug}.md`), 'utf8')
      const { data } = matter(raw)
      return {
        slug,
        title: data.title as string,
        description: data.description as string,
        date: data.date as string,
      }
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

export function getPostBySlug(slug: string): BlogPost | null {
  const filePath = path.join(BLOG_DIR, `${slug}.md`)
  if (!fs.existsSync(filePath)) return null
  const raw = fs.readFileSync(filePath, 'utf8')
  const { data, content } = matter(raw)
  return {
    slug,
    title: data.title as string,
    description: data.description as string,
    date: data.date as string,
    html: marked.parse(content, { async: false }) as string,
  }
}
