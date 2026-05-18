'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type SessionState = 'lobby' | 'voting' | 'reveal' | 'leaderboard' | 'done'

interface Session  { id: string; state: SessionState; current_question: number }
interface Question {
  id: string; idx: number; image_url: string; scenario: string;
  round: string; correct_answer: string; max_points: number; label: string
}
interface PlayerRank { nickname: string; total_score: number }

const VOTE_OPTIONS = [
  { value: 'buy',  label: 'Achat',                emoji: '📈', bg: 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700' },
  { value: 'sell', label: 'Vente',                emoji: '📉', bg: 'bg-red-600 hover:bg-red-500 active:bg-red-700'             },
  { value: 'hold', label: "Besoin d'indications", emoji: '🤔', bg: 'bg-yellow-600 hover:bg-yellow-500 active:bg-yellow-700'    },
]

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function PlayPage(_props: { params: { code: string } }) {
  const [playerId,    setPlayerId]    = useState<string | null>(null)
  const [sessionId,   setSessionId]   = useState<string | null>(null)
  const [nickname,    setNickname]    = useState('')
  const [session,     setSession]     = useState<Session | null>(null)
  const [question,    setQuestion]    = useState<Question | null>(null)
  const [myAnswer,    setMyAnswer]    = useState<string | null>(null)
  const [result,      setResult]      = useState<{ points: number; is_correct: boolean } | null>(null)
  const [leaderboard, setLeaderboard] = useState<PlayerRank[]>([])
  const [myRank,      setMyRank]      = useState<number | null>(null)
  const [myScore,     setMyScore]     = useState(0)
  const [submitting,  setSubmitting]  = useState(false)
  const lastQIdx = useRef<number>(-1)

  useEffect(() => {
    const pid = localStorage.getItem('ta_quiz_player_id')
    const sid = localStorage.getItem('ta_quiz_session_id')
    const nn  = localStorage.getItem('ta_quiz_nickname') ?? ''
    setPlayerId(pid); setSessionId(sid); setNickname(nn)
  }, [])

  useEffect(() => {
    if (!sessionId) return
    supabase.from('sessions').select('*').eq('id', sessionId).single()
      .then(({ data }) => { if (data) setSession(data) })
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    const ch = supabase.channel(`session:${sessionId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        ({ new: s }) => setSession(s as Session)
      ).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [sessionId])

  useEffect(() => {
    if (!sessionId || session === null) return
    const idx = session.current_question
    if (idx === lastQIdx.current && session.state === 'voting') return
    if (session.state === 'voting') {
      lastQIdx.current = idx
      setMyAnswer(null); setResult(null)
      supabase.from('questions').select('*').eq('session_id', sessionId).eq('idx', idx).single()
        .then(({ data }) => { if (data) setQuestion(data) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.current_question, session?.state, sessionId])

  useEffect(() => {
    if (!sessionId || !playerId) return
    if (session?.state !== 'leaderboard' && session?.state !== 'done') return
    supabase.from('players').select('nickname, total_score')
      .eq('session_id', sessionId).order('total_score', { ascending: false })
      .then(({ data }) => {
        const lb = data ?? []
        setLeaderboard(lb)
        const rank = lb.findIndex(p => p.nickname === nickname) + 1
        setMyRank(rank > 0 ? rank : null)
      })
    supabase.from('players').select('total_score').eq('id', playerId).single()
      .then(({ data }) => { if (data) setMyScore(data.total_score) })
  }, [session?.state, sessionId, playerId, nickname])

  async function submitAnswer(answer: string) {
    if (!playerId || !question || myAnswer || submitting) return
    setMyAnswer(answer); setSubmitting(true)
    const res  = await fetch('/api/submit-answer', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ player_id: playerId, question_id: question.id, answer }),
    })
    const data = await res.json()
    setResult(data); setSubmitting(false)
  }

  if (!playerId || !sessionId) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-950 text-white p-6">
        <p className="text-gray-400">Session non trouvée.</p>
        <a href="/join" className="text-emerald-400 underline">Rejoindre une session →</a>
      </main>
    )
  }

  if (!session || session.state === 'lobby') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gray-950 text-white p-6">
        <div className="text-6xl animate-bounce">⏳</div>
        <h2 className="text-2xl font-bold">Salle d&apos;attente</h2>
        <p className="text-gray-400">Connecté en tant que <span className="text-white font-semibold">{nickname}</span></p>
        <p className="text-gray-500 text-sm">En attente du démarrage…</p>
      </main>
    )
  }

  if (session.state === 'voting' && question) {
    return (
      <main className="min-h-screen flex flex-col bg-gray-950 text-white">
        <div className="px-4 py-3 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
          <span className="text-sm font-semibold text-emerald-400">{question.scenario} · Round {question.round}</span>
          <span className="text-sm text-gray-400">{question.max_points} pts max</span>
        </div>
        <div className="flex-1 bg-black flex items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={question.image_url} alt="Chart" className="w-full h-full object-contain max-h-64" />
        </div>
        <div className="p-4 space-y-3 bg-gray-950">
          {!myAnswer ? (
            <>
              <p className="text-center text-gray-400 text-sm mb-2">Que fais-tu sur ce titre ?</p>
              {VOTE_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => submitAnswer(opt.value)} disabled={submitting}
                  className={`w-full py-5 rounded-2xl text-xl font-bold flex items-center justify-center gap-3 transition ${opt.bg} disabled:opacity-50`}>
                  <span className="text-2xl">{opt.emoji}</span>{opt.label}
                </button>
              ))}
            </>
          ) : (
            <div className="text-center py-8 space-y-3">
              <div className="text-5xl">{submitting ? '⏳' : result?.is_correct ? '✅' : '⌛'}</div>
              <p className="text-lg font-semibold text-gray-300">{submitting ? 'Envoi…' : 'Réponse enregistrée'}</p>
              {result && !submitting && <p className="text-2xl font-black text-emerald-400">+{result.points} pts</p>}
              <p className="text-gray-500 text-sm">En attente du révélé…</p>
            </div>
          )}
        </div>
      </main>
    )
  }

  if (session.state === 'reveal' && question) {
    const correct    = question.correct_answer
    const correctOpt = VOTE_OPTIONS.find(o => o.value === correct)!
    const isCorrect  = myAnswer === correct
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gray-950 text-white p-6">
        <div className="text-7xl pop-in">{isCorrect ? '✅' : '❌'}</div>
        <h2 className="text-2xl font-bold text-center">{isCorrect ? 'Bonne réponse !' : 'Raté cette fois'}</h2>
        <div className={`px-8 py-4 rounded-2xl text-xl font-bold flex items-center gap-3 ${
          correct === 'buy' ? 'bg-emerald-700' : correct === 'sell' ? 'bg-red-700' : 'bg-yellow-700'
        }`}>
          {correctOpt.emoji} {correctOpt.label}
        </div>
        {result && <p className="text-3xl font-black text-emerald-400">+{result.points} pts</p>}
        <p className="text-gray-400 text-sm">Score total : <span className="text-white font-semibold">{myScore} pts</span></p>
        <p className="text-gray-600 text-sm">En attente de la prochaine question…</p>
      </main>
    )
  }

  if (session.state === 'leaderboard' || session.state === 'done') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gray-950 text-white p-6">
        <h2 className="text-3xl font-black">🏆 Classement</h2>
        {myRank && (
          <div className="text-center bg-gray-800 rounded-2xl px-8 py-4">
            <p className="text-gray-400 text-sm">Ta position</p>
            <p className="text-5xl font-black text-emerald-400">#{myRank}</p>
            <p className="text-lg font-semibold mt-1">{myScore} pts</p>
          </div>
        )}
        <div className="w-full max-w-sm space-y-2">
          {leaderboard.slice(0, 10).map((p, i) => (
            <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl ${
              p.nickname === nickname ? 'bg-emerald-800/40 border border-emerald-600' : 'bg-gray-800'
            }`}>
              <span className="w-6 text-center font-bold text-gray-400">
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
              </span>
              <span className="flex-1 font-medium">{p.nickname}</span>
              <span className="font-black text-emerald-400">{p.total_score}</span>
            </div>
          ))}
        </div>
        {session.state === 'done' && <p className="text-gray-500 text-sm mt-4">Quiz terminé !</p>}
      </main>
    )
  }

  return null
}
