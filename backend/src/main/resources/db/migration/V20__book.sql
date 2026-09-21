-- A small curated library of public-domain Japanese short stories (青空文庫 / Aozora
-- Bunko) that the Read feature suggests by JLPT level. Difficulty is not known up
-- front — computed_jlpt_level and cached_plain_text stay null until a book is first
-- opened, at which point BookService fetches, strips and scores it once and the
-- result is cached here for every later request.
--
-- aozora_url is the work's 図書カード (card) page, not the raw text file directly —
-- the card page links to the actual XHTML text, and that link is what
-- AozoraTextFetcher follows at sync time. Card URLs are stable and easy to verify by
-- hand; direct text-file URLs are not (they encode a second, unpredictable file id).
--
-- Deliberately a short, hand-picked list rather than an attempt at Aozora's full
-- ~17,000-work catalog — analysing every work's difficulty up front isn't practical,
-- and a small verified set beats a large guessed one. Extend by adding rows.

create table book (
    id                  bigserial primary key,
    aozora_url          text unique not null,
    title               text not null,
    author              text not null,
    char_count          integer,
    computed_jlpt_level integer,
    cached_plain_text   text,
    synced_at           timestamptz
);

insert into book (aozora_url, title, author) values
    ('https://www.aozora.gr.jp/cards/000879/card127.html',   '羅生門',         '芥川龍之介'),
    ('https://www.aozora.gr.jp/cards/000879/card92.html',    '蜘蛛の糸',       '芥川龍之介'),
    ('https://www.aozora.gr.jp/cards/000879/card43015.html', '杜子春',         '芥川龍之介'),
    ('https://www.aozora.gr.jp/cards/000035/card1567.html',  '走れメロス',     '太宰治'),
    ('https://www.aozora.gr.jp/cards/000081/card43754.html', '注文の多い料理店', '宮沢賢治'),
    ('https://www.aozora.gr.jp/cards/000081/card472.html',   'やまなし',       '宮沢賢治'),
    ('https://www.aozora.gr.jp/cards/000025/card211.html',   '一房の葡萄',     '有島武郎'),
    ('https://www.aozora.gr.jp/cards/000121/card628.html',   'ごん狐',         '新美南吉'),
    ('https://www.aozora.gr.jp/cards/000121/card637.html',   '手袋を買いに',   '新美南吉'),
    ('https://www.aozora.gr.jp/cards/000074/card424.html',   '檸檬',           '梶井基次郎'),
    ('https://www.aozora.gr.jp/cards/000129/card45245.html', '高瀬舟',         '森鴎外');
