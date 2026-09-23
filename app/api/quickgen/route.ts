import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSession, updateSession } from '@/lib/sessions'
import { resolveAvatarImage } from '@/lib/avatars'
import { saveTemporaryImage, publicPathToDataUri } from '@/lib/uploads'
import { buildCharacterSheet, submitShot } from '@/lib/seedance'
import { randomUUID } from 'crypto'
import { AUTO_CAST_ID, NO_CHARACTER_ID, type ScriptVariant } from '@/lib/types'
import { getClientProfile, getSubscription, getRecentKeptAds, type KeptAd } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { categoryFlagForIndustry, type CategoryFlag } from '@/lib/industry'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CATEGORY_DIRECTION: Record<CategoryFlag, string> = {
  jewelry: `Jewelry / fine accessories — aspirational-relational
- Emotional center: someone else's reaction. Gifting, being chosen, a moment witnessed.
- Setting: intimate, close-up, a reveal or reaction.
- Language: sentimental, specific, often names a relationship or occasion.
- Avoid: generic product-beauty language with no relational context.`,
  automotive: `Automotive / performance products — aspirational-physical
- Emotional center: the user's own body and feeling. Power, control, freedom, identity.
- Setting: motion, solitary, no other person needed in frame.
- Language: visceral, physical sensation, status and capability.
- Avoid: gifting or relational framing — this category centers the self, not another person.`,
  wellness: `Wellness beverages / supplements — relatable-ritual
- Emotional center: a small daily win, self-care, feeling put-together.
- Setting: home, kitchen, morning routine, natural light, unpolished.
- Language: casual, first-person, habit-focused.
- Compliance: use structure/function language only ("supports focus," "sustained energy"). Never use disease claims or medical promises.`,
  beauty: `Beauty / skincare — relatable-transformation
- Emotional center: visible change, "will this work for someone like me."
- Setting: real skin, real lighting, believable before/after framing.
- Language: specific and concrete ("stopped buying my $80 serum") over vague claims.`,
}

// A lightweight, no-ML "memory": the client's own past ads that they actually
// downloaded (see lib/db.ts recordKeptAd/getRecentKeptAds), fed back in as
// few-shot examples. Empty for a first-time client — this only ever narrows
// toward what's already worked for THIS account, nothing is shared across
// clients or trained into the model itself.
function pastAdsSection(pastKept: KeptAd[], label: string): string {
  if (pastKept.length === 0) return ''
  const examples = pastKept
    .map((k, i) => `${i + 1}. Hook: "${k.hookLine}"${k.body ? ` | Body: "${k.body}"` : ''}${k.cta ? ` | CTA: "${k.cta}"` : ''}`)
    .join('\n')
  return `

This client's past ${label} they kept and downloaded — reference for voice, tone, and quality bar ONLY:
${examples}

Do not treat these as a template. The variety rule above still applies in full: this new one must use a different hook structure/angle than whichever of these it most resembles, and must not reuse their specific phrasing, opening line pattern, or scenario. If every example below happens to share one structure, that's exactly the one to avoid repeating now.`
}

// The category is fixed by the client's onboarding profile (lib/db.ts),
// never re-derived from the brief text — this is the actual mechanism that
// makes the industry selection reach generation, not just sit stored.
function buildScriptSystem(category: CategoryFlag, pastKept: KeptAd[]): string {
  return `You are a direct-response ad scriptwriter for short-form vertical video (15-30 seconds), writing scripts that will be performed by an AI avatar.

Universal rules, apply to every script regardless of category
- Never open with a greeting, brand name, or intro. State the hook in the first line.
- Vary hook structure genuinely across generations: problem-solution, before/after, testimonial, or a mid-sentence cold-open. Don't just reword the same idea. This applies even against this client's own past kept ads below — if they've leaned on one structure before, pick a different one now.
- End with exactly one clear call to action. Never stack multiple asks.
- Keep pacing tight. Every line should earn its place in a 15-30 second video.
- Write like a real person talking, not like an advertisement. Contractions, natural rhythm, no corporate language.

Category-specific direction

This client's category is fixed by their account profile — apply it below exactly, don't re-derive or second-guess it from the brief text even if the brief reads ambiguous or seems to point elsewhere:

${CATEGORY_DIRECTION[category]}
${pastAdsSection(pastKept, 'scripts')}

Output format
Output a single JSON object, no markdown fences, no explanation outside the JSON. Write "hook" as a plain spoken line — no stage directions or camera notes:
{"hook":"opening line","body":"2-3 sentences bridging hook to CTA","cta":"single closing call to action"}`
}

