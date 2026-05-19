import { createClient }   from '@supabase/supabase-js'
import { calculatePoints } from '@/lib/questions'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { player_id, question_id, answer } = await req.json()

    const { data: question } = await supabase
      .from('questions')
      .select('correct_answer, max_points, round, scenario, session_id')
      .eq('id', question_id)
      .single()

    if (!question)
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })

    // Round B: block players who already voted (non-pass) in Round A of the same scenario
    if (question.round === 'B') {
      const { data: roundAQ } = await supabase
        .from('questions')
        .select('id')
        .eq('session_id', question.session_id)
        .eq('scenario', question.scenario)
        .eq('round', 'A')
        .single()

      if (roundAQ) {
        const { data: prevAnswer } = await supabase
          .from('answers')
          .select('answer, points_awarded')
          .eq('player_id', player_id)
          .eq('question_id', roundAQ.id)
          .single()

        if (prevAnswer && prevAnswer.answer !== 'pass') {
          return NextResponse.json({
            locked:          true,
            previous_answer: prevAnswer.answer,
            points_awarded:  prevAnswer.points_awarded,
          })
        }
      }
    }

    // Helper: fetch vote distribution after any answer is recorded
    async function getVoteDistribution() {
      const { data: allAnswers } = await supabase
        .from('answers')
        .select('answer')
        .eq('question_id', question_id)
      const total = allAnswers?.length || 1
      const dist = { buy: 0, sell: 0, pass: 0 }
      allAnswers?.forEach(a => {
        if (a.answer in dist) dist[a.answer as keyof typeof dist]++
      })
      return {
        buy:  Math.round(dist.buy  / total * 100),
        sell: Math.round(dist.sell / total * 100),
        pass: Math.round(dist.pass / total * 100),
      }
    }

    // 'pass' answer — record with 0 points, no score update
    if (answer === 'pass') {
      await supabase.from('answers').upsert(
        { player_id, question_id, answer: 'pass', points_awarded: 0 },
        { onConflict: 'player_id,question_id', ignoreDuplicates: true }
      )
      const vote_distribution = await getVoteDistribution()
      return NextResponse.json({ points: 0, is_correct: false, rank: 0, vote_distribution })
    }

    // Normal scoring for buy/sell
    const { count } = await supabase
      .from('answers')
      .select('*', { count: 'exact', head: true })
      .eq('question_id', question_id)
      .eq('answer', question.correct_answer)

    const isCorrect = answer === question.correct_answer
    const rank      = isCorrect ? (count || 0) + 1 : 0
    const points    = isCorrect ? calculatePoints(rank, question.max_points) : 0

    const { error: ansErr } = await supabase
      .from('answers')
      .upsert(
        { player_id, question_id, answer, points_awarded: points },
        { onConflict: 'player_id,question_id', ignoreDuplicates: true }
      )

    if (ansErr) return NextResponse.json({ error: ansErr.message }, { status: 500 })

    const { data: player } = await supabase
      .from('players')
      .select('total_score')
      .eq('id', player_id)
      .single()

    await supabase
      .from('players')
      .update({ total_score: (player?.total_score ?? 0) + points })
      .eq('id', player_id)

    const vote_distribution = await getVoteDistribution()
    // Never reveal is_correct to players — only shown at reveal after Round B
    return NextResponse.json({ points, is_correct: false, rank, vote_distribution })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
