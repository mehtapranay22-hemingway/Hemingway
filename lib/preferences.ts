import fs from 'fs'
import path from 'path'

export type Preference = {
  avatarId: string
  avatarName: string
  voiceId: string
  voiceName: string
}

const PREF_FILE = path.join(process.cwd(), 'data', 'preferences.json')

export function getPreference(): Preference | null {
  try {
    const data = JSON.parse(fs.readFileSync(PREF_FILE, 'utf-8'))
    return data.avatarId ? (data as Preference) : null
  } catch {
    return null
  }
}

export function setPreference(pref: Preference): void {
  fs.writeFileSync(PREF_FILE, JSON.stringify(pref, null, 2))
}
