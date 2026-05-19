'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { QUESTIONS } from '@/lib/questions'
import { QRCodeSVG } from 'qrcode.react'

type State = 'init' | 'lobby' | 'voting' | 'reveal' | 'done'

interface Player   { id: string; nickname: string; total_score: number }
interface Answer   { answer: string; player_id: string }
interface Question {
  id: string; idx: number; image_url: string; reveal_image_url: string; scenario: string;
  round: string; correct_answer: string; max_points: number; label: string; explain: string
}

const VOTE_CONFIG: Record<string, { label: string; emoji: string; bar: string }> = {
  buy:  { label: 'Achat',                emoji: '📈', bar: 'bg-emerald-500' },
  sell: { label: 'Vente',                emoji: '📉', bar: 'bg-red-500'     },
  hold: { label: "Besoin d'indications", emoji: '🤔', bar: 'bg-amber-500'   },
}

const TIMER_SECONDS  = 20
const CIRCUMFERENCE  = 2 * Math.PI * 45
const CONFETTI_COLORS = ['#10b981','#6366f1','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4']

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

  const confetti = useRef(
    Array.from({ length: 30 }, (_, i) => ({
      id:       i,
      left:     `${Math.random() * 100}%`,
      color:    CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay:    `${Math.random() * 3}s`,
      duration: `${2 + Math.random() * 2}s`,
      size:     `${6 + Math.random() * 10}px`,
    }))
  ).current

  const currentQ      = questions[qIdx] ?? null
  const appUrl        = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const joinUrl       = sessionCode ? `${appUrl}/join?code=${sessionCode}` : ''
  const sortedPlayers = [...players].sort((a, b) => b.total_score - a.total_score)

  const dashOffset = CIRCUMFERENCE * (1 - timeLeft / TIMER_SECONDS)
  const timerColor = timeLeft > 10 ? '#10b981' : timeLeft > 5 ? '#f59e0b' : '#ef4444'

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
      .then(({ data }) => { if (data && data.length > 0) setQuestions(data) })
  }, [sessionId, appState])

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
        (payload) => {
          setAnswers(prev => [...prev, payload.new as Answer])
          supabase.from('players').select('*').eq('session_id', sessionId)
            .then(({ data }) => setPlayers(data ?? []))
        }
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, action }),
    })
    if (action === 'start') {
      setAppState('voting')
      setQIdx(0)
      if (questions.length === 0) {
        const { data } = await supabase.from('questions').select('*').eq('session_id', sessionId).order('idx')
        setQuestions(data ?? [])
      }
    }
    else if (action === 'reveal') { setAppState('reveal') }
    else if (action === 'next') {
      const next = qIdx + 1
      if (next >= QUESTIONS.length) setAppState('done')
      else { setQIdx(next); setAppState('voting') }
    }
    else if (action === 'finish') setAppState('done')
  }

  const voteCounts = { buy: 0, sell: 0, hold: 0 }
  answers.forEach(a => { if (a.answer in voteCounts) voteCounts[a.answer as keyof typeof voteCounts]++ })
  const totalVotes = answers.length || 1

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col select-none">

      {/* Debug overlay — dev only */}
      {process.env.NODE_ENV !== 'production' && (
        <div className="fixed bottom-2 left-2 bg-black/80 text-green-400 text-[10px] p-1.5 rounded z-50 font-mono pointer-events-none">
          {appState} | q{qIdx} | {questions.length}q | {sessionId?.slice(0, 8)}
        </div>
      )}

      {/* ── INIT ── */}
      {appState === 'init' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-8">
          <h1 className="text-6xl font-black tracking-tight">TA Competition</h1>
          <p className="text-gray-400 text-xl">Technical Analysis Quiz</p>
          <button onClick={createSession} disabled={loading}
            className="px-12 py-5 bg-emerald-600 hover:bg-emerald-500 hover:scale-105 rounded-2xl text-2xl font-bold transition-all duration-300 shadow-lg shadow-emerald-900/50 disabled:opacity-50">
            {loading ? 'Création...' : '🚀 Créer la session'}
          </button>
        </div>
      )}

      {/* ── LOBBY ── */}
      {appState === 'lobby' && sessionCode && (
        <div className="flex-1 relative flex flex-col items-center justify-center gap-6 p-8 lobby-bg overflow-hidden">
          <p className="text-gray-400 text-sm font-mono z-10">{appUrl}/join</p>

          {/* QR with glow */}
          <div className="relative z-10">
            <div className="absolute inset-0 bg-emerald-500/20 rounded-3xl blur-2xl scale-110" />
            <div className="relative bg-white p-4 rounded-2xl shadow-2xl">
              <QRCodeSVG value={joinUrl} size={250} bgColor="#ffffff" fgColor="#030712" level="H" />
            </div>
          </div>

          {/* Session code */}
          <div className="text-center z-10">
            <p className="text-gray-500 text-xs uppercase tracking-widest mb-1">Code de session</p>
            <p className="text-8xl font-black tracking-widest text-emerald-400 drop-shadow-lg">{sessionCode}</p>
          </div>

          {/* Player badges */}
          {players.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center max-w-lg z-10">
              {players.map((p, i) => (
                <span key={p.id}
                  className="px-4 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full text-sm font-semibold pop-in"
                  style={{ animationDelay: `${i * 50}ms` }}>
                  {p.nickname}
                </span>
              ))}
            </div>
          )}

          {players.length === 0
            ? <p className="text-gray-600 text-sm z-10">Aucun participant — mode test</p>
            : <p className="text-gray-500 text-sm z-10">{players.length} participant{players.length > 1 ? 's' : ''} connecté{players.length > 1 ? 's' : ''}</p>
          }

          <button onClick={() => advance('start')}
            className="mt-2 px-14 py-5 bg-emerald-600 hover:bg-emerald-500 hover:scale-105 rounded-2xl text-2xl font-bold transition-all duration-300 shadow-lg shadow-emerald-900/50 z-10">
            ▶ Démarrer
          </button>
        </div>
      )}

      {/* ── LOADING ── */}
      {(appState === 'voting' || appState === 'reveal') && !currentQ && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 text-xl animate-pulse">Chargement des questions...</p>
        </div>
      )}

      {/* ── VOTING / REVEAL — split screen ── */}
      {(appState === 'voting' || appState === 'reveal') && currentQ && (
        <div className="flex h-screen">

          {/* Left 65% — chart */}
          <div className="relative bg-black flex-[65]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentQ.image_url}
              alt="Chart"
              className="w-full h-full object-contain"
              onError={(e) => { e.currentTarget.style.opacity = '0.3' }}
            />
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-sm border border-white/10 px-6 py-2 rounded-full text-base font-semibold whitespace-nowrap">
              Achat / Vente / Besoin d&apos;indications ?
            </div>
            {appState === 'reveal' && (
              <div className={`absolute top-4 right-4 px-6 py-3 rounded-2xl text-2xl font-black flex items-center gap-2 pop-in shadow-lg ${
                currentQ.correct_answer === 'buy'  ? 'bg-emerald-600 shadow-emerald-900/50' :
                currentQ.correct_answer === 'sell' ? 'bg-red-600 shadow-red-900/50' :
                                                      'bg-amber-600 shadow-amber-900/50'
              }`}>
                {VOTE_CONFIG[currentQ.correct_answer].emoji} {VOTE_CONFIG[currentQ.correct_answer].label}
              </div>
            )}
          </div>

          {/* Right 35% — sidebar */}
          <div className="flex-[35] flex flex-col bg-gray-900 border-l border-white/10 overflow-y-auto">

            {/* Scenario + Round badges */}
            <div className="px-5 pt-5 pb-3 flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 bg-emerald-700/60 border border-emerald-600/50 rounded-lg text-xs font-bold uppercase tracking-widest">
                {currentQ.scenario}
              </span>
              <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-bold uppercase tracking-widest">
                Round {currentQ.round} · {currentQ.max_points} pts
              </span>
            </div>

            {/* SVG circular timer */}
            <div className="flex flex-col items-center py-4">
              <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>
                <svg width="120" height="120" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
                  <circle cx="60" cy="60" r="45" fill="none" stroke="#1f2937" strokeWidth="8" />
                  <circle
                    cx="60" cy="60" r="45" fill="none"
                    stroke={timerColor}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={appState === 'reveal' ? 0 : dashOffset}
                    style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
                  />
                </svg>
                <span className="text-5xl font-black z-10 relative" style={{ color: timerColor }}>
                  {appState === 'voting' ? timeLeft : '✓'}
                </span>
              </div>
              <p className="text-gray-500 text-xs uppercase tracking-widest mt-2">
                {answers.length} réponse{answers.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Vote bars */}
            <div className="px-4 space-y-2 pb-3">
              {(['buy', 'sell', 'hold'] as const).map(opt => {
                const cnt       = voteCounts[opt]
                const pct       = Math.round((cnt / totalVotes) * 100)
                const cfg       = VOTE_CONFIG[opt]
                const isCorrect = appState === 'reveal' && opt === currentQ.correct_answer
                return (
                  <div key={opt} className={`rounded-xl p-3 transition-all duration-300 backdrop-blur-sm bg-white/5 border ${
                    isCorrect ? 'border-white shadow-lg shadow-white/10' : 'border-white/10'
                  }`}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-sm font-semibold">{cfg.emoji} {cfg.label}</span>
                      <span className="text-lg font-black">{cnt}</span>
                    </div>
                    <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`}
                        style={{ width: `${answers.length === 0 ? 0 : pct}%` }} />
                    </div>
                    {appState === 'reveal' && (
                      <p className="text-right text-xs text-gray-400 mt-1">{pct}%</p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Explain banner (reveal only) */}
            {appState === 'reveal' && (
              <div className="mx-4 mb-3 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-300 slide-up">
                📌 {currentQ.explain}
              </div>
            )}

            {/* Live mini-leaderboard */}
            <div className="px-4 pb-3 flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">🏆 Live</p>
              <div className="space-y-1.5">
                {sortedPlayers.slice(0, 5).map((p, i) => (
                  <div key={p.id}
                    className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg slide-from-right"
                    style={{ animationDelay: `${i * 40}ms` }}>
                    <span className="text-sm font-black w-5 text-center text-gray-400">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </span>
                    <span className="flex-1 text-sm font-medium truncate">{p.nickname}</span>
                    <span className="text-sm font-black text-emerald-400">{p.total_score}</span>
                  </div>
                ))}
                {sortedPlayers.length === 0 && (
                  <p className="text-gray-600 text-xs text-center py-2">Aucun joueur</p>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="p-4 border-t border-white/10 flex flex-col gap-2">
              {appState === 'voting' && (
                <button
                  onClick={() => { if (timerRef.current) clearInterval(timerRef.current); advance('reveal') }}
                  className="w-full py-3 bg-amber-600 hover:bg-amber-500 hover:scale-105 rounded-2xl font-bold transition-all duration-200 shadow-lg">
                  Révéler maintenant
                </button>
              )}
              {appState === 'reveal' && (
                <button onClick={() => advance('next')}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 hover:scale-105 rounded-2xl font-bold transition-all duration-200 shadow-lg">
                  {qIdx + 1 >= QUESTIONS.length ? 'Terminer ✓' : 'Suivant →'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── DONE — confetti + podium ── */}
      {appState === 'done' && (
        <div className="flex-1 relative flex flex-col items-center justify-start pt-10 p-6 gap-6 overflow-hidden">

          {/* Confetti */}
          {confetti.map(p => (
            <div key={p.id} className="confetti-piece absolute top-0 pointer-events-none rounded-sm"
              style={{ left: p.left, width: p.size, height: p.size, background: p.color, animationDelay: p.delay, animationDuration: p.duration }} />
          ))}

          <h2 className="text-5xl font-black z-10">🎉 Fin !</h2>

          {/* Podium — top 3 */}
          {sortedPlayers.length >= 1 && (
            <div className="flex items-end gap-4 z-10 mb-2">
              {/* 2nd */}
              {sortedPlayers[1] && (
                <div className="flex flex-col items-center gap-1">
                  <span className="text-sm font-bold text-gray-300 truncate max-w-[90px] text-center">{sortedPlayers[1].nickname}</span>
                  <span className="text-base font-black text-gray-300">{sortedPlayers[1].total_score} pts</span>
                  <div className="w-24 h-20 bg-gray-400/20 border-2 border-gray-400 rounded-t-xl flex items-center justify-center text-3xl">🥈</div>
                </div>
              )}
              {/* 1st */}
              <div className="flex flex-col items-center gap-1">
                <span className="text-base font-black text-yellow-300 truncate max-w-[100px] text-center">{sortedPlayers[0].nickname}</span>
                <span className="text-xl font-black text-yellow-400">{sortedPlayers[0].total_score} pts</span>
                <div className="w-28 h-28 bg-yellow-600/30 border-2 border-yellow-500 rounded-t-xl flex items-center justify-center text-4xl">🥇</div>
              </div>
              {/* 3rd */}
              {sortedPlayers[2] && (
                <div className="flex flex-col items-center gap-1">
                  <span className="text-sm font-bold text-orange-300 truncate max-w-[90px] text-center">{sortedPlayers[2].nickname}</span>
                  <span className="text-base font-black text-orange-400">{sortedPlayers[2].total_score} pts</span>
                  <div className="w-24 h-16 bg-orange-700/20 border-2 border-orange-600 rounded-t-xl flex items-center justify-center text-3xl">🥉</div>
                </div>
              )}
            </div>
          )}

          {/* 4th+ */}
          {sortedPlayers.length > 3 && (
            <div className="w-full max-w-sm space-y-1.5 z-10">
              {sortedPlayers.slice(3).map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 bg-white/5 border border-white/10 backdrop-blur-sm rounded-xl">
                  <span className="w-6 text-center text-sm font-bold text-gray-500">{i + 4}</span>
                  <span className="flex-1 font-medium">{p.nickname}</span>
                  <span className="font-black text-emerald-400">{p.total_score} pts</span>
                </div>
              ))}
            </div>
          )}

          <button onClick={createSession}
            className="mt-4 px-10 py-4 bg-emerald-600 hover:bg-emerald-500 hover:scale-105 rounded-2xl font-bold text-lg transition-all duration-300 shadow-lg z-10">
            Nouvelle session
          </button>
        </div>
      )}
    </div>
  )
}
