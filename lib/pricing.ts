// Subscription tier definitions — the single source of truth for names,
// video allowances, prices, and feature copy. Both the billing page (client)
// and the server-side gating/checkout logic import from here, so a tier
// never drifts out of sync between what's displayed and what's enforced.
//
// "Credits" are purely a display/branding layer (1 video = CREDITS_PER_VIDEO
// credits) — the real limit enforced everywhere is always the plain video
// count (see lib/db.ts videoAllowance / videosUsedThisCycle). Never compare
// or store credits directly; convert at the display boundary only.

export type TierId = 'minimum' | 'growth' | 'scale' | 'enterprise'

export const CREDITS_PER_VIDEO = 250

export type Tier = {
  id: TierId
  name: string
  videoAllowance: number | null // null = custom/enterprise, no fixed number
  monthlyPriceUsd: number | null // null = custom/enterprise, no self-serve price
  recommended: boolean
  enterprise: boolean
  features: string[]
}

export const TIERS: Tier[] = [
  {
    id: 'minimum',
    name: 'Minimum',
    videoAllowance: 3,
    monthlyPriceUsd: 49.99,
    recommended: false,
    enterprise: false,
    features: [
      'UGC-style or cinematic ads',
      'Standard generation queue',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    videoAllowance: 8,
    monthlyPriceUsd: 139.99,
    recommended: true,
    enterprise: false,
    features: [
      'UGC-style or cinematic ads',
      'Priority generation queue',
      'Saved avatars & product references',
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    videoAllowance: 14,
    monthlyPriceUsd: 189.99,
    recommended: false,
    enterprise: false,
    features: [
      'UGC-style or cinematic ads',
      'Priority generation queue',
      'Saved avatars & product references',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    videoAllowance: null,
    monthlyPriceUsd: null,
    recommended: false,
    enterprise: true,
    features: [
      'Custom monthly video volume',
      'Dedicated onboarding',
      'Priority support',
    ],
  },
]

export function getTier(id: string): Tier | undefined {
  return TIERS.find(t => t.id === id)
}

export function creditsForVideos(videos: number): number {
  return videos * CREDITS_PER_VIDEO
}