// Seedance generates a whole multi-shot ad — talking character, lip-synced
// dialogue, cutaways, music — in one continuous pass from a single prompt
// plus zero or more reference images. This replaces the old three-service
// pipeline (HeyGen avatar render -> Kling B-roll -> Shotstack compose)
// entirely; no separate stitching step needed because Seedance edits itself.
const SEEDANCE_SYSTEM = `You are a director translating a video ad script into a single Seedance generation prompt.

Seedance generates a whole multi-shot ad in ONE continuous pass — talking character, lip-synced dialogue, cutaways, and music — from one text prompt plus zero or more reference images, numbered [Image1], [Image2], ... in the order given to you below.

Rules:
- If spokesperson reference image(s) are given, every shot featuring them must reference those image numbers and keep identity, outfit, and setting consistent across the whole video. If multiple images are given for the spokesperson, they're the same person from different angles, not different people. If no spokesperson reference is given, invent one whose look, age, and setting genuinely fit the product and audience, and describe them in enough detail in the first shot that later shots can consistently refer back to "the spokesperson."
- If a product reference image is given, every shot showing the product — especially cutaways — must reference that image number and match its real appearance (color, shape, packaging). Never invent a different-looking product when a real reference exists.
- Put every spoken line in double quotes exactly as given, so Seedance lip-syncs it — never paraphrase the provided dialogue.
- Structure it as a numbered shot list: alternate between the spokesperson speaking to camera and quick cutaway shots of the product/context.
- Cutaway shots should be handheld, natural, UGC-style — think "phone footage," not polished commercial cinematography.
- Keep the total run time close to the target duration.
- Output plain text only: the shot list, one shot per line, no markdown, no JSON, no commentary before or after.`

async function generateSeedancePrompt(params: {
  description: string
  script: ScriptVariant
  avatarGender?: string
  clipCount: number
  characterImageCount: number
  hasProductReference: boolean
}): Promise<string> {
  const { description, script, avatarGender, clipCount, characterImageCount, hasProductReference } = params

  const refLines: string[] = []
  if (characterImageCount > 0) {
    const range = characterImageCount === 1 ? '[Image1]' : `[Image1]-[Image${characterImageCount}]`
    refLines.push(`Character: ${range} — a ${avatarGender || 'female'} on-camera spokesperson.`)
  } else {
    refLines.push(`Character: no reference photo — invent a spokesperson who genuinely fits this product and audience.`)
  }
  if (hasProductReference) {
    refLines.push(`Product reference: [Image${characterImageCount + 1}] — the actual product. Match it exactly in every shot that shows it.`)
  }

  const userPrompt = `${refLines.join('\n')}
Target duration: ~${script.estimatedDurationSeconds}s
Number of cutaway/B-roll beats: ${clipCount}
Product: ${description}

Dialogue (use exactly, split across shots in order):
Hook: "${script.hookLine}"
Body: "${script.body}"
CTA: "${script.cta}"

Write the shot list now.`

  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 600,
    system: SEEDANCE_SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
  })
  return msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
}

