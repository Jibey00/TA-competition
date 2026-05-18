import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { QUESTIONS } from '@/lib/questions'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { session_id, action } = await req.json()

  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', session_id)
    .single()

  if (!session)
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  let update: Record<string, unknown> = {}

  switch (action) {
    case 'start':
      update = { state: 'voting', current_question: 0 }
      break
    case 'reveal':
      update = { state: 'reveal' }
      break
    case 'leaderboard':
      update = { state: 'leaderboard' }
      break
    case 'next': {
      const next = session.current_question + 1
      update = next >= QUESTIONS.length
        ? { state: 'done' }
        : { state: 'voting', current_question: next }
      break
    }
    case 'finish':
      update = { state: 'done' }
      break
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  await supabase.from('sessions').update(update).eq('id', session_id)
  return NextResponse.json({ ok: true })
}
