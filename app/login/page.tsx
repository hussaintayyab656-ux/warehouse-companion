'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const MAX_ATTEMPTS = 5
const LOCKOUT_SECONDS = 60
const STORAGE_KEY = 'login_attempts'

interface AttemptData {
  count: number
  lockedUntil: number | null
}

function getAttemptData(): AttemptData {
  if (typeof window === 'undefined') return { count: 0, lockedUntil: null }
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return { count: 0, lockedUntil: null }
  try {
    return JSON.parse(raw)
  } catch {
    return { count: 0, lockedUntil: null }
  }
}

function saveAttemptData(data: AttemptData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [lockedSecondsLeft, setLockedSecondsLeft] = useState(0)

  // Check lockout status on mount and tick down the countdown
  useEffect(() => {
    const check = () => {
      const data = getAttemptData()
      if (data.lockedUntil && data.lockedUntil > Date.now()) {
        setLockedSecondsLeft(Math.ceil((data.lockedUntil - Date.now()) / 1000))
      } else {
        setLockedSecondsLeft(0)
        if (data.lockedUntil) {
          // lockout expired — reset attempts
          saveAttemptData({ count: 0, lockedUntil: null })
        }
      }
    }
    check()
    const interval = setInterval(check, 1000)
    return () => clearInterval(interval)
  }, [])

  async function handleLogin() {
    const data = getAttemptData()
    if (data.lockedUntil && data.lockedUntil > Date.now()) {
      setMessage(`Too many failed attempts. Try again in ${Math.ceil((data.lockedUntil - Date.now()) / 1000)}s.`)
      return
    }

    if (!username.trim() || !password) {
      setMessage('Enter your username and password')
      return
    }
    setLoading(true)
    setMessage('')
    const email = username.trim().toLowerCase() + '@warehouse.local'
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (error) {
      const current = getAttemptData()
      const newCount = current.count + 1

      if (newCount >= MAX_ATTEMPTS) {
        const lockedUntil = Date.now() + LOCKOUT_SECONDS * 1000
        saveAttemptData({ count: newCount, lockedUntil })
        setLockedSecondsLeft(LOCKOUT_SECONDS)
        setMessage(`Too many failed attempts. Try again in ${LOCKOUT_SECONDS}s.`)
      } else {
        saveAttemptData({ count: newCount, lockedUntil: null })
        setMessage(`Wrong username or password (${MAX_ATTEMPTS - newCount} attempts left)`)
      }
    } else {
      saveAttemptData({ count: 0, lockedUntil: null })
      sessionStorage.setItem('tab_verified', 'true')
      router.push('/')
    }
  }

  const isLocked = lockedSecondsLeft > 0

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] p-4 font-mono">
      <div className="w-full max-w-sm">
        <div className="border border-[#ffb000]/20 bg-[#111] rounded-t-xl px-6 py-6">
          <p className="text-[10px] tracking-[0.25em] text-[#ffb000] font-bold uppercase">
            Warehouse Companion
          </p>
          <h1 className="text-2xl font-bold mt-1 text-white tracking-wide">Sign in</h1>
        </div>

        <div className="border border-t-0 border-[#ffb000]/20 bg-[#0d0d0d] rounded-b-xl p-6 space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-1">
              Username
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              disabled={isLocked}
              className="w-full bg-black border border-[#ffb000]/20 rounded-lg px-3 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-[#ffb000]/60 disabled:opacity-50"
              placeholder="e.g. tayyab"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              disabled={isLocked}
              className="w-full bg-black border border-[#ffb000]/20 rounded-lg px-3 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-[#ffb000]/60 disabled:opacity-50"
              placeholder="••••••••"
            />
          </div>

          {message && <p className="text-sm text-red-400">{message}</p>}

          <button
            onClick={handleLogin}
            disabled={loading || isLocked}
            className="w-full bg-[#ffb000] text-black font-bold py-2 rounded-lg tracking-wide hover:bg-[#ffc433] transition disabled:opacity-50"
          >
            {isLocked ? `Locked (${lockedSecondsLeft}s)` : loading ? 'Please wait…' : 'Sign in'}
          </button>

          <p className="text-[11px] text-slate-500 text-center pt-2 tracking-wide">
            No account? Ask your administrator to create one.
          </p>
        </div>
      </div>
    </div>
  )
}