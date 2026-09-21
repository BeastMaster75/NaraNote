package com.naranote.reading;

import com.naranote.reading.ReadingDtos.BookDetail;
import com.naranote.reading.ReadingDtos.BookSummary;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Lists and serves the curated {@code book} library, syncing (fetch, strip,
 * score, cache) each seed row from Aozora Bunko the first time it's needed
 * rather than at startup — so a slow or unreachable seed doesn't block the app
 * from starting, and the cost is paid once per book, not once per request.
 */
@Service
public class BookService {

    private static final Logger log = LoggerFactory.getLogger(BookService.class);

    private final BookRepository bookRepository;
    private final AozoraTextFetcher fetcher;
    private final DifficultyScorer scorer;

    public BookService(BookRepository bookRepository, AozoraTextFetcher fetcher, DifficultyScorer scorer) {
        this.bookRepository = bookRepository;
        this.fetcher = fetcher;
        this.scorer = scorer;
    }

    /** @param level JLPT level to cap suggestions to; 0 means no cap — every synced book. */
    @Transactional
    public List<BookSummary> list(int level) {
        syncPending();
        List<Book> books =
                level == 0
                        ? bookRepository.findAll()
                        : bookRepository.findByComputedJlptLevelGreaterThanEqualOrderByCharCountAsc(level);
        return books.stream()
                .filter(b -> b.getComputedJlptLevel() != null)
                .sorted(Comparator.comparing(Book::getCharCount, Comparator.nullsLast(Integer::compareTo)))
                .map(BookService::summarize)
                .toList();
    }

    @Transactional
    public BookDetail get(long id) {
        Book book =
                bookRepository
                        .findById(id)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such book"));
        if (book.getCachedPlainText() == null) {
            sync(book);
        }
        return new BookDetail(
                book.getId(),
                book.getTitle(),
                book.getAuthor(),
                book.getComputedJlptLevel(),
                book.getCachedPlainText());
    }

    private void syncPending() {
        for (Book book : bookRepository.findByCachedPlainTextIsNull()) {
            try {
                sync(book);
            } catch (RuntimeException e) {
                // One broken/unreachable seed shouldn't take the whole list down — it
                // just stays unsynced, and so invisible, until Aozora is reachable again.
                log.warn("Failed to sync book {} ({})", book.getId(), book.getAozoraUrl(), e);
            }
        }
    }

    private void sync(Book book) {
        String text = fetcher.fetchPlainText(book.getAozoraUrl());
        book.setCachedPlainText(text);
        book.setCharCount(text.codePointCount(0, text.length()));
        book.setComputedJlptLevel(scorer.score(text));
        book.setSyncedAt(Instant.now());
        bookRepository.save(book);
    }

    private static BookSummary summarize(Book book) {
        return new BookSummary(
                book.getId(), book.getTitle(), book.getAuthor(), book.getComputedJlptLevel(), book.getCharCount());
    }
}
