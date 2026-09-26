/**
 * /api/tts responses are cached by the browser for a year (see TtsController) — the URL is
 * the cache key, and it never otherwise changes, so a word played before a server-side voice
 * change stays stuck on the old voice forever unless the URL changes too. Bump this to match
 * naranote.voicevox.speaker-id (application.yaml) whenever the default voice changes; the
 * backend doesn't read this param at all, it exists purely to bust stale client caches.
 */
const VOICEVOX_SPEAKER_ID = 2

export function ttsUrl(text: string) {
  return `/api/tts?text=${encodeURIComponent(text)}&voice=${VOICEVOX_SPEAKER_ID}`
}
