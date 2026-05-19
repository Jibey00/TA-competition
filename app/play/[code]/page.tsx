'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type SessionState = 'lobby' | 'voting' | 'reveal' | 'leaderboard' | 'done'
type ActiveTab    = 'vote' | 'top5'

interface Session  { id: string; state: SessionState; current_question: number }
interface Question {
  id: string; idx: number; image_url: string; scenario: string;
  round: string; correct_answer: string; max_points: number; label: string
}
interface PlayerRank { nickname: string; total_score: number }

const ANSWER_OPTIONS = [
  { value: 'buy',  label: 'Achat', emoji: '📈',
    cls: 'w-full py-5 rounded-2xl text-xl font-bold flex items-center justify-center gap-3 transition bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700' },
  { value: 'sell', label: 'Vente', emoji: '📉',
    cls: 'w-full py-5 rounded-2xl text-xl font-bold flex items-center justify-center gap-3 transition bg-red-600 hover:bg-red-500 active:bg-red-700' },
]

const ANSWER_LABELS: Record<string, string> = { buy: '📈 Achat', sell: '📉 Vente', pass: '⏳ Je passe' }

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function PlayPage(_props: { params: { code: string } }) {
  const [playerId,       setPlayerId]       = useState<string | null>(null)
  const [sessionId,      setSessionId]      = useState<string | null>(null)
  const [nickname,       setNickname]       = useState('')
  const [session,        setSession]        = useState<Session | null>(null)
  const [question,       setQuestion]       = useState<Question | null>(null)
  const [myAnswer,       setMyAnswer]       = useState<string | null>(null)
  const [result,         setResult]         = useState<{ points: number; is_correct: boolean; vote_distribution?: Record<string, number> } | null>(null)
  const [leaderboard,    setLeaderboard]    = useState<PlayerRank[]>([])
  const [myRank,         setMyRank]         = useState<number | null>(null)
  const [myScore,        setMyScore]        = useState(0)
  const [submitting,     setSubmitting]     = useState(false)
  const [isLocked,       setIsLocked]       = useState(false)
  const [previousAnswer, setPreviousAnswer] = useState<string | null>(null)
  const [lockedPoints,   setLockedPoints]   = useState(0)
  const [activeTab,      setActiveTab]      = useState<ActiveTab>('vote')
  const [top5,           setTop5]           = useState<PlayerRank[]>([])
  const lastQIdx        = useRef<number>(-1)
  const top5IntervalRef = useRef<NodeJS.Timeout | null>(null)

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

  // Load question when voting state changes
  useEffect(() => {
    if (!sessionId || session === null) return
    const idx = session.current_question
    if (idx === lastQIdx.current && session.state === 'voting') return
    if (session.state === 'voting') {
      lastQIdx.current = idx
      setMyAnswer(null); setResult(null); setIsLocked(false); setPreviousAnswer(null); setLockedPoints(0)
      setActiveTab('vote')
      supabase.from('questions').select('*').eq('session_id', sessionId).eq('idx', idx).single()
        .then(({ data }) => { if (data) setQuestion(data) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.current_question, session?.state, sessionId])

  // Check if player is locked for Round B
  useEffect(() => {
    if (!question || question.round !== 'B' || !playerId || !sessionId) return
    supabase.from('questions')
      .select('id')
      .eq('session_id', sessionId)
      .eq('scenario', question.scenario)
      .eq('round', 'A')
      .single()
      .then(({ data: roundAQ }) => {
        if (!roundAQ) return
        supabase.from('answers')
          .select('answer, points_awarded')
          .eq('player_id', playerId)
          .eq('question_id', roundAQ.id)
          .single()
          .then(({ data: prev }) => {
            if (prev && prev.answer !== 'pass') {
              setIsLocked(true)
              setPreviousAnswer(prev.answer)
              setLockedPoints(prev.points_awarded ?? 0)
            }
          })
      })
  }, [question?.id, playerId, sessionId])

  // Poll Top 5 every 5s
  useEffect(() => {
    if (!sessionId) return
    const fetchTop5 = () => {
      supabase.from('players').select('nickname, total_score')
        .eq('session_id', sessionId).order('total_score', { ascending: false }).limit(5)
        .then(({ data }) => { if (data) setTop5(data) })
    }
    fetchTop5()
    top5IntervalRef.current = setInterval(fetchTop5, 5000)
    return () => { if (top5IntervalRef.current) clearInterval(top5IntervalRef.current) }
  }, [sessionId])

  // Leaderboard / done
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
    if (data.locked) {
      setIsLocked(true)
      setPreviousAnswer(data.previous_answer)
      setLockedPoints(data.points_awarded ?? 0)
      setMyAnswer(null)
      setSubmitting(false)
      return
    }
    setResult(data); setSubmitting(false)
  }

  // ── Tab bar component (reused in voting + locked + reveal) ───────────────
  function TabBar() {
    return (
      <div className="border-t border-gray-800 flex bg-gray-900 shrink-0">
        <button onClick={() => setActiveTab('vote')}
          className={`flex-1 py-3 text-sm font-semibold flex flex-col items-center gap-0.5 transition ${
            activeTab === 'vote' ? 'text-emerald-400 border-t-2 border-emerald-400 -mt-px' : 'text-gray-500'
          }`}>
          <span className="text-lg">🗳️</span>Vote
        </button>
        <button onClick={() => setActiveTab('top5')}
          className={`flex-1 py-3 text-sm font-semibold flex flex-col items-center gap-0.5 transition ${
            activeTab === 'top5' ? 'text-emerald-400 border-t-2 border-emerald-400 -mt-px' : 'text-gray-500'
          }`}>
          <span className="text-lg">🏆</span>Top 5
        </button>
      </div>
    )
  }

  // ── Top 5 content ────────────────────────────────────────────────────────
  function Top5Content() {
    return (
      <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
        <h3 className="text-lg font-bold text-center text-gray-300">🏆 Classement en direct</h3>
        <div className="space-y-2">
          {top5.map((p, i) => (
            <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl ${
              p.nickname === nickname
                ? 'bg-emerald-800/40 border border-emerald-600'
                : 'bg-white/5 border border-white/10'
            }`}>
              <span className="w-6 text-center font-bold">
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
              </span>
              <span className="flex-1 font-medium truncate">{p.nickname}</span>
              <span className="font-black text-emerald-400">{p.total_score}</span>
              {p.nickname === nickname && <span className="text-xs text-emerald-400 shrink-0">← vous</span>}
            </div>
          ))}
          {top5.length === 0 && (
            <p className="text-gray-600 text-center text-sm py-4">Aucun score encore</p>
          )}
        </div>
        <p className="text-xs text-gray-600 text-center">Actualisé toutes les 5 secondes</p>
      </div>
    )
  }

  // ── Guards ──────────────────────────────────────────────────────────────
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

  // ── VOTING ──────────────────────────────────────────────────────────────
  if (session.state === 'voting' && question) {
    const isRoundB = question.round === 'B'

    // Round B locked — show locked screen with tab bar
    if (isRoundB && isLocked) {
      return (
        <main className="h-screen flex flex-col bg-gray-950 text-white">
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6 overflow-y-auto">
            {activeTab === 'vote' ? (
              <div className="text-center space-y-4">
                <div className="text-6xl">🔒</div>
                <h2 className="text-2xl font-black">Vous êtes engagé !</h2>
                <p className="text-gray-400">Vous avez voté au Round A — votre réponse est locked in.</p>
                <div className="px-6 py-4 bg-white/5 border border-white/10 backdrop-blur-sm rounded-2xl">
                  <p className="text-sm text-gray-500 mb-1">Votre réponse</p>
                  <p className="text-2xl font-black text-emerald-400">
                    {previousAnswer ? ANSWER_LABELS[previousAnswer] ?? previousAnswer : '—'}
                  </p>
                </div>
                <p className="text-gray-600 text-sm">Points révélés après le Round B…</p>
              </div>
            ) : (
              <Top5Content />
            )}
          </div>
          <TabBar />
        </main>
      )
    }

    return (
      <main className="h-screen flex flex-col bg-gray-950 text-white">
        {/* Header */}
        <div className="px-4 py-3 bg-gray-900 border-b border-gray-800 flex items-center justify-between shrink-0">
          <span className="text-sm font-semibold text-emerald-400">{question.scenario} · Round {question.round}</span>
          <span className="text-sm text-gray-400">{question.max_points} pts max</span>
        </div>

        {/* Content area */}
        {activeTab === 'vote' ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Pulsing circle — waiting/focus area */}
            <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
              <div className="relative">
                <div className="w-32 h-32 rounded-full bg-emerald-500/20 animate-ping absolute inset-0" />
                <div className="w-32 h-32 rounded-full bg-emerald-500/10 flex items-center justify-center relative">
                  <span className="text-5xl">📊</span>
                </div>
              </div>
              <p className="text-xl font-bold text-center">Regardez l&apos;écran principal</p>
              <p className="text-gray-400 text-sm text-center">Votez dès que vous êtes prêt</p>
            </div>

            {/* Voting buttons */}
            <div className="p-4 bg-gray-950 shrink-0">
              {!myAnswer ? (
                <div className="space-y-3">
                  <p className="text-center text-gray-400 text-sm mb-2">
                    {isRoundB ? 'Ton analyse finale — 500 pts' : 'Que fais-tu sur ce titre ?'}
                  </p>
                  {ANSWER_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => submitAnswer(opt.value)} disabled={submitting}
                      className={`${opt.cls} disabled:opacity-50`}>
                      <span className="text-2xl">{opt.emoji}</span>{opt.label}
                    </button>
                  ))}
                  {!isRoundB && (
                    <button onClick={() => submitAnswer('pass')} disabled={submitting}
                      className="w-full py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition border border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-200 disabled:opacity-50">
                      ⏳ Je passe — je veux voir les indicateurs
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 space-y-3">
                  <div className="text-5xl">{submitting ? '⏳' : '⌛'}</div>
                  <p className="text-lg font-semibold text-gray-300">{submitting ? 'Envoi…' : 'Réponse enregistrée'}</p>
                  {isRoundB && result && !submitting && (
                    <p className="text-2xl font-black text-emerald-400">+{result.points} pts</p>
                  )}
                  <p className="text-gray-500 text-sm">
                    {isRoundB ? 'En attente du révélé…' : 'En attente du Round B…'}
                  </p>
                  {!isRoundB && result?.vote_distribution && !submitting && (
                    <div className="mt-4 space-y-2 text-left">
                      <p className="text-xs text-gray-500 text-center">Comment ont voté les autres</p>
                      {Object.entries(result.vote_distribution).map(([key, pct]) => (
                        <div key={key} className="flex items-center gap-2">
                          <span className="text-xs w-16 text-gray-400">
                            {key === 'buy' ? '📈 Achat' : key === 'sell' ? '📉 Vente' : '⏳ Passe'}
                          </span>
                          <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                              style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
                        </div>
                      ))}
                      <p className="text-xs text-gray-600 text-center mt-2">La bonne réponse sera révélée après le Round B</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <Top5Content />
        )}

        <TabBar />
      </main>
    )
  }

  // ── REVEAL ──────────────────────────────────────────────────────────────
  if (session.state === 'reveal' && question) {
    const correct    = question.correct_answer
    const correctOpt = ANSWER_OPTIONS.find(o => o.value === correct) ?? ANSWER_OPTIONS[0]

    const revealContent = isLocked && previousAnswer ? (() => {
      const wasCorrect = previousAnswer === correct
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
          <div className="text-7xl pop-in">{wasCorrect ? '✅' : '❌'}</div>
          <h2 className="text-2xl font-bold text-center">
            {wasCorrect ? 'Bonne réponse (Round A) !' : 'Raté cette fois'}
          </h2>
          <div className={`px-8 py-4 rounded-2xl text-xl font-bold flex items-center gap-3 ${
            correct === 'buy' ? 'bg-emerald-700' : 'bg-red-700'
          }`}>
            {correctOpt.emoji} {correctOpt.label}
          </div>
          <p className="text-3xl font-black text-emerald-400">+{lockedPoints} pts</p>
          <p className="text-gray-400 text-sm">Score total : <span className="text-white font-semibold">{myScore} pts</span></p>
          <p className="text-gray-600 text-sm">En attente de la prochaine question…</p>
        </div>
      )
    })() : (() => {
      const isCorrect = myAnswer === correct
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
          <div className="text-7xl pop-in">{isCorrect ? '✅' : '❌'}</div>
          <h2 className="text-2xl font-bold text-center">{isCorrect ? 'Bonne réponse !' : 'Raté cette fois'}</h2>
          <div className={`px-8 py-4 rounded-2xl text-xl font-bold flex items-center gap-3 ${
            correct === 'buy' ? 'bg-emerald-700' : 'bg-red-700'
          }`}>
            {correctOpt.emoji} {correctOpt.label}
          </div>
          {result && <p className="text-3xl font-black text-emerald-400">+{result.points} pts</p>}
          <p className="text-gray-400 text-sm">Score total : <span className="text-white font-semibold">{myScore} pts</span></p>
          <p className="text-gray-600 text-sm">En attente de la prochaine question…</p>
        </div>
      )
    })()

    return (
      <main className="h-screen flex flex-col bg-gray-950 text-white">
        {activeTab === 'vote' ? revealContent : <Top5Content />}
        <TabBar />
      </main>
    )
  }

  // ── LEADERBOARD / DONE ──────────────────────────────────────────────────
  if (session.state === 'leaderboard' || session.state === 'done') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gray-950 text-white p-6">
        <h2 className="text-3xl font-black">🏆 Classement</h2>
        {myRank && (
          <div className="text-center bg-white/5 border border-white/10 backdrop-blur-sm rounded-2xl px-8 py-4">
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
