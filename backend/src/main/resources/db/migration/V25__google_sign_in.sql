-- Sign in with Google. google_sub is Google's stable account id (the ID
-- token's `sub`) — never the email, which a Google account can change.
-- An account may have a password, a Google link, or both; a guest has neither
-- until they save their collection (see V24).
alter table app_user add column google_sub text;

create unique index app_user_google_sub_key on app_user (google_sub) where google_sub is not null;
