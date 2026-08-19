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
    if (error) setMessage('Wrong username or password')
    else router.push('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm">
        <div className="bg-slate-900 text-white rounded-t-xl px-6 py-6">
          <p className="text-xs tracking-widest text-amber-400 font-bold uppercase">
            Warehouse Companion
          </p>
          <h1 className="text-2xl font-bold mt-1">Sign in</h1>
        </div>

        <div className="bg-white border border-slate-200 rounded-b-xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              placeholder="e.g. tayyab"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              placeholder="••••••••"
            />
          </div>

          {message && <p className="text-sm text-red-600">{message}</p>}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-amber-500 text-slate-900 font-bold py-2 rounded-lg disabled:opacity-50"
          >
            {loading ? 'Please wait…' : 'Sign in'}
          </button>

          <p className="text-xs text-slate-700 text-center pt-2">
            No account? Ask your administrator to create one.
          </p>
        </div>
      </div>
    </div>
  )
}