import type { PassageSentence } from '../components/Passage'

/**
 * Groups the analyzed sentences into reading-sized chunks, identified by the
 * sentence indexes they contain. A single short sentence isn't worth stopping
 * to record — consecutive sentences fold together until a chunk crosses
 * {@link minChars}, and a short leftover tail joins the previous chunk rather
 * than standing alone as an under-length one.
 */
export function chunkSentences(sentences: PassageSentence[], minChars = 40): number[][] {
  const chunks: number[][] = []
  let current: number[] = []
  let currentChars = 0

  sentences.forEach((sentence, index) => {
    current.push(index)
    currentChars += sentence.tokens.reduce((sum, token) => sum + token.surface.length, 0)
    if (currentChars >= minChars) {
      chunks.push(current)
      current = []
      currentChars = 0
    }
  })

  if (current.length > 0) {
    if (chunks.length > 0) {
      chunks[chunks.length - 1].push(...current)
    } else {
      chunks.push(current)
    }
  }

  return chunks
}
