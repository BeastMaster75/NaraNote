import { useCallback, useRef, useState } from 'react'

type RecorderState = 'idle' | 'recording'

/** getUserMedia + MediaRecorder, reduced to start/stop and the resulting clip. */
export function useAudioRecorder() {
  const [state, setState] = useState<RecorderState>('idle')
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  const start = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorderRef.current = recorder
      recorder.start()
      setState('recording')
    } catch {
      setError('Couldn’t access the microphone.')
    }
  }, [])

  /** Resolves once the recorder has actually flushed its final chunk — null if
   *  nothing was recording. */
  const stop = useCallback((): Promise<{ blob: Blob; mimeType: string } | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current
      if (!recorder || recorder.state !== 'recording') {
        resolve(null)
        return
      }
      recorder.onstop = () => {
        streamRef.current?.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        const mimeType = recorder.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: mimeType })
        chunksRef.current = []
        recorderRef.current = null
        setState('idle')
        resolve({ blob, mimeType })
      }
      recorder.stop()
    })
  }, [])

  return { state, error, start, stop }
}
