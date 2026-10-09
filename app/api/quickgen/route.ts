import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSession, updateSession } from '@/lib/sessions'
import { resolveAvatarImage } from '@/lib/avatars'
import { saveTemporaryImage } from '@/lib/uploads'
import { buildCharacterSheet, submitShot } from '@/lib/seedance'
import { randomUUID } from 'crypto'
import { AUTO_CAST_ID, NO_CHARACTER_ID, type ScriptVariant } from '@/lib/types'
import { getClientProfile, getSubscription, getRecentKeptAds, type KeptAd } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { categoryFlagForIndustry, type CategoryFlag } from '@/lib/industry'
import { checkRateLimit, clientIp } from '@/lib/ratelimit'
import { isOwner, checkOwnerDailyLimit, logRenderCost } from '@/lib/owner'

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
type NarrativeInfo = { has_arc: boolean; payoff_beat: string | null }

// A concrete timecode breakdown is a much stronger pacing anchor for Claude
// than a bare shot count or duration alone — Seedance's own prompting
// examples are written this way, and it's what actually lets duration_seconds
// (now variable per brief, see analyze-brief) translate into real pacing
// instead of just a target number nothing else respects. Suggestion, not a
// rigid contract — Claude can adjust shot count, but every shot should open
// with one of these ranges or something close to it.
function suggestTimecodes(totalSeconds: number, shotCount: number): string {
  const n = Math.max(1, Math.round(shotCount))
  const base = Math.floor(totalSeconds / n)
  const remainder = totalSeconds - base * n
  const ranges: string[] = []
  let t = 0
  for (let i = 0; i < n; i++) {
    const dur = base + (i < remainder ? 1 : 0)
    const next = t + dur
    ranges.push(`${t}-${next}s`)
    t = next
  }
  return ranges.join(', ')
}