// "No character needed" mode: a cinematic, product-focused ad with no
// persistent on-camera spokesperson at all — no dialogue, no character
// reference, no identity system. This writes the Seedance shot list
// directly in one call (there's no separate "spoken script" to write first,
// unlike the dialogue path above), so it also skips generateSeedancePrompt
// entirely — this IS the final prompt.
function buildCinematicSystem(category: CategoryFlag, pastKept: KeptAd[]): string {
  return `You are a director writing a cinematic, product-focused Seedance video ad prompt — no persistent on-camera spokesperson, no branded character, no spoken dialogue delivered to camera.

Seedance generates a whole multi-shot ad in ONE continuous pass — camera movement, lighting, framing, pacing, transitions — from one text prompt structured as a numbered shot list.

This client's category is fixed by their account profile — express its emotional center through cinematography and visual choices, not spoken dialogue or delivery style:

${CATEGORY_DIRECTION[category]}
${pastAdsSection(pastKept, 'cinematic shot lists')}

Rules:
- Structure the output as a numbered shot list: "Shot 1: ...", "Shot 2: ...", etc. — 4 to 6 shots.
- Vary the opening shot, setting, and camera approach genuinely across generations — don't default to the same establishing shot or lighting setup every time, including relative to this client's own past kept shot lists above. Treat those as a reference for quality and tone only, never a template to reuse.
- Every shot is pure visual/camera direction: framing, camera movement (slow push-in, handheld drift, static lockoff), lighting, pacing, transitions. No spoken lines, no dialogue in quotes, no voiceover, no named character.
- An incidental, unnamed person may appear where a shot calls for it (e.g. "a hand reaches for the box," "someone walking past in soft focus, out of focus"). Describe them only by the action — never name them, never describe them with enough consistent detail to imply a recurring identity across shots. A different unnamed person in each shot is fine; there is no identity to maintain.
- If a product reference image is given (it will be described to you as an image number below), every shot showing the product must reference that image number and match its real appearance exactly — color, shape, packaging. Never invent a different-looking product when a real reference exists.
- Cinematic quality: premium DTC brand film — deliberate camera movement and lighting, not amateur handheld UGC footage.
- Keep the total run time close to the target duration.
- Output plain text only: the shot list, one shot per line, no markdown, no JSON, no commentary before or after.`
}

