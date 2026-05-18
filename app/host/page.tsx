'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { QUESTIONS } from '@/lib/questions'
import { QRCodeSVG } from 'qrcode.react'

type State = 'init' | 'lobby' | 'voting' | 'reveal' | 'leaderboard' | 'done'

interface Player   { id: string; nickname: string; total_score: number }
interface Answer   { answer: string; player_id: string }
interface Question {
  id: string; idx: number; image_url: string; reveal_image_url: string; scenario: string;
  round: string; correct_answer: string; max_points: number; label: string; explain: string
}

const VOTE_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  buy:  { label: 'Achat',                emoji: '📈', color: 'bg-emerald-500' },
  sell: { label: 'Vente',                emoji: '📉', color: 'bg-red-500'     },
  hold: { label: "Besoin d'indications", emoji: '🤔', color: 'bg-yellow-500'  },
}

const TIMER_SECONDS = 20

export default function HostPage() {
  const [sessionId,   setSessionId]   = useState<string | null>(null)
  const [sessionCode, setSessionCode] = useState<string | null>(null)
  const [appState,    setAppState]    = useState<State>('init')
  const [questions,   setQuestions]   = useState<Question[]>([])
  const [qIdx,        setQIdx]        = useState(0)
  const [answers,     setAnswers]     = useState<Answer[]>([])
  const [players,     setPlayers]     = useState<Player[]>([])
  const [timeLeft,    setTimeLeft]    = useState(TIMER_SECONDS)
  const [loading,     setLoading]     = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const currentQ = questions[qIdx] ?? null
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const joinUrl  = sessionCode ? `${appUrl}/join?code=${sessionCode}` : ''

  const createSession = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/create-session', { method: 'POST' })
    const data = await res.json()
    setSessionId(data.session_id)
    setSessionCode(data.code)
    setAppState('lobby')
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!sessionId) return
    supabase.from('questions').select('*').eq('session_id', sessionId).order('idx')
      .then(({ data }) => setQuestions(data ?? []))
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    const ch = supabase.channel(`players:${sessionId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `session_id=eq.${sessionId}` },
        () => {
          supabase.from('players').select('*').eq('session_id', sessionId)
            .then(({ data }) => setPlayers(data ?? []))
        }
      ).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [sessionId])

  useEffect(() => {
    if (!sessionId || !currentQ) return
    setAnswers([])
    const ch = supabase.channel(`answers:${currentQ.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'answers', filter: `question_id=eq.${currentQ.id}` },
        (payload) => setAnswers(prev => [...prev, payload.new as Answer])
      ).subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, currentQ?.id])

  useEffect(() => {
    if (appState !== 'voting') { if (timerRef.current) clearInterval(timerRef.current); return }
    setTimeLeft(TIMER_SECONDS)
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current!); advance('reveal'); return 0 }
        return t - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState, qIdx])

  async function advance(action: string) {
    if (!sessionId) return
    await fetch('/api/advance', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ session_id: sessionId, action }),
    })
    if      (action === 'start')       { setAppState('voting');      setQIdx(0)      }
    else if (action === 'reveal')      { setAppState('reveal')                        }
    else if (action === 'leaderboard') { setAppState('leaderboard'); refreshPlayers() }
    else if (action === 'next')        {
      const next = qIdx + 1
      if (next >= QUESTIONS.length) setAppState('done')
      else { setQIdx(next); setAppState('voting') }
    }
    else if (action === 'finish') setAppState('done')
  }

  async function refreshPlayers() {
    const { data } = await supabase.from('players').select('*')
      .eq('session_id', sessionId).order('total_score', { ascending: false })
    setPlayers(data ?? [])
  }

  const voteCounts = { buy: 0, sell: 0, hold: 0 }
  answers.forEach(a => { if (a.answer in voteCounts) voteCounts[a.answer as keyof typeof voteCounts]++ })
  const totalVotes = answers.length || 1

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col select-none">

      {appState === 'init' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-8">
          <h1 className="text-5xl font-bold">TA Competition</h1>
          <p className="text-gray-400 text-xl">Technical Analysis Quiz</p>
          <button onClick={createSession} disabled={loading}
            className="px-12 py-5 bg-emerald-600 hover:bg-emerald-500 rounded-2xl text-2xl font-bold transition disabled:opacity-50">
            {loading ? 'Création...' : '🚀 Créer la session'}
          </button>
        </div>
      )}

      {appState === 'lobby' && sessionCode && (
        <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
          <div className="text-center">
            <p className="text-gray-400 text-lg mb-2">Rejoindre sur</p>
            <p className="text-emerald-400 text-2xl font-mono">{appUrl}/join</p>
          </div>
          <QRCodeSVG value={joinUrl} size={200} bgColor="#030712" fgColor="#ffffff" level="H" />
          <div className="text-center">
            <p className="text-gray-400 text-sm mb-1">Code de session</p>
            <p className="text-7xl font-black tracking-widest text-emerald-400">{sessionCode}</p>
          </div>
          <div className="flex flex-wrap gap-3 justify-center max-w-md">
            {players.map(p => (
              <span key={p.id} className="px-4 py-2 bg-gray-800 rounded-full text-sm font-medium">{p.nickname}</span>
            ))}
          </div>
          {players.length > 0 && (
            <p className="text-gray-500 text-sm">{players.length} participant{players.length > 1 ? 's' : ''} connecté{players.length > 1 ? 's' : ''}</p>
          )}
          <button onClick={() => advance('start')} disabled={players.length === 0}
            className="mt-4 px-12 py-5 bg-emerald-600 hover:bg-emerald-500 rounded-2xl text-2xl font-bold transition disabled:opacity-40">
            ▶ Démarrer
          </button>
        </div>
      )}

      {(appState === 'voting' || appState === 'reveal') && currentQ && (
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-emerald-700 rounded-lg text-sm font-semibold">{currentQ.scenario}</span>
              <span className="px-3 py-1 bg-gray-700 rounded-lg text-sm">Round {currentQ.round} · {currentQ.max_points} pts max</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-gray-400 text-sm">{answers.length} réponse{answers.length !== 1 ? 's' : ''}</span>
              <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl font-black border-4 transition-colors ${
                timeLeft > 10 ? 'border-emerald-500 text-emerald-400' :
                timeLeft > 5  ? 'border-yellow-500 text-yellow-400' :
                                 'border-red-500 text-red-400'
              }`}>
                {appState === 'voting' ? timeLeft : '✓'}
              </div>
            </div>
          </div>

          <div className="flex-1 relative bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={appState === 'reveal' ? currentQ.reveal_image_url : currentQ.image_url} alt="Chart" className="w-full h-full object-contain" />
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur px-6 py-2 rounded-full text-lg font-semibold">
              Achat / Vente / Besoin d&apos;indications ?
            </div>
            {appState === 'reveal' && (
              <div className={`absolute top-4 right-4 px-6 py-3 rounded-xl text-2xl font-black flex items-center gap-2 pop-in ${
                VOTE_LABELS[currentQ.correct_answer].color
              }`}>
                {VOTE_LABELS[currentQ.correct_answer].emoji} {VOTE_LABELS[currentQ.correct_answer].label}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 px-6 py-4 bg-gray-900">
            {(['buy', 'sell', 'hold'] as const).map(opt => {
              const cnt = voteCounts[opt]
              const pct = Math.round((cnt / totalVotes) * 100)
              const info = VOTE_LABELS[opt]
              const isCorrect = appState === 'reveal' && opt === currentQ.correct_answer
              return (
                <div key={opt} className={`rounded-xl p-3 transition bg-gray-800 ${isCorrect ? 'ring-2 ring-white' : ''}`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold">{info.emoji} {info.label}</span>
                    <span className="text-lg font-black">{cnt}</span>
                  </div>
                  <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${info.color}`}
                      style={{ width: `${answers.length === 0 ? 0 : pct}%` }} />
                  </div>
                  {appState === 'reveal' && <p className="text-right text-xs text-gray-400 mt-1">{pct}%</p>}
                </div>
              )
            })}
          </div>

          {appState === 'reveal' && (
            <div className="px-6 py-3 bg-gray-800 border-t border-gray-700 text-sm text-gray-300 slide-up">
              📌 {currentQ.explain}
            </div>
          )}

          <div className="flex justify-end gap-3 px-6 py-3 bg-gray-900 border-t border-gray-800">
            {appState === 'voting' && (
              <button onClick={() => { if (timerRef.current) clearInterval(timerRef.current); advance('reveal') }}
                className="px-6 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg font-semibold transition">
                Révéler maintenant
              </button>
            )}
            {appState === 'reveal' && (
              <>
                <button onClick={() => advance('leaderboard')}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold transition">
                  🏆 Classement
                </button>
                <button onClick={() => advance('next')}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-semibold transition">
                  {qIdx + 1 >= QUESTIONS.length ? 'Terminer ✓' : 'Question suivante →'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {appState === 'leaderboard' && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
          <h2 className="text-4xl font-black">🏆 Classement</h2>
          <div className="w-full max-w-lg space-y-3">
            {players.sort((a, b) => b.total_score - a.total_score).slice(0, 10).map((p, i) => (
              <div key={p.id} className={`flex items-center gap-4 px-5 py-4 rounded-xl slide-up ${
                i === 0 ? 'bg-yellow-600/30 border border-yellow-500' :
                i === 1 ? 'bg-gray-400/20 border border-gray-400' :
                i === 2 ? 'bg-orange-700/20 border border-orange-600' : 'bg-gray-800'
              }`} style={{ animationDelay: `${i * 60}ms` }}>
                <span className="text-2xl font-black w-8 text-center">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                </span>
                <span className="flex-1 font-semibold text-lg">{p.nickname}</span>
                <span className="font-black text-xl text-emerald-400">{p.total_score} pts</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setAppState('reveal')}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-semibold transition">
              ← Retour
            </button>
            <button onClick={() => advance('next')}
              className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-semibold transition">
              {qIdx + 1 >= QUESTIONS.length ? 'Terminer ✓' : 'Question suivante →'}
            </button>
          </div>
        </div>
      )}

      {appState === 'done' && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
          <h2 className="text-5xl font-black">🎉 Fin !</h2>
          <div className="w-full max-w-lg space-y-3">
            {players.sort((a, b) => b.total_score - a.total_score).map((p, i) => (
              <div key={p.id} className={`flex items-center gap-4 px-5 py-4 rounded-xl ${
                i === 0 ? 'bg-yellow-600/30 border border-yellow-500 text-xl' :
                i === 1 ? 'bg-gray-400/20 border border-gray-400' :
                i === 2 ? 'bg-orange-700/20 border border-orange-600' : 'bg-gray-800 text-sm'
              }`}>
                <span className="text-2xl font-black w-8 text-center">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                </span>
                <span className="flex-1 font-semibold">{p.nickname}</span>
                <span className="font-black text-emerald-400">{p.total_score} pts</span>
              </div>
            ))}
          </div>
          <button onClick={createSession}
            className="mt-6 px-10 py-4 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-semibold text-lg transition">
            Nouvelle session
          </button>
        </div>
      )}
    </div>
  )
}
