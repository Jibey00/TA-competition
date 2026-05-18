export type Answer = 'buy' | 'sell' | 'hold'

export interface QuestionConfig {
  idx:              number
  scenario:         string
  round:            'A' | 'B'
  image_url:        string
  reveal_image_url: string
  correct_answer:   Answer
  max_points:       1000 | 500
  label:            string
  explain:          string
}

export const QUESTIONS: QuestionConfig[] = [
  {
    idx:            0,
    scenario:       'Scénario 1',
    round:          'A',
    image_url:        '/charts/S1_clean.png',
    reveal_image_url: '/charts/S1_reveal.png',
    correct_answer:   'sell',
    max_points:       1000,
    label:            'Meta Platforms (META) — Chart brut',
    explain:          "Bull Trap — META rebondit +23 % jusqu'à 185 $ puis s'effondre à 88 $.",
  },
  {
    idx:              1,
    scenario:         'Scénario 1',
    round:            'B',
    image_url:        '/charts/S1_annotated.png',
    reveal_image_url: '/charts/S1_reveal.png',
    correct_answer:   'sell',
    max_points:       500,
    label:            'Meta Platforms (META) — Avec indicateurs',
    explain:          'RSI en divergence baissière sur le second pic + résistance non franchie.',
  },
  {
    idx:              2,
    scenario:         'Scénario 2',
    round:            'A',
    image_url:        '/charts/S2_clean.png',
    reveal_image_url: '/charts/S2_reveal.png',
    correct_answer:   'buy',
    max_points:       1000,
    label:            'Apple (AAPL) — Chart brut',
    explain:          'Pullback MA50 en uptrend — rebond vers ATH 198 $ (+21 %).',
  },
  {
    idx:              3,
    scenario:         'Scénario 2',
    round:            'B',
    image_url:        '/charts/S2_annotated.png',
    reveal_image_url: '/charts/S2_reveal.png',
    correct_answer:   'buy',
    max_points:       500,
    label:            'Apple (AAPL) — Avec indicateurs',
    explain:          'RSI en survente + volume sec sur la correction → absence de distribution.',
  },
  {
    idx:              4,
    scenario:         'Scénario 3',
    round:            'A',
    image_url:        '/charts/S3_clean.png',
    reveal_image_url: '/charts/S3_reveal.png',
    correct_answer:   'buy',
    max_points:       1000,
    label:            'Gold Spot (XAU/USD) — Chart brut',
    explain:          'Falling Wedge — breakout haussier +23 % en 3 mois.',
  },
  {
    idx:              5,
    scenario:         'Scénario 3',
    round:            'B',
    image_url:        '/charts/S3_annotated.png',
    reveal_image_url: '/charts/S3_reveal.png',
    correct_answer:   'buy',
    max_points:       500,
    label:            'Gold Spot (XAU/USD) — Avec indicateurs',
    explain:          'Divergence RSI haussière + volume décroissant = compression avant breakout.',
  },
]

/**
 * Points awarded based on answer rank (speed).
 * 1st correct answer = maxPoints, scales down to maxPoints/2 minimum.
 */
export function calculatePoints(rank: number, maxPoints: number): number {
  const min  = Math.floor(maxPoints / 2)
  const step = (maxPoints - min) / 19   // 20 players fill the full range
  return Math.max(min, Math.round(maxPoints - (rank - 1) * step))
}
