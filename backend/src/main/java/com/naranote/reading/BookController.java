package com.naranote.reading;

import com.naranote.reading.ReadingDtos.BookDetail;
import com.naranote.reading.ReadingDtos.BookSummary;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/reading/books")
public class BookController {

    private final BookService bookService;

    public BookController(BookService bookService) {
        this.bookService = bookService;
    }

    /** @param level JLPT level to cap suggestions to; 0 (or omitted) means no cap. */
    @GetMapping
    public List<BookSummary> list(@RequestParam(required = false, defaultValue = "0") int level) {
        return bookService.list(level);
    }

    @GetMapping("/{id}")
    public BookDetail get(@PathVariable long id) {
        return bookService.get(id);
    }
}
