'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import Sidebar from '../components/Sidebar'

type CustomAvatar = {
  id: string
  name: string
  imageUrl: string
  gender?: string
  uploadedAt: string
}

export default function AvatarPage() {
  const [avatars, setAvatars] = useState<CustomAvatar[]>([])
  const [loading, setLoading] = useState(true)
  const [signedOut, setSignedOut] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [gender, setGender] = useState('')
  const [pendingFile, setPendingFile] = useState<{ dataUrl: string; base64: string; mediaType: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function load() {
    fetch('/api/avatars/upload')
      .then(r => {
        if (r.status === 401) { setSignedOut(true); return { avatars: [] } }
        return r.json()
      })
      .then(data => setAvatars(data.avatars || []))
      .catch(() => setError('Could not load your avatars'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  if (!loading && signedOut) {
    return (
      <div className="flex min-h-screen bg-[#F7F5F2]">
        <Sidebar />
        <div className="ml-56 flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <p className="font-display text-2xl text-ink mb-2">Sign in to manage avatars.</p>
            <p className="text-muted text-sm mb-6">Avatars are saved to your account.</p>
            <Link href="/signin?next=/avatar" className="inline-block bg-ink text-cream px-6 py-3 text-sm font-medium hover:bg-accent transition-colors">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 8 * 1024 * 1024) { setError('Image must be under 8MB'); return }
    setError('')
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      const base64 = dataUrl.split(',')[1]
      setPendingFile({ dataUrl, base64, mediaType: file.type })
      if (!name) setName(file.name.replace(/\.[^.]+$/, ''))
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!pendingFile || !name.trim()) return
    setUploading(true)
    setError('')
    try {
      const res = await fetch('/api/avatars/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          gender: gender || undefined,
          imageBase64: pendingFile.base64,
          imageMediaType: pendingFile.mediaType,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setAvatars(prev => [...prev, data.avatar])
      setPendingFile(null)
      setName('')
      setGender('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id: string) {
    const prev = avatars
    setAvatars(prev.filter(a => a.id !== id))
    try {
      const res = await fetch(`/api/avatars/upload?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
    } catch {
      setError('Could not delete — restoring')
      setAvatars(prev)
    }
  }

  return (
    <div className="flex min-h-screen bg-[#F7F5F2]">
      <Sidebar />
      <div className="ml-56 flex-1">
        <div className="sticky top-0 z-10 bg-[#F7F5F2]/90 backdrop-blur-sm border-b border-[#E8E5DF] px-8 py-3">
          <span className="text-sm text-ink">Avatars</span>
        </div>

        <div className="px-8 py-10 max-w-5xl">
          <h1 className="font-display text-3xl text-ink mb-1">Your avatars.</h1>
          <p className="text-muted text-sm mb-10">
            Upload your own avatar photos — these are the only avatars shown on the picker.
          </p>

          {/* Upload form */}
          <form onSubmit={handleUpload} className="mb-12 border border-divider bg-white p-6 max-w-lg">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            {pendingFile ? (
              <div className="flex items-center gap-4 mb-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pendingFile.dataUrl} alt="Preview" className="w-20 h-20 object-cover border border-divider" />
                <button
                  type="button"
                  onClick={() => setPendingFile(null)}
                  className="text-xs text-muted hover:text-error transition-colors"
                >
                  ✕ remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full border border-dashed border-[#C0BAB2] text-muted text-sm py-8 mb-5 hover:border-ink hover:text-ink transition-colors"
              >
                + Choose a photo
              </button>
            )}

            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-muted mb-2">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Maya"
                  className="w-full border border-divider bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-ink transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-muted mb-2">
                  Gender <span className="text-muted/50 normal-case font-normal">— optional</span>
                </label>
                <select
                  value={gender}
                  onChange={e => setGender(e.target.value)}
                  className="w-full border border-divider bg-surface px-3 py-2 text-sm text-ink focus:border-ink transition-colors"
                >
                  <option value="">—</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </div>
            </div>

            {error && <p className="text-error text-sm mb-4">{error}</p>}

            <button
              type="submit"
              disabled={!pendingFile || !name.trim() || uploading}
              className="bg-ink text-cream px-6 py-2.5 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-40"
            >
              {uploading ? 'Uploading...' : 'Add avatar'}
            </button>
          </form>

          {/* Existing avatars */}
          {loading && <p className="text-muted text-sm">Loading...</p>}

          {!loading && avatars.length === 0 && (
            <p className="text-muted text-sm">No avatars yet — upload one above to get started.</p>
          )}

          {avatars.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {avatars.map(avatar => (
                <div key={avatar.id} className="border border-divider bg-white group relative">
                  <div className="aspect-[3/4] bg-divider overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={avatar.imageUrl} alt={avatar.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="px-2 py-2">
                    <div className="text-xs text-ink truncate">{avatar.name}</div>
                    {avatar.gender && <div className="text-xs text-muted capitalize">{avatar.gender}</div>}
                  </div>
                  <button
                    onClick={() => handleDelete(avatar.id)}
                    title="Delete"
                    className="absolute top-1.5 right-1.5 w-5 h-5 bg-white/90 border border-divider text-muted hover:text-error hover:border-error transition-colors opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
