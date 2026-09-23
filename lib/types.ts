// Sentinel "avatar" id meaning: don't lock to a specific face — let Seedance
// invent whoever fits the brief. Used by the /pick picker (client) and
// /api/quickgen (server) — lives here, not lib/avatars.ts, since that file
// imports Node's fs/path and can't be pulled into a client component.
export const AUTO_CAST_ID = '__auto_cast__'

// Sentinel meaning: no on-camera character at all — a cinematic,
// product-focused ad with shot-direction instead of spoken dialogue. Not a
// third "who's the face" option — this skips the character system entirely.
export const NO_CHARACTER_ID = '__no_character__'

export type AvatarConfig = {
  avatarId: string
  avatarName: string
  previewImageUrl: string
  voiceId: string
  voiceName: string
}

export type Brief = {
  brandName: string
  offer: string
  targetCustomer: string
}

export type HookType =
  | 'problem_solution'
  | 'before_after'
  | 'testimonial'
  | 'cold_open'
  | 'curiosity_gap'

export const HOOK_LABELS: Record<HookType, string> = {
  problem_solution: 'Problem / Solution',
  before_after: 'Before / After',
  testimonial: 'Testimonial',
  cold_open: 'Cold Open',
  curiosity_gap: 'Curiosity Gap',
}

export type ScriptVariant = {
  id: string
  hookType: HookType
  hookLine: string
  body: string
  cta: string
  pacingNotes: string
  estimatedDurationSeconds: number
}

export type RenderStatus = 'queued' | 'processing' | 'completed' | 'failed'

export type RenderJob = {
  scriptId: string
  hookType: HookType
  hookLine: string
  videoId?: string
  status: RenderStatus
  videoUrl?: string
  duration?: number
  error?: string
  startedAt: string
}

export type BriefAnalysis = {
  verdict: 'proceed' | 'flag' | 'block'
  brand_tier: 'budget' | 'mid' | 'premium' | 'luxury'
  production: { clips: number; quality: string; clip_duration: number }
  rationale: string
  flag_message: string | null
}

export type PipelineStage = {
  status: 'idle' | 'processing' | 'completed' | 'failed'
  taskId?: string
  videoUrl?: string
  duration?: number
  error?: string
}

export type BrollClip = PipelineStage & {
  index: number
  prompt: string
  clipType: 't2v' | 'i2v'
}

export type Pipeline = {
  avatar: PipelineStage
  broll: BrollClip[]
  compose: PipelineStage
  finalVideoUrl?: string
  fallbackMode?: boolean
}

export type Session = {
  id: string
  createdAt: string
  userId?: string // unset while anonymous — claimed at signup/onboarding time
  avatar?: AvatarConfig
  brief?: Brief
  briefAnalysis?: BriefAnalysis
  scripts?: ScriptVariant[]
  renders: RenderJob[]
  pipeline?: Pipeline
  seedancePipeline?: SeedancePipeline
}

// ── Seedance (single-model multi-shot generation) ──────────────────────────
//
// Seedance generates a whole multi-shot ad — talking character, dialogue,
// lip-sync, cutaways, music — in one continuous pass, conditioned on 1-3
// reference photos that lock the character's identity across every shot.
// There's no dedicated "character sheet" endpoint on their side; a character
// sheet here just means "the reference photo(s) + identity description we
// feed into every generation attempt for this session."

export type CharacterSheet = {
  status: 'idle' | 'ready' | 'failed'
  referenceImageUrls: string[]
  description: string
  error?: string
}

export type QualityGateResult = {
  pass: boolean
  reason?: string
  checkedAt: string
}

export type SeedanceAttempt = {
  attempt: number
  status: 'queued' | 'processing' | 'completed' | 'failed'
  taskId?: string
  prompt: string
  seed?: number
  videoUrl?: string
  error?: string
  qualityGate?: QualityGateResult
}

export type SeedancePipeline = {
  status: 'awaiting_payment' | 'idle' | 'character_sheet' | 'generating' | 'quality_check' | 'completed' | 'failed'
  characterSheet: CharacterSheet
  attempts: SeedanceAttempt[]
  maxRetries: number
  finalVideoUrl?: string
  // Set when status is 'awaiting_payment' — the fully-prepared Seedance
  // submission, held until the owning account has an active subscription.
  // No Seedance call happens (no cost incurred) until this actually submits.
  pendingSubmission?: {
    prompt: string
    referenceImageUrls: string[]
    durationSeconds: number
  }
}

export type HeyGenAvatar = {
  avatar_id: string
  avatar_name: string
  preview_image_url: string
  gender?: string
}

export type HeyGenVoice = {
  voice_id: string
  name: string
  language: string
  gender: string
}
