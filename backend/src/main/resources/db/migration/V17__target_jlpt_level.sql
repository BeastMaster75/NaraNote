-- Optional per-account cap for Reading-deck generation. 0 means "no target set" rather
-- than null — the /api/me PATCH endpoint already treats a null field as "leave this alone",
-- so a real value is needed to mean "clear it".
alter table app_user
    add column target_jlpt_level integer not null default 0
        check (target_jlpt_level between 0 and 5);
