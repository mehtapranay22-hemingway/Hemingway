import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { checkRateLimit, clientIp } from '@/lib/ratelimit'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM = `You are a DTC video ad strategist. Evaluate a creative brief before production begins.

Assess five things:
1. PRODUCT — is the product or service clearly identifiable?
2. AUDIENCE — is there a target customer or demographic signal?
3. OFFER — is there a value proposition, price point, or outcome?
4. BRAND_TIER — from context signals, what production level does this deserve?
5. NARRATIVE — does this brief describe a STORY (a sequence of events with a setup and a payoff/twist/resolution), not just a product pitch? e.g. "my mom sells my computer, I get upset, I turn $2k down into a $50k trade" is a narrative; "luxury skincare serum for women 35-50, $120" is not.

Brand tier rules:
- budget: generic product, low price signal, no brand positioning (e.g. "I sell stuff online", "$5 phone case")
- mid: clear product, some audience, mid-market pricing (e.g. "skincare for moms, $30")
- premium: strong positioning, specific audience, higher price signal (e.g. "luxury skincare serum, $120, women 35-50")
- luxury: aspirational brand, status/exclusivity signals, high price (e.g. "handcrafted Swiss watches, $2000+")

Production config by brand tier (used when NARRATIVE is false):
- budget → 2 shots, 720p, ~18s
- mid → 2 shots, 720p, ~20s
- premium → 3 shots, 1080p, ~20s
- luxury → 3 shots, 1080p, ~24s

A narrative brief needs real runway to set up AND land its payoff — a twist or resolution crammed into the same time as a plain product pitch is the single most common way this kind of brief comes out wrong. When NARRATIVE is true, regardless of brand tier: use 4-5 shots and duration_seconds 28-30 (near Seedance's 30s hard cap), and extract the payoff_beat — the one specific moment that is the actual point of the story (the twist, the win, the resolution) — in one concrete sentence. That sentence is later used to guarantee the payoff survives even if other shots get compressed.

Verdict rules:
- "proceed" → the default. If the product is identifiable at all, write a converting script using reasonable inferred defaults for whatever is missing — don't ask just because audience or offer wasn't spelled out.
- "flag" → rare. Only when the brief is so thin that guessing would likely produce a badly off-target script — e.g. the product itself is unclear or could mean several very different things. Ask exactly one specific, high-leverage question.
- "block" → completely unusable (fewer than 5 meaningful words, no product mentioned, placeholder text)

Output strict JSON only, no markdown, no explanation outside the JSON:
{
  "verdict": "proceed" | "flag" | "block",
  "brand_tier": "budget" | "mid" | "premium" | "luxury",
  "production": {
    "clips": 2 | 3 | 4 | 5,
    "quality": "720p" | "1080p",
    "clip_duration": 5 | 10,
    "duration_seconds": 18 | 20 | 24 | 28 | 30
  },
  "narrative": {
    "has_arc": true | false,
    "payoff_beat": null | "one concrete sentence describing the twist/resolution/payoff that must survive"
  },
  "rationale": "one sentence explaining the verdict and tier",
  "flag_message": null | "specific question to improve the brief — one sentence, direct"
}`

export async function POST(req: NextRequest) {
  // This runs pre-signup for anyone typing a brief — a real Claude call, so
  // it needs its own cap independent of account state. 30/hour per IP is
  // generous for genuine back-and-forth clarification, tight enough to cap
  // the blast radius of a script hammering it.
  const { allowed, retryAfterSeconds } = await checkRateLimit(`analyze-brief:${clientIp(req)}`, 30, 3600)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } })
  }

  const body = await req.json().catch(() => null)
  const { description, hasImage } = body || {}

  if (!description || typeof description !== 'string') {
    return NextResponse.json({ error: 'description is required' }, { status: 400 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    // If no API key, skip analysis and proceed — don't block the user
    return NextResponse.json({
      verdict: 'proceed',
      brand_tier: 'mid',
      production: { clips: 2, quality: '720p', clip_duration: 5, duration_seconds: 20 },
      narrative: { has_arc: false, payoff_beat: null },
      rationale: 'Analysis skipped — no API key configured.',
      flag_message: null,
    })
  }

  try {
    const imageNote = hasImage ? ' (user has uploaded a product image)' : ''
    const msg = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 300,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Brief: "${description}"${imageNote}` }],
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Unexpected response format')

    const analysis = JSON.parse(jsonMatch[0])
    return NextResponse.json(analysis)
  } catch {
    // On any failure, don't block the user — proceed with safe defaults
    return NextResponse.json({
      verdict: 'proceed',
      brand_tier: 'mid',
      production: { clips: 2, quality: '720p', clip_duration: 5, duration_seconds: 20 },
      narrative: { has_arc: false, payoff_beat: null },
      rationale: 'Analysis unavailable — proceeding with standard settings.',
      flag_message: null,
    })
  }
}
