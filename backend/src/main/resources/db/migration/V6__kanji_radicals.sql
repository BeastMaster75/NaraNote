-- Component breakdown of each character, from KRADFILE via jmdict-simplified
-- (EDRDG, CC BY-SA). 待 decomposes to 彳, 土, 寸.
--
-- The index on `radical` rather than only `literal` is deliberate: the reverse
-- lookup — "every kanji containing 彳" — is how you find a character you can see
-- but cannot type, and it needs that direction to be fast.

create table kanji_radical (
    literal text not null references kanji (literal) on delete cascade,
    radical text not null,
    primary key (literal, radical)
);

create index idx_kanji_radical_radical on kanji_radical (radical);
