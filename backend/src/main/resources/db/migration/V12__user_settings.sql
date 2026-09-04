-- Per-user preferences.
--
-- Columns on app_user rather than a settings table: there is one row per user and
-- every field here is single-valued, so a join would buy nothing. The point to
-- split them out is if settings ever grow per-deck or per-device variants.
--
-- Every default below is the value the app hard-coded before this existed, so
-- adding the columns changes nobody's behaviour.

alter table app_user
    -- 'system' follows the OS; the other two are an explicit override. Stored
    -- rather than kept in the browser so the choice survives a new device.
    add column theme        text    not null default 'system',
    -- Whether furigana start switched on when a passage is analysed.
    add column furigana     boolean not null default true,
    -- Review and handwriting queue length, previously a hard-coded limit=20.
    add column session_size integer not null default 20;

alter table app_user
    add constraint app_user_theme_check
        check (theme in ('system', 'light', 'dark')),
    -- Mirrors the clamp the due endpoints already apply, so a value that round
    -- trips through settings cannot ask for a queue the API would refuse.
    add constraint app_user_session_size_check
        check (session_size between 5 and 100);
