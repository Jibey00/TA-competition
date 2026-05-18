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
      .select('correct_answer, max_points')
      .eq('id', question_id)
      .single()

    if (!question)
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })

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

    return NextResponse.json({ points, is_correct: isCorrect, rank })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
