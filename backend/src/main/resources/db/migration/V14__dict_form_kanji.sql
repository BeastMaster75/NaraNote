-- Which dictionary words contain a given kanji, for the Reading deck's word
-- selection. dict_form is only indexed by exact text, so there's no way to ask
-- "which words contain 教" without this.
--
-- No FK to kanji(literal): a JMdict form can contain a character KANJIDIC2
-- doesn't cover, and that word can then never fully qualify for the Reading
-- deck anyway, since it could never appear in kanji_library (which does FK to
-- kanji). Filtering happens at candidate-check time, not here.

create table dict_form_kanji (
    entry_id text not null references dict_entry (id) on delete cascade,
    literal  text not null,
    form     text not null,
    primary key (entry_id, literal, form)
);

create index idx_dict_form_kanji_literal on dict_form_kanji (literal);
