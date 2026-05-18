import { createClient } from '@supabase/supabase-js'
import { QUESTIONS }    from '@/lib/questions'
import { NextResponse }  from 'next/server'

export const dynamic = 'force-dynamic'

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 4 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const code = generateCode()

  const { data: session, error: sessionErr } = await supabase
    .from('sessions')
    .insert({ code, state: 'lobby', current_question: 0 })
    .select()
    .single()

  if (sessionErr) return NextResponse.json({ error: sessionErr.message }, { status: 500 })

  const { error: qErr } = await supabase.from('questions').insert(
    QUESTIONS.map(q => ({
      session_id:     session.id,
      idx:            q.idx,
      image_url:      q.image_url,
      scenario:       q.scenario,
      round:          q.round,
      correct_answer: q.correct_answer,
      max_points:     q.max_points,
      label:          q.label,
      explain:        q.explain,
    }))
  )

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })

  return NextResponse.json({ code, session_id: session.id })
}