function buildScriptSystem(category: CategoryFlag, pastKept: KeptAd[], narrative?: NarrativeInfo): string {
  // A narrative brief (a story with a setup and a payoff, not a plain
  // product pitch) needs the payoff explicitly protected — otherwise it's
  // the first thing that gets silently compressed out when the script has
  // to fit 15-30 seconds, since nothing below tells the model the ending
  // is the point, the way it already protects the CTA.
  const narrativeSection = narrative?.has_arc && narrative.payoff_beat
    ? `
This brief tells a STORY, not a plain product pitch — it has a setup and a payoff: "${narrative.payoff_beat}"
That payoff is the entire point of this ad. Structure the hook and body so it is guaranteed to land clearly — if anything has to be trimmed or compressed to fit the runway, trim setup detail first, never the payoff. The CTA still closes it out, but the payoff itself must be told on screen, not implied, summarized away, or skipped.
`
    : ''

  return `You are a direct-response ad scriptwriter for short-form vertical video (15-30 seconds), writing scripts that will be performed by an AI avatar.
${narrativeSection}
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

// A working vocabulary of camera/lighting technique mapped to the JOB it
// does — not a menu for the end user (they never see this), but the thing
// that lets Claude choose with directorial intent instead of defaulting to
// generic description or the same few moves every time. Shared between the
// dialogue and cinematic system prompts below.
const DIRECTOR_TOOLKIT = `Director's toolkit — camera, lighting, and capture-format technique, each with a specific job. Choose deliberately based on what THIS video and THIS shot need to do emotionally, not generically or at random:

Capture format (choose ONCE per video, state it explicitly, keep it consistent across every shot — this is the native medium the whole thing was "shot on," not a per-shot choice):
- Selfie / front-camera phone: raw, intimate, trustworthy — strong default for direct-to-camera UGC testimonial.
- Handheld camcorder / DV tape: nostalgic, playful, unmistakably authentic — strong for vlog-style, Gen-Z-leaning, or "day in the life" content. Specify the texture explicitly: tape noise, bloomed highlights, flickering auto-exposure, soft/slightly blurry quality, muted contrast.
- Propped phone, hands-free POV: natural imperfection, candid — strong for tutorial, fitness, or any beat where the subject's hands need to be free.
- Clean tripod / gimbal, crisp 4K: polished, premium, intentional — strong for luxury hero shots and product-only cinematic.
- Found-footage / accidental framing: occasional misalignment, delayed focus pulls, face cut off at the edge of frame — stacks with any handheld format above to push authenticity further.
Match format to the brand tier and audience, not out of habit — a $180 fragrance and a $25 gym supplement should not default to the same capture format.

Camera movement — constrained by the capture format you picked above. A propped phone or selfie-cam physically cannot orbit, crane, or dolly; it can only stay static, drift with the body holding it, or whip to a new framing. Never call for a move the chosen format couldn't actually produce:
- Push-in (slow move toward subject): builds tension, signals "this matters" — strong for a hook or an emotional beat. Tripod/gimbal only.
- Pull-back / reveal: unveils context or scale after a tight detail — strong for a "wait for it" moment. Tripod/gimbal only.
- Orbit (circles the subject): showcases full form and craftsmanship — strong for a hero product shot. Tripod/gimbal only.
- Tracking (moves alongside the subject): creates momentum and energy — strong for action or a walk-and-talk. Tripod/gimbal, or handheld if someone is visibly walking and filming.
- Static lockoff: calm, confident, lets the subject speak for itself — strong for dialogue-heavy or trust-building beats. Any format, including propped phone.
- Handheld drift: authentic, lived-in, UGC-native — natural for any handheld or propped format, including when the subject's own movement (not the camera operator) causes the drift.
- Whip pan: fast, jarring transition between two beats — strong for a hard cut between before/after or a scene change. Any handheld format.
- Crane / rise: scale and grandeur — strong for an epic reveal or a finale. Tripod/gimbal only.
- Macro push/slide: luxury, texture, craftsmanship — strong for premium product detail. Tripod/gimbal only.

Lighting:
- Soft, diffused: approachable, gentle — wellness, skincare, everyday-use products.
- Hard, directional: bold, premium, aspirational — luxury, automotive, high-status products.
- Warm/golden: emotional, inviting, nostalgic — relational or gifting moments.
- Bright, high-key: clean, optimistic, energetic — budget/mid-tier, youthful brands.
- Low-key, moody: exclusivity, mystery — luxury reveals, premium hero shots.

Pick technique by the JOB each shot has to do (hook grabs attention, setup builds context, payoff lands the point, CTA closes) — not by habit, and not by what the last few generations used. Vary your choices genuinely across generations.`

// Seedance generates a whole multi-shot ad — talking character, lip-synced
// dialogue, cutaways, music — in one continuous pass from a single prompt
// plus zero or more reference images. This replaces the old three-service
// pipeline (HeyGen avatar render -> Kling B-roll -> Shotstack compose)
// entirely; no separate stitching step needed because Seedance edits itself.
const SEEDANCE_SYSTEM = `You are a director translating a video ad script into a single Seedance generation prompt.

Seedance generates a whole multi-shot ad in ONE continuous pass — talking character, lip-synced dialogue, cutaways, and music — from one text prompt plus zero or more reference images, numbered [Image1], [Image2], ... in the order given to you below.

${DIRECTOR_TOOLKIT}

Rules:
- State the capture format explicitly before the shot list (one line: format + its texture/color-science detail from the toolkit above), and keep it consistent across every shot — the whole video is "shot on" one native medium, not a different one per cutaway.
- If spokesperson reference image(s) are given, every shot featuring them must reference those image numbers and keep identity, outfit, and setting consistent across the whole video. If multiple images are given for the spokesperson, they're the same person from different angles, not different people. If no spokesperson reference is given, invent one — and describe them with real specificity in the first shot, not a vague fit-description: hair (color, length, style), skin/makeup, build, exact wardrobe (garment, color, cut), any accessories, and expression. Enough detail that later shots can consistently refer back to "the spokesperson" as a specific person, not a generic placeholder.
- If a product reference image is given, every shot showing the product — especially cutaways — must reference that image number and match its real appearance (color, shape, packaging). Never invent a different-looking product when a real reference exists.
- The final shot that closes on the product (usually the CTA beat) must be a clean, legible hero angle — full product visible, well-lit, nothing cropped or shown from an awkward/extreme angle — even though earlier cutaways default to rougher handheld UGC style. This is the shot doing the most commercial work in the whole video; a bad angle there undercuts everything before it.
- Put every spoken line in double quotes exactly as given, so Seedance lip-syncs it — never paraphrase the provided dialogue.
- Structure it as a shot list, each line starting with its timecode range (e.g. "0-4s: ..."). Timecodes must be contiguous and sum to the target duration — this is a stronger pacing signal than a bare shot count, and matches how Seedance's own examples are written.
- Cutting away from the spokesperson to a separate shot of the product is a tool, not a default — use it only when there's a genuine reason (a clean look at the product, a detail the dialogue just referenced). If the brief is one continuous activity or scene (e.g. a vlog-style routine, a single ongoing moment), keep the camera on the spokesperson doing that activity for every shot instead of inventing a cutaway just to vary the shot — the reference material this mechanic is based on never cuts away from the person at all, and that continuity is part of why it reads as authentic. Default to staying with the person; only cut away when the moment actually earns it.
- Name the camera movement and lighting choice explicitly in each shot's description, matched to that shot's job (hook/setup/payoff/CTA) and physically consistent with the capture format — not left implicit, and never a move the format couldn't produce.
- Keep the total run time close to the target duration.
- If the brief below marks this as a narrative with a payoff beat, that beat must appear as its own clearly depicted shot — never compressed into a cutaway, background action, or summarized in the spokesperson's line without being shown. If any shot needs cutting to fit the duration, cut setup shots first, never the payoff.
- Output plain text only: the shot list, one shot per line, no markdown, no JSON, no commentary before or after.`

async function generateSeedancePrompt(params: {
  description: string
  script: ScriptVariant
  avatarGender?: string
  clipCount: number
  characterImageCount: number
  hasProductReference: boolean
  narrative?: NarrativeInfo
}): Promise<string> {
  const { description, script, avatarGender, clipCount, characterImageCount, hasProductReference, narrative } = params

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

  const payoffLine = narrative?.has_arc && narrative.payoff_beat
    ? `\nPayoff beat (must get its own shot, never cut or compressed): "${narrative.payoff_beat}"`
    : ''
  const suggestedShotCount = Math.max(3, Math.min(8, clipCount + 2))
  const timecodes = suggestTimecodes(script.estimatedDurationSeconds, suggestedShotCount)

  const userPrompt = `${refLines.join('\n')}
Target duration: ~${script.estimatedDurationSeconds}s
Suggested max cutaway/B-roll beats (a ceiling, not a quota — use fewer, or none, if the scene is one continuous activity that shouldn't be interrupted): ${clipCount}
Suggested timecode breakdown (adjust as needed, keep contiguous): ${timecodes}
Product: ${description}${payoffLine}

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
function buildCinematicSystem(category: CategoryFlag, pastKept: KeptAd[], narrative?: NarrativeInfo): string {
  const narrativeSection = narrative?.has_arc && narrative.payoff_beat
    ? `
This brief tells a STORY, not a plain product showcase — it has a setup and a payoff: "${narrative.payoff_beat}"
That payoff must appear as its own clearly depicted shot near the end, told visually since there's no dialogue here — never compressed into a background detail or cut for pacing. If any shot needs trimming to fit the runway, trim setup shots first, never the payoff shot.
`
    : ''

  return `You are a director writing a cinematic, product-focused Seedance video ad prompt — no persistent on-camera spokesperson, no branded character, no spoken dialogue delivered to camera.

Seedance generates a whole multi-shot ad in ONE continuous pass — camera movement, lighting, framing, pacing, transitions — from one text prompt structured as a numbered shot list.
${narrativeSection}
${DIRECTOR_TOOLKIT}

This client's category is fixed by their account profile — express its emotional center through cinematography and visual choices, not spoken dialogue or delivery style:

${CATEGORY_DIRECTION[category]}
${pastAdsSection(pastKept, 'cinematic shot lists')}

Rules:
- Structure the output as a shot list, each line starting with its timecode range (e.g. "0-4s: ..."), not just a shot number — 4 to 6 shots (narrative briefs may run up to 8, to leave room for the payoff). Timecodes must be contiguous and sum to the target duration.
- State the capture/finish explicitly before the shot list (one line: lens/finish character and color-grade mood — e.g. anamorphic warmth, clean digital crispness, film-grain texture) and keep it consistent across every shot. This mode is always the clean-tripod/gimbal end of the toolkit's capture-format spectrum, never handheld camcorder or selfie-cam imperfection — that belongs to UGC mode, not here.
- Vary the opening shot, setting, and camera approach genuinely across generations — don't default to the same establishing shot or lighting setup every time, including relative to this client's own past kept shot lists above. Treat those as a reference for quality and tone only, never a template to reuse.
- Every shot is pure visual/camera direction: framing, camera movement, lighting, pacing, transitions — name the specific technique from the toolkit above and why it fits that shot's job, don't leave it generic. No spoken lines, no dialogue in quotes, no voiceover, no named character.
- An incidental, unnamed person may appear where a shot calls for it (e.g. "a hand reaches for the box," "someone walking past in soft focus, out of focus"). Describe them only by the action — never name them, never describe them with enough consistent detail to imply a recurring identity across shots. A different unnamed person in each shot is fine; there is no identity to maintain.
- If a product reference image is given (it will be described to you as an image number below), every shot showing the product must reference that image number and match its real appearance exactly — color, shape, packaging. Never invent a different-looking product when a real reference exists.
- The final shot that closes on the product must be a clean, legible hero angle — full product visible, well-lit, nothing cropped or shown from an awkward/extreme angle. This is the shot doing the most commercial work in the whole video.
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
  narrative?: NarrativeInfo
}): Promise<string> {
  const { description, category, clipCount, durationSeconds, hasProductReference, pastKept, narrative } = params

  const productLine = hasProductReference
    ? `Product reference: [Image1] — the actual product. Every shot showing it must match this exactly.`
    : `No product reference photo was provided — render the product as faithfully as the brief allows.`

  const payoffLine = narrative?.has_arc && narrative.payoff_beat
    ? `\nPayoff beat (must get its own shot, never cut or compressed): "${narrative.payoff_beat}"`
    : ''

  const maxShots = narrative?.has_arc ? 8 : 6
  const shotCount = Math.max(4, Math.min(maxShots, clipCount + 2))
  const timecodes = suggestTimecodes(durationSeconds, shotCount)
  const userPrompt = `${productLine}
Target duration: ~${durationSeconds}s
Suggested number of distinct shots: ${shotCount}
Suggested timecode breakdown (adjust as needed, keep contiguous): ${timecodes}
Product/brief: ${description}${payoffLine}

Write the cinematic shot list now.`

  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 600,
    system: buildCinematicSystem(category, pastKept, narrative),
    messages: [{ role: 'user', content: userPrompt }],
  })
  return msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { avatarId, avatarGender, description, imageBase64, imageMediaType, analysis, motionReferenceUrl } = body || {}
  // motionReferenceUrl: NOT wired into any UI yet — experimental, direct-API-only
  // field for testing the unconfirmed Omni Reference video support (see the
  // long comment on submitShot in lib/seedance.ts). A real https:// URL to a
  // short (2-30s) video clip whose camera motion/rhythm Seedance should
  // reference. Pass it in the POST body directly to test.

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
  const user = await getCurrentUser(req)

  // Script-writing is a real Claude call even for unpaid/anonymous
  // visitors (Seedance itself stays gated separately below) — this caps
  // that cost regardless of account state. Keyed by account when signed
  // in (survives IP changes), by IP otherwise.
  const rateLimitKey = user ? `quickgen:user:${user.id}` : `quickgen:ip:${clientIp(req)}`
  const { allowed, retryAfterSeconds } = await checkRateLimit(rateLimitKey, 20, 3600)
  if (!allowed) {
    return NextResponse.json({
      error: 'Too many generation requests. Try again shortly.',
    }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } })
  }

  const session = await createSession(user?.id)

  // Category comes from the client's onboarding profile, not the brief —
  // see buildScriptSystem() above for why. No account/profile yet (the
  // common case for a first-ever generation) falls back to the safe default
  // register instead of blocking.
  const clientProfile = user ? await getClientProfile(user.id) : null
  const category = categoryFlagForIndustry(clientProfile?.industry ?? 'Other')

  // From /api/analyze-brief — a narrative brief (a story with a payoff, not
  // a plain product pitch) gets more runway and an explicit guarantee the
  // payoff survives; see buildScriptSystem/buildCinematicSystem above.
  const narrative = analysis?.narrative as NarrativeInfo | undefined
  const durationSeconds = (analysis?.production?.duration_seconds ?? 20) as number

  const isAutoCast = avatarId === AUTO_CAST_ID
  const isNoCharacter = avatarId === NO_CHARACTER_ID

  // Lightweight memory: this client's own past ads they actually downloaded,
  // fed back in as few-shot examples below — see lib/db.ts for the "why".
  // One query for whichever mode this generation actually is, not both.
  const pastKept = user ? await getRecentKeptAds(user.id, isNoCharacter ? 'cinematic' : 'dialogue', 3) : []

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
        durationSeconds,
        hasProductReference: !!imageBase64,
        pastKept,
        narrative,
      })
      if (!cinematicPrompt) throw new Error('Empty cinematic shot list from Claude')

      // What's shown on the output page's typewriter is NOT what gets sent
      // to Seedance — cinematicPrompt (used later, unmodified) needs its
      // literal "Image1" reference tokens for the API to work; showing those
      // to a person reads as broken. Strip them and break onto separate
      // lines per shot for a display-only version.
      // Shots are now timecoded ("0-4s: ..."), not numbered ("Shot 1: ...")
      // — match both so this doesn't quietly stop line-breaking if either
      // format shows up.
      const displayText = cinematicPrompt
        .replace(/\[?Image\d+\]?/gi, 'the product')
        .replace(/\s*(\d+-\d+s:|Shot \d+:)/g, '\n$1')
        .trim()

      script = {
        id: randomUUID().slice(0, 8),
        hookType: 'problem_solution', // field reused for storage shape only — not meaningful in cinematic mode
        hookLine: 'A cinematic, product-focused film.',
        body: displayText,
        cta: '',
        pacingNotes: '',
        estimatedDurationSeconds: durationSeconds,
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
        system: buildScriptSystem(category, pastKept, narrative),
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
        estimatedDurationSeconds: durationSeconds,
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
    // Custom avatars live on Vercel Blob (see lib/avatars.ts) — real
    // https:// URLs, directly fetchable by Seedance's cloud with no
    // conversion needed.
    characterImageUrls = resolvedAvatar.imageUrls
    characterName = resolvedAvatar.name
  }

  // 2b. If the user attached a product photo, add it as its own reference —
  // previously this only ever reached the script-writing call, never
  // Seedance, so cutaways showed a hallucinated product even when a real
  // photo was uploaded. Uploaded to Blob and referenced by its real URL —
  // same reasoning as the avatar photos above.
  let productImageUrl: string | undefined
  if (imageBase64) {
    productImageUrl = await saveTemporaryImage(imageBase64, imageMediaType || 'image/jpeg')
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
        narrative,
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
  const subscription = user ? await getSubscription(user.id) : null
  const isPaid = subscription?.status === 'active'

  // Owner exemption (lib/owner.ts) — a verified-email match against
  // OWNER_EMAILS skips the subscription/credit gate entirely below, but
  // still goes through auth, input validation, and rate limits above, plus
  // its own daily cap so a bug or loop can't drain the real BytePlus
  // balance. Never enforced client-side — this is the actual gate.
  const ownerExempt = isOwner(user)
  if (ownerExempt) {
    const { allowed: underDailyCap } = await checkOwnerDailyLimit(user!.id)
    if (!underDailyCap) {
      return NextResponse.json({
        error: 'Owner daily render limit reached. Try again tomorrow (UTC).',
      }, { status: 429 })
    }
  }

  // A paid account can still be tapped out for the cycle — the real Seedance
  // cost must never fire past the plan's monthly video allowance, checked
  // fresh here (not trusted from whenever they last checked their usage).
  // Owners skip this check entirely — see the daily cap above instead.
  if (!ownerExempt && isPaid && subscription!.videoAllowance != null && subscription!.videosUsedThisCycle >= subscription!.videoAllowance) {
    return NextResponse.json({
      error: `You've used all ${subscription!.videoAllowance} videos in your current billing cycle. Upgrade your plan to generate more.`,
      upgradeUrl: '/billing',
    }, { status: 402 })
  }

  if (!isPaid && !ownerExempt) {
    await updateSession(session.id, {
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
    referenceVideoUrl: typeof motionReferenceUrl === 'string' ? motionReferenceUrl : undefined,
    durationSeconds: script.estimatedDurationSeconds,
  })

  logRenderCost({
    userId: user?.id ?? null,
    isOwner: ownerExempt,
    durationSeconds: script.estimatedDurationSeconds,
    status: 'error' in submitResult ? 'failed' : 'submitted',
  })

  if ('error' in submitResult) {
    await updateSession(session.id, {
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
  await updateSession(session.id, {
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