async function generateCinematicPrompt(params: {
  description: string
  category: CategoryFlag
  clipCount: number
  durationSeconds: number
  hasProductReference: boolean
  pastKept: KeptAd[]
}): Promise<string> {
  const { description, category, clipCount, durationSeconds, hasProductReference, pastKept } = params

  const productLine = hasProductReference
    ? `Product reference: [Image1] — the actual product. Every shot showing it must match this exactly.`
    : `No product reference photo was provided — render the product as faithfully as the brief allows.`

  const userPrompt = `${productLine}
Target duration: ~${durationSeconds}s
Suggested number of distinct shots: ${Math.max(4, Math.min(6, clipCount + 2))}
Product/brief: ${description}

Write the cinematic shot list now.`

  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 600,
    system: buildCinematicSystem(category, pastKept),
    messages: [{ role: 'user', content: userPrompt }],
  })
  return msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { avatarId, avatarGender, description, imageBase64, imageMediaType, analysis } = body || {}

  if (!avatarId || !description) {
    return NextResponse.json({ error: 'avatarId and description are required' }, { status: 400 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }

  // Anonymous generation is allowed by design — first video happens before
  // any account exists, onboarding/signup comes after (see app/page.tsx and
  // app/output/page.tsx). The session just starts unowned and gets claimed
  // once they do sign up.
  const user = getCurrentUser(req)
  const session = createSession(user?.id)

  // Category comes from the client's onboarding profile, not the brief —
  // see buildScriptSystem() above for why. No account/profile yet (the
  // common case for a first-ever generation) falls back to the safe default
  // register instead of blocking.
  const clientProfile = user ? getClientProfile(user.id) : null
  const category = categoryFlagForIndustry(clientProfile?.industry ?? 'Other')

  const isAutoCast = avatarId === AUTO_CAST_ID
  const isNoCharacter = avatarId === NO_CHARACTER_ID

  // Lightweight memory: this client's own past ads they actually downloaded,
  // fed back in as few-shot examples below — see lib/db.ts for the "why".
  // One query for whichever mode this generation actually is, not both.
  const pastKept = user ? getRecentKeptAds(user.id, isNoCharacter ? 'cinematic' : 'dialogue', 3) : []

  // 1. Generate script — cinematic mode writes the Seedance shot list
  // directly (no spoken dialogue, so no separate "script" to write first);
  // everything else writes a spoken-delivery script as before.
  let script: ScriptVariant
  let cinematicPrompt: string | undefined
  try {
    if (isNoCharacter) {
      const clipCountEarly = (analysis?.production?.clips ?? 2) as number
      cinematicPrompt = await generateCinematicPrompt({
        description,
        category,
        clipCount: clipCountEarly,
        durationSeconds: 20,
        hasProductReference: !!imageBase64,
        pastKept,
      })
      if (!cinematicPrompt) throw new Error('Empty cinematic shot list from Claude')

      // What's shown on the output page's typewriter is NOT what gets sent
      // to Seedance — cinematicPrompt (used later, unmodified) needs its
      // literal "Image1" reference tokens for the API to work; showing those
      // to a person reads as broken. Strip them and break onto separate
      // lines per shot for a display-only version.
      const displayText = cinematicPrompt
        .replace(/\[?Image\d+\]?/gi, 'the product')
        .replace(/\s*(Shot \d+:)/g, '\n$1')
        .trim()

      script = {
        id: randomUUID().slice(0, 8),
        hookType: 'problem_solution', // field reused for storage shape only — not meaningful in cinematic mode
        hookLine: 'A cinematic, product-focused film.',
        body: displayText,
        cta: '',
        pacingNotes: '',
        estimatedDurationSeconds: 20,
      }
    } else {
      const userContent = imageBase64
        ? [
            { type: 'image' as const, source: { type: 'base64' as const, media_type: (imageMediaType || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: imageBase64 as string } },
            { type: 'text' as const, text: `${description}\n\nLook at the product image above. Use specific visual details — colours, packaging, product type, branding — to make the script feel grounded in the actual product.` },
          ]
        : description

      const msg = await anthropic.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 600,
        system: buildScriptSystem(category, pastKept),
        messages: [{ role: 'user', content: userContent }],
      })

      const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Script generation returned unexpected format')
      const parsed = JSON.parse(jsonMatch[0]) as { hook: string; body: string; cta: string }

      script = {
        id: randomUUID().slice(0, 8),
        hookType: 'problem_solution',
        hookLine: parsed.hook,
        body: parsed.body,
        cta: parsed.cta,
        pacingNotes: '',
        estimatedDurationSeconds: 20,
      }
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Script generation failed' }, { status: 500 })
  }

  // 2. Resolve the picked avatar's reference photos (cover + any extra angles)
  // — used as the Seedance character reference set. Custom avatars only.
  // "Let Hemingway cook" and "No character needed" both skip this — but if
  // the user attached a product photo, that still becomes a real reference
  // below, so those modes are only ever fully untethered when there's truly
  // nothing of the user's to anchor to.
  let characterImageUrls: string[] = []
  let characterName = isNoCharacter ? 'No character' : 'Auto-cast'

  if (!isAutoCast && !isNoCharacter) {
    if (!user) {
      return NextResponse.json({ error: 'Sign in to use a saved avatar, or choose "Let Hemingway cook."' }, { status: 401 })
    }
    const resolvedAvatar = await resolveAvatarImage(user.id, avatarId)
    if (!resolvedAvatar) {
      return NextResponse.json({ error: 'Could not resolve a reference photo for the selected avatar' }, { status: 500 })
    }
    // Custom avatars are stored as relative /avatars/<id>.png paths on this
    // machine — Seedance's cloud API can't reach a localhost URL at all, so
    // these get embedded as data: URIs instead of resolved to an absolute
    // (but unreachable) URL. Real https:// URLs pass through unchanged.
    characterImageUrls = resolvedAvatar.imageUrls.map(url =>
      url.startsWith('http') ? url : publicPathToDataUri(url)
    )
    characterName = resolvedAvatar.name
  }

  // 2b. If the user attached a product photo, add it as its own reference —
  // previously this only ever reached the script-writing call, never
  // Seedance, so cutaways showed a hallucinated product even when a real
  // photo was uploaded. Still saved to disk for the record, but what's sent
  // to Seedance is a data: URI built directly from the already-in-memory
  // base64 (same localhost-unreachable problem as avatar photos above).
  let productImageUrl: string | undefined
  if (imageBase64) {
    saveTemporaryImage(imageBase64, imageMediaType || 'image/jpeg')
    productImageUrl = `data:${imageMediaType || 'image/jpeg'};base64,${imageBase64}`
  }

  const referenceImageUrls = [...characterImageUrls, ...(productImageUrl ? [productImageUrl] : [])]

  // 3. Build the character sheet (validated reference photos, possibly empty)
  // and the shot-list prompt
  const characterSheet = await buildCharacterSheet(referenceImageUrls, characterName)
  if (characterSheet.status === 'failed') {
    return NextResponse.json({ error: characterSheet.error || 'Character sheet setup failed' }, { status: 500 })
  }

  const clipCount = (analysis?.production?.clips ?? 2) as number
  let prompt: string
  try {
    if (isNoCharacter) {
      // Already the final Seedance-ready shot list — cinematic mode is a
      // single Claude call (see step 1), no dialogue-wrapping conversion needed.
      if (!cinematicPrompt) throw new Error('Missing cinematic shot list')
      prompt = cinematicPrompt
    } else {
      prompt = await generateSeedancePrompt({
        description,
        script,
        avatarGender: isAutoCast ? undefined : (avatarGender || 'female').toLowerCase(),
        clipCount,
        characterImageCount: characterImageUrls.length,
        hasProductReference: !!productImageUrl,
      })
      if (!prompt) throw new Error('Empty shot list from Claude')
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Shot list generation failed' }, { status: 500 })
  }

  // 4. Only actually submit to Seedance — the real cost — if the requester
  // already has an active paid subscription. Otherwise the fully-prepared
  // prompt is held; /api/status submits it for real the moment payment is
  // confirmed (see its 'awaiting_payment' handling). This means an
  // anonymous or unpaid visitor can still see their script written for free
  // (one cheap Claude call), but no Seedance cost is ever incurred before
  // payment — writing a script and rendering a video are now genuinely
  // separate cost events.
  const subscription = user ? getSubscription(user.id) : null
  const isPaid = subscription?.status === 'active'

  // A paid account can still be tapped out for the cycle — the real Seedance
  // cost must never fire past the plan's monthly video allowance, checked
  // fresh here (not trusted from whenever they last checked their usage).
  if (isPaid && subscription!.videoAllowance != null && subscription!.videosUsedThisCycle >= subscription!.videoAllowance) {
    return NextResponse.json({
      error: `You've used all ${subscription!.videoAllowance} videos in your current billing cycle. Upgrade your plan to generate more.`,
      upgradeUrl: '/billing',
    }, { status: 402 })
  }

  if (!isPaid) {
    updateSession(session.id, {
      scripts: [script],
      ...(analysis ? { briefAnalysis: analysis } : {}),
      renders: [{
        scriptId: script.id,
        hookType: script.hookType,
        hookLine: script.hookLine,
        status: 'queued',
        startedAt: new Date().toISOString(),
      }],
      seedancePipeline: {
        status: 'awaiting_payment',
        characterSheet,
        attempts: [],
        maxRetries: 2,
        pendingSubmission: {
          prompt,
          referenceImageUrls: characterSheet.referenceImageUrls,
          durationSeconds: script.estimatedDurationSeconds,
        },
      },
    })
    return NextResponse.json({ sessionId: session.id })
  }

  const submitResult = await submitShot({
    prompt,
    referenceImageUrls: characterSheet.referenceImageUrls,
    durationSeconds: script.estimatedDurationSeconds,
  })

  if ('error' in submitResult) {
    updateSession(session.id, {
      scripts: [script],
      ...(analysis ? { briefAnalysis: analysis } : {}),
      renders: [{
        scriptId: script.id,
        hookType: script.hookType,
        hookLine: script.hookLine,
        status: 'failed',
        error: submitResult.error,
        startedAt: new Date().toISOString(),
      }],
      seedancePipeline: {
        status: 'failed',
        characterSheet,
        attempts: [{ attempt: 1, status: 'failed', prompt, error: submitResult.error }],
        maxRetries: 2,
      },
    })
    return NextResponse.json({ error: submitResult.error }, { status: 500 })
  }

  // 5. Save everything to session — `renders` kept in sync (no videoUrl yet)
  // purely so the output page's existing "queued" state renders correctly.
  updateSession(session.id, {
    scripts: [script],
    ...(analysis ? { briefAnalysis: analysis } : {}),
    renders: [{
      scriptId: script.id,
      hookType: script.hookType,
      hookLine: script.hookLine,
      status: 'queued',
      startedAt: new Date().toISOString(),
    }],
    seedancePipeline: {
      status: 'generating',
      characterSheet,
      attempts: [{ attempt: 1, status: 'queued', taskId: submitResult.taskId, prompt }],
      maxRetries: 2,
    },
  })

  return NextResponse.json({ sessionId: session.id })
}
