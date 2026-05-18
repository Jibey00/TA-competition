'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function JoinForm() {
  const params   = useSearchParams()
  const router   = useRouter()
  const [code,     setCode]     = useState(params.get('code') ?? '')
  const [nickname, setNickname] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleJoin() {
    if (!code.trim() || !nickname.trim()) { setError('Remplis les deux champs'); return }
    setLoading(true); setError('')
    const res  = await fetch('/api/join', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ code: code.trim(), nickname: nickname.trim() }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Erreur'); setLoading(false); return }
    localStorage.setItem('ta_quiz_player_id',  data.player_id)
    localStorage.setItem('ta_quiz_session_id', data.session_id)
    localStorage.setItem('ta_quiz_nickname',   nickname.trim())
    router.push(`/play/${data.code}`)
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-8 bg-gray-950 text-white">
      <div className="text-center">
        <h1 className="text-4xl font-black">TA Competition</h1>
        <p className="text-gray-400 mt-2">Rejoindre la compétition</p>
      </div>
      <div className="w-full max-w-sm flex flex-col gap-4">
        <div>
          <label className="text-sm text-gray-400 block mb-1">Code de session</label>
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="ex. GOLD"
            maxLength={4}
            className="w-full px-4 py-4 bg-gray-800 rounded-xl text-2xl font-black tracking-widest text-center uppercase outline-none border border-gray-700 focus:border-emerald-500 transition"
          />
        </div>
        <div>
          <label className="text-sm text-gray-400 block mb-1">Ton pseudo</label>
          <input
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder="ex. JB"
            maxLength={20}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            className="w-full px-4 py-4 bg-gray-800 rounded-xl text-xl font-semibold outline-none border border-gray-700 focus:border-emerald-500 transition"
          />
        </div>
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <button
          onClick={handleJoin} disabled={loading}
          className="py-4 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xl font-bold transition disabled:opacity-50 mt-2"
        >
          {loading ? 'Connexion...' : 'Rejoindre →'}
        </button>
      </div>
    </main>
  )
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
  )
}
