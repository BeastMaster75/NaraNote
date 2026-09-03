-- Kanji reference data.
--
-- Sources, both CC BY-SA and both required to be attributed in the UI:
--   KANJIDIC2 via jmdict-simplified  (EDRDG)      — readings, meanings, metadata
--   KanjiVG    (c) Ulrich Apel                    — stroke-order diagrams
--
-- Stroke order is a separate table rather than a nullable column because the
-- two sets genuinely differ in size: KANJIDIC2 carries ~10,400 characters,
-- KanjiVG ~6,700 diagrams. A third of all kanji have no diagram at all.

create table kanji (
    literal      text primary key,
    stroke_count int,
    grade        int,
    jlpt_level   int,
    frequency    int,
    meanings     text[] not null default '{}',
    on_readings  text[] not null default '{}',
    kun_readings text[] not null default '{}',
    nanori       text[] not null default '{}'
);

-- Ordering surfaces: "common kanji first" and "grade 3 kanji" are both
-- expected queries, and both columns are sparse enough to be worth indexing.
create index idx_kanji_frequency on kanji (frequency) where frequency is not null;
create index idx_kanji_grade on kanji (grade) where grade is not null;

create table kanji_stroke_order (
    literal text primary key references kanji (literal) on delete cascade,
    svg     text not null
);
