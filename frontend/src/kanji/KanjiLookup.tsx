import { useEffect, useState, type ReactNode } from 'react'
import './KanjiLookup.css'

type KanjiResponse = {
  literal: string
  strokeCount: number | null
  grade: number | null
  jlptLevel: number | null
  frequency: number | null
  meanings: string[]
  onReadings: string[]
  kunReadings: string[]
  nanori: string[]
  strokeOrderSvg: string | null
}

// Handy without a Japanese IME installed, and each one exercises a different
// edge: a common verb stem, a grade-1 pictograph, and 29 strokes.
const EXAMPLES = ['待', '山', '鬱', '語', '飲']

export function KanjiLookup() {
  const [query, setQuery] = useState('待')
  const [kanji, setKanji] = useState<KanjiResponse | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading')

  // The query may be a whole word pasted in; look up its first character.
  const literal = query ? Array.from(query)[0] : ''

  useEffect(() => {
    if (!literal) {
      setKanji(null)
      return
    }
    let cancelled = false
    setStatus('loading')

    fetch(`/api/kanji/${encodeURIComponent(literal)}`)
      .then((response) => {
        if (response.status === 404) return null
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<KanjiResponse>
      })
      .then((data) => {
        if (cancelled) return
        setKanji(data)
        setStatus(data ? 'ok' : 'missing')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    // Guards against an earlier, slower request landing after a later one.
    return () => {
      cancelled = true
    }
  }, [literal])

  return (
    <section className="lookup">
      <div className="lookup-controls">
        <input
          className="lookup-input jp-lg"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Kanji to look up"
          placeholder="漢字"
        />
        <div className="lookup-examples">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              className="chip jp-sm"
              onClick={() => setQuery(example)}
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {status === 'error' && <p className="error">Couldn&rsquo;t reach the server.</p>}
      {status === 'missing' && (
        <p className="muted">
          No entry for <span className="jp">{literal}</span>. Kana and punctuation aren&rsquo;t in
          the kanji dictionary.
        </p>
      )}
      {status === 'ok' && kanji && <KanjiDetail kanji={kanji} />}
    </section>
  )
}

function KanjiDetail({ kanji }: { kanji: KanjiResponse }) {
  return (
    <article className="kanji">
      <div className="kanji-hero">
        <div className="kanji-glyph">{kanji.literal}</div>
        <dl className="kanji-facts">
          <Fact label="Strokes" value={kanji.strokeCount} />
          <Fact label="Grade" value={kanji.grade} />
          <Fact label="JLPT" value={kanji.jlptLevel ? `N${kanji.jlptLevel}` : null} />
          <Fact label="Frequency" value={kanji.frequency ? `#${kanji.frequency}` : null} />
        </dl>
      </div>

      <div className="kanji-body">
        <div className="kanji-text">
          <Section title="Meaning">
            <p className="kanji-meanings">{kanji.meanings.join(', ') || '—'}</p>
          </Section>

          <Section title="On'yomi">
            <ReadingList readings={kanji.onReadings} />
          </Section>

          <Section title="Kun'yomi">
            <ReadingList readings={kanji.kunReadings} />
          </Section>

          {kanji.nanori.length > 0 && (
            <Section title="In names">
              <ReadingList readings={kanji.nanori} />
            </Section>
          )}
        </div>

        <div className="kanji-strokes">
          <Section title="Stroke order">
            {kanji.strokeOrderSvg ? (
              // Trusted content: these SVGs come from our own import of KanjiVG,
              // not from anything a user supplied.
              <div
                className="stroke-order"
                dangerouslySetInnerHTML={{ __html: kanji.strokeOrderSvg }}
              />
            ) : (
              <p className="muted small">No diagram for this character.</p>
            )}
          </Section>
        </div>
      </div>
    </article>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="kanji-section">
      <h3 className="kicker">{title}</h3>
      {children}
    </div>
  )
}

function ReadingList({ readings }: { readings: string[] }) {
  if (readings.length === 0) return <p className="muted small">—</p>
  return (
    <ul className="readings">
      {readings.map((reading) => (
        <li key={reading} className="reading jp-sm">
          {reading}
        </li>
      ))}
    </ul>
  )
}

function Fact({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{value ?? '—'}</dd>
    </div>
  )
}
