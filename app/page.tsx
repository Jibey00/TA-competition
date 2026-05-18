import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6">
      <h1 className="text-4xl font-bold tracking-tight">TA Competition</h1>
      <p className="text-gray-400">Technical Analysis Quiz</p>
      <div className="flex gap-4 mt-4">
        <Link
          href="/host"
          className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-semibold text-lg transition"
        >
          🎙 Host
        </Link>
        <Link
          href="/join"
          className="px-8 py-4 bg-gray-800 hover:bg-gray-700 rounded-xl font-semibold text-lg transition"
        >
          📱 Rejoindre
        </Link>
      </div>
    </main>
  )
}
