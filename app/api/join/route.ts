import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { code, nickname } = await req.json()

    if (!code || !nickname?.trim()) {
      return NextResponse.json({ error: 'Code et pseudo requis' }, { status: 400 })
    }

    const { data: session } = await supabase
      .from('sessions')
      .select('id, state')
      .eq('code', code.toUpperCase().trim())
      .single()

    if (!session)
      return NextResponse.json({ error: 'Code invalide' }, { status: 404 })
    if (session.state !== 'lobby')
      return NextResponse.json({ error: 'Session déjà commencée' }, { status: 400 })

    const { data: player, error } = await supabase
      .from('players')
      .insert({ session_id: session.id, nickname: nickname.trim(), total_score: 0 })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      player_id:  player.id,
      session_id: session.id,
      code:       code.toUpperCase(),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
