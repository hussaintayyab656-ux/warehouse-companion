'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
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
      setMessage('Wrong username or password')
    } else {
      sessionStorage.setItem('tab_verified', 'true')
      router.push('/')
    }
  }

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
              className="w-full bg-black border border-[#ffb000]/20 rounded-lg px-3 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-[#ffb000]/60"
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
              className="w-full bg-black border border-[#ffb000]/20 rounded-lg px-3 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-[#ffb000]/60"
              placeholder="••••••••"
            />
          </div>

          {message && <p className="text-sm text-red-400">{message}</p>}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-[#ffb000] text-black font-bold py-2 rounded-lg tracking-wide hover:bg-[#ffc433] transition disabled:opacity-50"
          >
            {loading ? 'Please wait…' : 'Sign in'}
          </button>

          <p className="text-[11px] text-slate-500 text-center pt-2 tracking-wide">
            No account? Ask your administrator to create one.
          </p>
        </div>
      </div>
    </div>
  )
}