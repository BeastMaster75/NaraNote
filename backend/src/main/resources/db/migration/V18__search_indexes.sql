-- Reverse lookup (English meaning -> kanji/word). dict_sense is ~253k rows, the one table
-- here large enough that a substring scan needs index help; kanji is ~10k rows and a plain
-- sequential unnest+ilike scan against it is sub-millisecond, no index needed there.
--
-- Trigram, not a plain GIN on the array: it supports arbitrary '%term%' substring matches
-- (someone typing "wat" should find "water"), not just whole-gloss equality. Trigram indexes
-- are built over text, not text[] — array_to_string() would give that, but Postgres requires
-- an index expression's functions to be IMMUTABLE and array_to_string() is only STABLE (so is
-- the plain ::text cast, via array_out — tried that first, same rejection). Wrapping it in a
-- hand-declared IMMUTABLE function is the standard fix: safe here since these are plain text
-- arrays with no locale-sensitive element type to worry about.
create extension if not exists pg_trgm;

create function nn_immutable_glosses_text(text[]) returns text
    language sql immutable strict parallel safe
    as $$ select array_to_string($1, ' ') $$;

create index idx_dict_sense_glosses_trgm
    on dict_sense using gin (nn_immutable_glosses_text(glosses) gin_trgm_ops);
