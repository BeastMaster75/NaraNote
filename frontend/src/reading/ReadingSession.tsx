import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { KanjiPickDetail } from '../components/KanjiPickDetail'
import { Page } from '../components/Page'
import {
  hasKanji,
  Passage,
  sentenceText,
  type PassageMark,
  type PassageSentence,
} from '../components/Passage'
import { ttsUrl } from '../components/tts'
import { useUser } from '../user/UserContext'
import { chunkSentences } from './chunking'
import { EvaluationResult, type EvaluateResponse } from './EvaluationResult'
import { ReadingSummary } from './ReadingSummary'
import { useAudioRecorder } from './useAudioRecorder'
import './ReadingSession.css'

type AnalyzeResponse = { sentences: PassageSentence[] }
type Collected = { literal: string; meanings: string[]; addedAt: string }
type KanjiPick = { literal: string; sentence: string }

/** What Read's picker page hands over: text already in hand — an upload's
 *  extracted text, or a paste. */
type HandOff = { text?: string; source?: string }

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

  // Fires once on arrival: analyses whatever text the picker page handed over,
  // the same way Mining does.
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true

    if (!handOff?.text) {
      setLoadError('Nothing to read — pick something on the Read page.')
      return
    }

    void (async () => {
      try {
        const analyzeResponse = await fetch('/api/reading/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: handOff.text }),
        })
        if (!analyzeResponse.ok) throw new Error(String(analyzeResponse.status))
        setResult((await analyzeResponse.json()) as AnalyzeResponse)
      } catch {
        setLoadError('Couldn’t load that passage.')
      }
    })()
  }, [handOff])

  const chunks = useMemo(() => (result ? chunkSentences(result.sentences) : []), [result])
  const activeChunk = useMemo(() => chunks[chunkIndex] ?? [], [chunks, chunkIndex])
  const activeSentenceIndexes = useMemo(() => new Set(activeChunk), [activeChunk])
  const expectedText = useMemo(
    () => (result ? activeChunk.map((i) => sentenceText(result.sentences[i])).join('') : ''),
    [result, activeChunk],
  )

  // The check answers in offsets into expectedText; walking the chunk's tokens in
  // the same order that text was built from turns each back into the tokens it
  // covers. Offsets, not the server's own tokenization, so the two tokenizing a
  // sentence slightly differently can't put an underline on the wrong word.
  const marks = useMemo(() => {
    const map = new Map<string, PassageMark>()
    if (!result || phase !== 'result' || !evaluation) return map
    let offset = 0
    for (const sentenceIndex of activeChunk) {
      result.sentences[sentenceIndex].tokens.forEach((token, tokenIndex) => {
        const from = offset
        const to = offset + token.surface.length
        offset = to
        const misread = evaluation.misreads.find((m) => m.start < to && m.end > from)
        if (!misread) return
        map.set(`${sentenceIndex}:${tokenIndex}`, {
          type: misread.type,
          heard: misread.heard,
          say: to >= misread.end ? misread.say : null,
          word: misread.expected,
        })
      })
    }
    return map
  }, [result, phase, evaluation, activeChunk])

  const voice = useRef<HTMLAudioElement | null>(null)
  const say = useCallback((text: string) => {
    voice.current?.pause()
    voice.current = new Audio(ttsUrl(text))
    voice.current.play().catch(() => {})
  }, [])
  useEffect(() => () => voice.current?.pause(), [])

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

  function retryChunk() {
    setEvaluation(null)
    setPhase('record')
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
            marks={marks}
            onSay={say}
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
          <aside
            className={`reading-control card${phase === 'summary' || phase === 'evaluating' || (phase === 'result' && evaluation) ? '' : ' is-inverted is-recording-panel'}`}
          >
            {phase === 'summary' ? (
              <ReadingSummary kanji={passageKanji} library={library} onDone={() => navigate('/read')} />
            ) : phase === 'evaluating' ? (
              <div className="reading-loading">
                <span className="reading-spinner" aria-hidden="true" />
                <p className="muted">Listening back and checking it against the text&hellip;</p>
              </div>
            ) : phase === 'result' && evaluation ? (
              <EvaluationResult
                result={evaluation}
                onNext={nextChunk}
                onRetry={retryChunk}
                onSay={say}
                isLast={chunkIndex + 1 >= chunks.length}
              />
            ) : (
              <div className="reading-record">
                <p className="reading-part">
                  <span className="reading-part-number">{chunkIndex + 1}</span>
                  <span className="reading-part-of">of {chunks.length}</span>
                </p>
                <p className="reading-record-hint">
                  Read the highlighted text aloud, then stop to check it.
                </p>
                {evalError && <p className="error small">{evalError}</p>}
                {recorder.error && <p className="error small">{recorder.error}</p>}
                {/* One big round button, the way a recorder looks — the one thing
                    to do on this screen shouldn't be a small pill in a corner. */}
                {recorder.state === 'recording' ? (
                  <button
                    type="button"
                    className="reading-mic is-live"
                    onClick={stopAndEvaluate}
                  >
                    <span className="reading-mic-icon is-stop" aria-hidden="true" />
                    <span className="reading-mic-label">Stop &amp; Check</span>
                  </button>
                ) : (
                  <button type="button" className="reading-mic" onClick={recorder.start}>
                    <svg
                      className="reading-mic-icon"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M19 11a7 7 0 0 1-14 0 M12 18v3" />
                    </svg>
                    <span className="reading-mic-label">Record</span>
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
