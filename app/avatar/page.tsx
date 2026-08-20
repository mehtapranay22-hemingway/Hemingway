'use client'

import { useEffect, useState, Suspense } from 'react'
import Image from 'next/image'
import Sidebar from '../components/Sidebar'
import type { HeyGenAvatar, HeyGenVoice } from '@/lib/types'

function AvatarSettings() {
  const [avatars, setAvatars] = useState<HeyGenAvatar[]>([])
  const [voices, setVoices] = useState<HeyGenVoice[]>([])
  const [selectedAvatar, setSelectedAvatar] = useState<HeyGenAvatar | null>(null)
  const [selectedVoice, setSelectedVoice] = useState<HeyGenVoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [avatarRes, voiceRes, prefRes] = await Promise.all([
          fetch('/api/avatars'),
          fetch('/api/voices'),
          fetch('/api/preferences'),
        ])

        const avatarData = await avatarRes.json()
        if (!avatarRes.ok) { setError(avatarData.error || 'Failed to load avatars'); return }

        const { avatars: a } = avatarData
        const { voices: v } = voiceRes.ok ? await voiceRes.json() : { voices: [] }
        const pref = prefRes.ok ? await prefRes.json() : {}

        setAvatars(a || [])
        setVoices(v || [])

        // Pre-select saved preference
        if (pref.avatarId) {
          const saved = a?.find((av: HeyGenAvatar) => av.avatar_id === pref.avatarId)
          if (saved) setSelectedAvatar(saved)
        } else {
          // Default to first female
          const female = a?.find((av: HeyGenAvatar) => av.gender?.toLowerCase() === 'female')
          setSelectedAvatar(female || a?.[0] || null)
        }

        if (pref.voiceId) {
          const savedVoice = v?.find((vo: HeyGenVoice) => vo.voice_id === pref.voiceId)
          if (savedVoice) setSelectedVoice(savedVoice)
        } else {
          setSelectedVoice(v?.[0] || null)
        }
      } catch {
        setError('Could not load avatars. Check your HEYGEN_API_KEY.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSave() {
    if (!selectedAvatar || !selectedVoice) return
    setSaving(true)
    setSaved(false)
    try {
      await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatarId: selectedAvatar.avatar_id,
          avatarName: selectedAvatar.avatar_name,
          voiceId: selectedVoice.voice_id,
          voiceName: selectedVoice.name,
        }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-[#F7F5F2]">
      <Sidebar />
      <div className="ml-56 flex-1">
        <div className="sticky top-0 z-10 bg-[#F7F5F2]/90 backdrop-blur-sm border-b border-[#E8E5DF] px-8 py-3">
          <span className="text-sm text-ink">Avatar settings</span>
        </div>

        <div className="px-8 py-10 max-w-5xl">
          <h1 className="font-display text-3xl text-ink mb-1">Default avatar</h1>
          <p className="text-muted text-sm mb-10">
            Set once. Used for all video renders unless you change it.
          </p>

          {loading && <p className="text-muted text-sm">Loading avatars from HeyGen...</p>}

          {error && (
            <div className="border border-error/30 bg-error/5 text-error text-sm px-5 py-4 mb-8 max-w-lg">
              <div className="font-medium mb-1">Could not load avatars</div>
              <div className="text-error/80 text-xs mt-1">{error}</div>
            </div>
          )}

          {!loading && !error && avatars.length === 0 && (
            <p className="text-muted text-sm">No avatars returned from HeyGen.</p>
          )}

          {avatars.length > 0 && (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 mb-10">
                {avatars.map(avatar => {
                  const isSelected = selectedAvatar?.avatar_id === avatar.avatar_id
                  return (
                    <button
                      key={avatar.avatar_id}
                      onClick={() => setSelectedAvatar(avatar)}
                      className={[
                        'text-left border bg-white transition-all',
                        isSelected ? 'border-accent border-2' : 'border-divider hover:border-muted',
                      ].join(' ')}
                    >
                      <div className="relative aspect-[3/4] bg-divider overflow-hidden">
                        {avatar.preview_image_url ? (
                          <Image
                            src={avatar.preview_image_url}
                            alt={avatar.avatar_name}
                            fill
                            className="object-cover"
                            sizes="160px"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted text-xs">
                            No preview
                          </div>
                        )}
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-5 h-5 bg-accent flex items-center justify-center">
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="px-2 py-2">
                        <div className="text-xs text-ink truncate">{avatar.avatar_name}</div>
                        {avatar.gender && (
                          <div className="text-xs text-muted capitalize">{avatar.gender}</div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>

              {voices.length > 0 && (
                <div className="mb-10">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">Voice</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {voices.map(voice => {
                      const isSelected = selectedVoice?.voice_id === voice.voice_id
                      return (
                        <button
                          key={voice.voice_id}
                          onClick={() => setSelectedVoice(voice)}
                          className={[
                            'text-left px-4 py-3 border bg-white transition-all',
                            isSelected ? 'border-accent border-2' : 'border-divider hover:border-muted',
                          ].join(' ')}
                        >
                          <div className="text-sm font-medium text-ink">{voice.name}</div>
                          <div className="text-xs text-muted capitalize">{voice.gender}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4">
                <button
                  onClick={handleSave}
                  disabled={!selectedAvatar || !selectedVoice || saving}
                  className="bg-ink text-cream px-8 py-3 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-40"
                >
                  {saving ? 'Saving...' : 'Save default avatar'}
                </button>
                {saved && (
                  <span className="text-sm text-accent font-medium">Saved ✓</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AvatarPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen bg-[#F7F5F2]">
        <Sidebar />
        <div className="ml-56 flex-1 flex items-center justify-center">
          <p className="text-muted text-sm">Loading...</p>
        </div>
      </div>
    }>
      <AvatarSettings />
    </Suspense>
  )
}
