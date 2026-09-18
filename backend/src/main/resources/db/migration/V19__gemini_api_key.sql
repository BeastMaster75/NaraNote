-- Stored encrypted (see com.naranote.security.CryptoService), never plaintext — nullable, no
-- default, same shape as V15's password_hash addition: most rows won't have one until the
-- user opts in from Settings.
alter table app_user add column gemini_api_key text;
