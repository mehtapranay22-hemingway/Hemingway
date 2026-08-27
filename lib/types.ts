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
  avatar?: AvatarConfig
  brief?: Brief
  briefAnalysis?: BriefAnalysis
  scripts?: ScriptVariant[]
  renders: RenderJob[]
  pipeline?: Pipeline
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
