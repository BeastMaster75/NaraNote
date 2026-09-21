import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { KanjiPickDetail } from '../components/KanjiPickDetail'
import { Page } from '../components/Page'
import { hasKanji, Passage, sentenceText, type PassageSentence } from '../components/Passage'
import { useUser } from '../user/UserContext'
import { chunkSentences } from './chunking'
import { EvaluationResult, type EvaluateResponse } from './EvaluationResult'
import { ReadingSummary } from './ReadingSummary'
import { useAudioRecorder } from './useAudioRecorder'
import './ReadingSession.css'

type AnalyzeResponse = { sentences: PassageSentence[] }
type Collected = { literal: string; meanings: string[]; addedAt: string }
type KanjiPick = { literal: string; sentence: string }

/** What Read's picker page hands over: either a curated book id, or text
 *  already in hand (an upload's extracted text, or a paste). */
type HandOff = { bookId?: number; text?: string; source?: string }

type Phase = 'record' | 'evaluating' | 'result' | 'summary'

export function ReadingSession() {
  const navigate = useNavigate()
  const { me } = useUser()
  const handOff = useLocation().state as HandOff | null

  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [collected, setCollected] = useState<Collected[] | null>(null)
  const [kanjiPick, setKanjiPick] = useState<KanjiPick | null>(null)

  const [chunkIndex, setChunkIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('record')
  const [evaluation, setEvaluation] = useState<EvaluateResponse | null>(null)
  const [evalError, setEvalError] = useState<string | null>(null)

  const recorder = useAudioRecorder()

  const library = useMemo(
    () => new Set((collected ?? []).map((entry) => entry.literal)),
    [collected],
  )

  const loadLibrary = useCallback(() => {
    fetch('/api/library')
      .then((response) => (response.ok ? (response.json() as Promise<Collected[]>) : []))
      .then(setCollected)
      .catch(() => setCollected([]))
  }, [])

  useEffect(loadLibrary, [loadLibrary])

  // Fires once on arrival: fetches a curated book's text (if handed a bookId)
  // or reuses text already in hand, then analyses it the same way Mining does.
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true

    if (!handOff || (!handOff.bookId && !handOff.text)) {
      setLoadError('Nothing to read — pick something on the Read page.')
      return
    }

    void (async () => {
      try {
        let text = handOff.text ?? null
        if (handOff.bookId) {
          const bookResponse = await fetch(`/api/reading/books/${handOff.bookId}`)
          if (!bookResponse.ok) throw new Error(String(bookResponse.status))
          const book = (await bookResponse.json()) as { text: string | null }
          text = book.text
        }
        if (!text) throw new Error('No text')

        const analyzeResponse = await fetch('/api/reading/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        if (!analyzeResponse.ok) throw new Error(String(analyzeResponse.status))
        setResult((await analyzeResponse.json()) as AnalyzeResponse)
      } catch {
        setLoadError('Couldn’t load that passage.')
      }
    })()
  }, [handOff])

  const chunks = useMemo(() => (result ? chunkSentences(result.sentences) : []), [result])
  const activeChunk = chunks[chunkIndex] ?? []
  const activeSentenceIndexes = useMemo(() => new Set(activeChunk), [activeChunk])
  const expectedText = useMemo(
    () => (result ? activeChunk.map((i) => sentenceText(result.sentences[i])).join('') : ''),
    [result, activeChunk],
  )

  // Every kanji across the whole passage, not just the current chunk — the
  // summary at the end offers all of them, since the point is "what did you
  // meet in this passage", not "what was in the last chunk you read".
  const passageKanji = useMemo(() => {
    if (!result) return []
    const whole = result.sentences.map(sentenceText).join('')
    return [...new Set([...whole].filter(hasKanji))]
  }, [result])

  async function stopAndEvaluate() {
    const recording = await recorder.stop()
    if (!recording) return
    setPhase('evaluating')
    setEvalError(null)
    try {
      const extension = recording.mimeType.includes('ogg') ? 'ogg' : 'webm'
      const form = new FormData()
      form.append('audio', recording.blob, `chunk.${extension}`)
      form.append('expectedText', expectedText)
      const response = await fetch('/api/reading/evaluate', { method: 'POST', body: form })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null
        throw new Error(body?.message || `Evaluation failed (${response.status}).`)
      }
      setEvaluation((await response.json()) as EvaluateResponse)
      setPhase('result')
    } catch (error) {
      setEvalError(error instanceof Error ? error.message : 'Evaluation failed.')
      setPhase('record')
    }
  }

  function nextChunk() {
    setEvaluation(null)
    if (chunkIndex + 1 >= chunks.length) {
      setPhase('summary')
    } else {
      setChunkIndex((index) => index + 1)
      setPhase('record')
    }
  }

  if (loadError) {
    return (
      <Page title="Read">
        <p className="error">{loadError}</p>
        <Link to="/read" className="btn">
          Back to Read
        </Link>
      </Page>
    )
  }

  if (!result) {
    return (
      <Page title="Read">
        <p className="muted">Loading&hellip;</p>
      </Page>
    )
  }

  return (
    <Page title="Read">
      <div className="reading-stage">
        <section className="reading-passage">
          <Passage
            sentences={result.sentences}
            furigana={me.furigana}
            library={library}
            selected={kanjiPick}
            onKanjiTap={(literal, sentence) => setKanjiPick({ literal, sentence })}
            activeSentenceIndexes={phase === 'summary' ? undefined : activeSentenceIndexes}
          />
        </section>

        {kanjiPick ? (
          <aside className="reading-detail">
            <KanjiPickDetail
              key={kanjiPick.literal + kanjiPick.sentence}
              literal={kanjiPick.literal}
              sentence={kanjiPick.sentence}
              source={handOff?.source ?? ''}
              alreadyYours={library.has(kanjiPick.literal)}
              onFiled={loadLibrary}
              onClose={() => setKanjiPick(null)}
            />
          </aside>
        ) : (
          <aside className="reading-control card">
            {phase === 'summary' ? (
              <ReadingSummary kanji={passageKanji} library={library} onDone={() => navigate('/read')} />
            ) : phase === 'evaluating' ? (
              <div className="reading-loading">
                <span className="reading-spinner" aria-hidden="true" />
                <p className="muted">Listening back and checking it against the text&hellip;</p>
              </div>
            ) : phase === 'result' && evaluation ? (
              <EvaluationResult result={evaluation} onNext={nextChunk} isLast={chunkIndex + 1 >= chunks.length} />
            ) : (
              <div className="reading-record">
                <h3 className="kicker">
                  Chunk {chunkIndex + 1} of {chunks.length}
                </h3>
                <p className="muted small">Read the highlighted text aloud, then stop to check it.</p>
                {evalError && <p className="error small">{evalError}</p>}
                {recorder.error && <p className="error small">{recorder.error}</p>}
                {recorder.state === 'recording' ? (
                  <button type="button" className="btn is-primary" onClick={stopAndEvaluate}>
                    Stop &amp; Check
                  </button>
                ) : (
                  <button type="button" className="btn is-primary" onClick={recorder.start}>
                    Record
                  </button>
                )}
              </div>
            )}
          </aside>
        )}
      </div>
    </Page>
  )
}
