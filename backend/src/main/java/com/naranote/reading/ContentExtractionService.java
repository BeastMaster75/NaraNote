package com.naranote.reading;

import io.documentnode.epub4j.domain.Book;
import io.documentnode.epub4j.domain.Resource;
import io.documentnode.epub4j.domain.SpineReference;
import io.documentnode.epub4j.epub.EpubReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/**
 * Plain text out of whatever a Read upload turns out to be. Dispatches on the
 * file's extension rather than its declared content type — browsers are
 * inconsistent about what they report for {@code .txt}/{@code .epub}, and the
 * extension is what the user actually chose.
 */
@Service
public class ContentExtractionService {

    private static final Pattern BLOCK_BREAK = Pattern.compile("(?i)</p>|<br\\s*/?>|</div>");
    private static final Pattern ANY_TAG = Pattern.compile("<[^>]+>");

    public String extract(MultipartFile file) {
        String name =
                file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase();
        String text;
        try {
            if (name.endsWith(".pdf")) {
                text = extractPdf(file.getBytes());
            } else if (name.endsWith(".epub")) {
                text = extractEpub(file.getBytes());
            } else {
                text = new String(file.getBytes(), StandardCharsets.UTF_8);
            }
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Couldn't read that file.");
        }

        text = text.strip();
        if (text.isEmpty()) {
            // Most often a scanned/image-only PDF — there's no OCR in scope, so an
            // empty extraction has to surface as an error, not a silently blank passage.
            throw new ResponseStatusException(
                    HttpStatus.UNPROCESSABLE_ENTITY, "Couldn't find any readable text in that file.");
        }
        return text;
    }

    private String extractPdf(byte[] bytes) throws IOException {
        try (PDDocument document = Loader.loadPDF(bytes)) {
            return new PDFTextStripper().getText(document);
        }
    }

    private String extractEpub(byte[] bytes) throws IOException {
        Book book = new EpubReader().readEpub(new ByteArrayInputStream(bytes));
        StringBuilder out = new StringBuilder();
        for (SpineReference reference : book.getSpine().getSpineReferences()) {
            Resource resource = reference.getResource();
            Charset charset =
                    resource.getInputEncoding() == null
                            ? StandardCharsets.UTF_8
                            : Charset.forName(resource.getInputEncoding());
            String html = new String(resource.getData(), charset);
            String withBreaks = BLOCK_BREAK.matcher(html).replaceAll("\n");
            out.append(ANY_TAG.matcher(withBreaks).replaceAll("")).append('\n');
        }
        return out.toString();
    }
}
