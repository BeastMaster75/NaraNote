package com.naranote.reading;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BookRepository extends JpaRepository<Book, Long> {

    List<Book> findByCachedPlainTextIsNull();

    /** Books scored at or easier than the given level (see {@link Book#getComputedJlptLevel()}
     *  for the direction), shortest first — "small books" is the point. */
    List<Book> findByComputedJlptLevelGreaterThanEqualOrderByCharCountAsc(int level);
}
