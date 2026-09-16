-- Server-generated word-reading audio, cached forever. Keyed on (text, speaker_id) rather
-- than text alone: if the default voice ever changes, old audio under the old speaker should
-- not get served back out under the new one.
create table tts_audio (
    text       text        not null,
    speaker_id integer     not null,
    audio      bytea       not null,
    created_at timestamptz not null default now(),
    primary key (text, speaker_id)
);
