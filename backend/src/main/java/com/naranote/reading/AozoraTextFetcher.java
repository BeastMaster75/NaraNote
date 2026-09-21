package com.naranote.reading;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.Charset;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Fetches a book's plain Japanese text from its Aozora Bunko card page.
 *
 * <p>A card page (e.g. {@code .../card127.html}) links to the work's actual XHTML
 * text (e.g. {@code .../files/127_15260.html}) — that link, not the card URL
 * itself, has to be resolved first. Aozora's XHTML is Shift_JIS-encoded despite
 * the extension, and wraps the story in {@code <div class="main_text">...</div>};
 * everything before/after that div is title/legend chrome or a bibliographic
 * footer, not story text.
 *
 * <p>Furigana in the source ({@code <ruby><rb>漢字</rb><rp>（</rp><rt>かんじ</rt>
 * <rp>）</rp></ruby>}) is discarded entirely rather than kept — the app's own
 * tokenizer supplies readings for every other passage, so a Read passage reads
 * consistently with a pasted or uploaded one instead of carrying two different
 * furigana sources.
 */
@Component
public class AozoraTextFetcher {

    private static final Charset AOZORA_CHARSET = Charset.forName("Shift_JIS");

    private static final Pattern TEXT_FILE_LINK = Pattern.compile("href=\"(files/[^\"]+\\.html)\"");
    private static final Pattern MAIN_TEXT =
            Pattern.compile("<div class=\"main_text\">(.*?)</div>", Pattern.DOTALL);
    // Paragraph/line breaks have to become real newlines *before* tags are
    // stripped, or every paragraph in a chapter runs into the next as one
    // unbroken line.
    private static final Pattern BLOCK_BREAK = Pattern.compile("(?i)</p>|<br\\s*/?>");
    // <rt>/<rp> content is a reading, not story text — dropped along with its
    // tags, not just untagged, or "漢字" becomes "漢字（かんじ）".
    private static final Pattern RUBY_READING =
            Pattern.compile("<rp>.*?</rp>|<rt>.*?</rt>", Pattern.DOTALL);
    private static final Pattern ANY_TAG = Pattern.compile("<[^>]+>");
    // Gaiji (characters outside the JIS charset) are described in brackets
    // rather than rendered — not real story text either.
    private static final Pattern GAIJI_NOTE = Pattern.compile("※［[^］]*］");

    private final HttpClient http = HttpClient.newHttpClient();

    public String fetchPlainText(String cardUrl) {
        String cardHtml = get(cardUrl);
        URI textUrl = URI.create(cardUrl).resolve(textFileLink(cardHtml, cardUrl));
        String textHtml = get(textUrl.toString());
        return stripToPlainText(textHtml, textUrl.toString());
    }

    static String textFileLink(String cardHtml, String cardUrl) {
        Matcher link = TEXT_FILE_LINK.matcher(cardHtml);
        if (!link.find()) {
            throw new AozoraParseException("No text file link found on " + cardUrl);
        }
        return link.group(1);
    }

    /** Pure text-processing step, split out from the network fetch above so it can be
     *  exercised directly against a fixture rather than a live Aozora response. */
    static String stripToPlainText(String textHtml, String sourceUrl) {
        Matcher body = MAIN_TEXT.matcher(textHtml);
        if (!body.find()) {
            throw new AozoraParseException("No main_text section found on " + sourceUrl);
        }

        String plain = body.group(1);
        plain = BLOCK_BREAK.matcher(plain).replaceAll("\n");
        plain = RUBY_READING.matcher(plain).replaceAll("");
        plain = ANY_TAG.matcher(plain).replaceAll("");
        plain = GAIJI_NOTE.matcher(plain).replaceAll("");
        plain = plain.replace("\r\n", "\n").strip();
        if (plain.isEmpty()) {
            throw new AozoraParseException("Extracted empty text from " + sourceUrl);
        }
        return plain;
    }

    private String get(String url) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url)).GET().build();
            HttpResponse<byte[]> response =
                    http.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() != 200) {
                throw new AozoraParseException(
                        "Fetching " + url + " returned " + response.statusCode());
            }
            return new String(response.body(), AOZORA_CHARSET);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted fetching " + url, e);
        }
    }

    public static class AozoraParseException extends RuntimeException {
        public AozoraParseException(String message) {
            super(message);
        }
    }
}
