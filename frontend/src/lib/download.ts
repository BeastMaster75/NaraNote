/**
 * Fetch a file and hand it to the browser as a download.
 *
 * <p>Fetched rather than given to a plain link: a failed export would otherwise
 * navigate the user to a page of raw JSON instead of telling them what went
 * wrong. The server's own filename is honoured when it sends one, so a per-deck
 * export doesn't arrive as the third copy of naranote.apkg.
 */
export async function downloadFile(path: string, fallbackName: string) {
  const response = await fetch(path)
  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    throw new Error(detail?.message || `Export failed (${response.status})`)
  }

  const url = URL.createObjectURL(await response.blob())
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = filenameFrom(response.headers.get('Content-Disposition')) ?? fallbackName
    link.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Reads Content-Disposition. Prefers the RFC 5987 `filename*` form, which is the
 * only one that survives a Japanese deck name — plain `filename` would have been
 * flattened to question marks on the way.
 */
function filenameFrom(header: string | null): string | null {
  if (!header) return null

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim())
    } catch {
      // A malformed header shouldn't cost the user their download.
    }
  }

  const plain = /filename="?([^";]+)"?/i.exec(header)
  return plain ? plain[1].trim() : null
}
