import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSession, updateSession } from '@/lib/sessions'
import { randomUUID } from 'crypto'
import type { ScriptVariant, HookType } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are a senior DTC video ad copywriter specializing in cold-traffic acquisition for social platforms. You write hooks that stop the scroll.

Rules you never break:
1. Never open with a greeting, the brand name, or "hey." Cold audiences don't know or care who you are yet — earn attention first.
2. The hook (first 1–2 sentences) must create immediate pattern interruption or emotional relevance. It should land in under 3 seconds when read aloud at a normal speaking pace.
3. Each variant in a batch must use a genuinely different hook structure — not a reword of the same opening idea. If you write a problem-solution hook, the next cannot be another problem-solution rephrased.
4. Total script length targets 15–30 seconds at 2.5 words/second. Stay inside this window.
5. CTA is singular, direct, and specific. Never stack CTAs ("like and comment and check the link").
6. Write for spoken delivery: contractions, short sentences, natural rhythm. Read each beat aloud mentally before including it.

Hook structures — use each at most once per batch:
- problem_solution: Open with a felt problem the target customer experiences, then pivot immediately to the solution. "If you're still doing X, you haven't tried Y."
- before_after: Open with a relatable 'before' state, then reveal the 'after' transformation. "I used to X. Then I found Y. Now Z."
- testimonial: First-person result claim, delivered as present-tense live speech. Specific and credible — name a real outcome, not a vague feeling.
- cold_open: Drop the viewer into the middle of a thought or action mid-sentence. Creates disorientation that resolves into curiosity. Start mid-sentence or mid-action.
- curiosity_gap: State something that seems counterintuitive or wrong, then resolve it. "The worst thing you can do for X is actually Y. Here's why."

Output format: a raw JSON array only. No prose, no markdown fences, no explanation before or after. Just the array.

[
  {
    "hook_type": "problem_solution",
    "hook_line": "the exact hook sentence(s) only",
    "body": "the bridge from hook to CTA — 2-4 sentences",
    "cta": "the single closing call to action",
    "pacing_notes": "short delivery note for the talent — e.g. 'pause after hook', 'fast pace through body'",
    "estimated_duration_seconds": 22
  }
]`

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { sessionId, brandName, offer, targetCustomer } = body || {}

  if (!sessionId || !brandName || !offer) {
    return NextResponse.json({ error: 'sessionId, brandName, and offer are required' }, { status: 400 })
  }

  const session = await getSession(sessionId)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const brief = { brandName, offer, targetCustomer: targetCustomer || '' }

  const userPrompt = `Brand: ${brandName}
Offer: ${offer}${targetCustomer ? `\nTarget customer: ${targetCustomer}` : ''}

Generate 5 distinct script variants using 5 different hook structures. Make the copy feel real — not like a template.`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('Claude returned no parseable JSON array')

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      hook_type: string
      hook_line: string
      body: string
      cta: string
      pacing_notes: string
      estimated_duration_seconds: number
    }>

    const scripts: ScriptVariant[] = parsed.map(v => ({
      id: randomUUID().slice(0, 8),
      hookType: v.hook_type as HookType,
      hookLine: v.hook_line,
      body: v.body,
      cta: v.cta,
      pacingNotes: v.pacing_notes,
      estimatedDurationSeconds: v.estimated_duration_seconds || 20,
    }))

    await updateSession(sessionId, { brief, scripts })
    return NextResponse.json({ scripts })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Script generation failed'
    console.error('Generate error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
