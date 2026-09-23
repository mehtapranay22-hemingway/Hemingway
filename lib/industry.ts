// Shared industry list + the category-flag mapping that actually drives the
// script generation system prompt (see app/api/quickgen/route.ts). Defined
// once here so the onboarding form and the generation pipeline can't drift
// out of sync with each other.
//
// The scriptwriter system prompt only has four defined creative registers
// (aspirational-relational / aspirational-physical / relatable-ritual /
// relatable-transformation — see CATEGORY_DIRECTION in quickgen/route.ts).
// Each of these 11 real verticals is mapped onto whichever register fits its
// actual emotional center, not treated as its own bespoke register — flagged
// here so the mapping is visible and correctable, not buried.

export const INDUSTRIES = [
  'Jewelry & Accessories',
  'Beauty & Skincare',
  'Apparel & Fashion',
  'Footwear',
  'Food & Beverage',
  'Wellness & Supplements',
  'Fitness & Activewear',
  'Home Goods',
  'Pet Products',
  'Automotive & Performance',
  'Tech & Gadgets',
] as const

export type Industry = (typeof INDUSTRIES)[number]

export type CategoryFlag = 'jewelry' | 'beauty' | 'wellness' | 'automotive'

// Falls back to the wellness/relatable-ritual register — the safest
// general-purpose one — for anything unrecognized (there's no "Other" option
// in the list above anymore, but this stays as a safety net).
const INDUSTRY_TO_CATEGORY: Record<string, CategoryFlag> = {
  'Jewelry & Accessories': 'jewelry',       // aspirational-relational — gifting, someone else's reaction
  'Pet Products': 'jewelry',                // aspirational-relational — the pet's reaction, still relational warmth

  'Beauty & Skincare': 'beauty',            // relatable-transformation — visible change
  'Apparel & Fashion': 'beauty',            // relatable-transformation — self-image, "does this work for me"
  'Tech & Gadgets': 'beauty',               // relatable-transformation — concrete specific claims over vague ones

  'Automotive & Performance': 'automotive', // aspirational-physical — power, control, the self
  'Footwear': 'automotive',                 // aspirational-physical — how it feels in motion
  'Fitness & Activewear': 'automotive',     // aspirational-physical — body, performance, identity

  'Food & Beverage': 'wellness',            // relatable-ritual — daily habit, home setting
  'Wellness & Supplements': 'wellness',     // relatable-ritual — small daily win, self-care
  'Home Goods': 'wellness',                 // relatable-ritual — home, routine, unpolished
}

export function categoryFlagForIndustry(industry: string): CategoryFlag {
  return INDUSTRY_TO_CATEGORY[industry] ?? 'wellness'
}
