import { createClient } from '@supabase/supabase-js'
import { QUESTIONS } from '@/lib/questions'
import { NextResponse } from 'next/server'

import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    console.log('ENV CHECK:', { url: url?.slice(0, 30), keyStart: key?.slice(0, 20) })

    if (!url || !key) {
      return NextResponse.json({ error: `Missing: url=${!!url} key=${!!key}` }, { status: 500 })
    }

    const supabase = createClient(url, key)

    const body   = await req.json().catch(() => ({}))
    const warmup = body.warmup === true

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const code = Array.from({ length: 4 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('')

    console.log('Inserting session with code:', code)

    const { data: session, error: sessionErr } = await supabase
      .from('sessions')
      .insert({ code, state: 'lobby', current_question: 0, warmup })
      .select()
      .single()

    console.log('Session result:', { session, sessionErr })

    if (sessionErr) {
      return NextResponse.json({ error: sessionErr.message, details: sessionErr }, { status: 500 })
    }

    const { error: qErr } = await supabase.from('questions').insert(
      QUESTIONS.map(q => ({
        session_id: session.id,
        idx: q.idx,
        image_url: q.image_url,
        reveal_image_url: q.reveal_image_url,
        scenario: q.scenario,
        round: q.round,
        correct_answer: q.correct_answer,
        max_points: q.max_points,
        label: q.label,
        explain: q.explain,
      }))
    )

    console.log('Questions insert error:', qErr)

    if (qErr) {
      return NextResponse.json({ error: qErr.message, details: qErr }, { status: 500 })
    }

    return NextResponse.json({ code, session_id: session.id })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : ''
    console.error('CAUGHT ERROR:', message, stack)
    return NextResponse.json({ error: message, stack }, { status: 500 })
  }
}
