-- Guest accounts: "Continue as Guest" creates a real app_user row with no
-- email and no password, signed in by the session cookie alone. Every
-- per-user table already keys on app_user.id, so turning a guest into an
-- account later is attaching credentials to this same row — nothing is
-- copied or merged.
--
-- pending_email holds the address a guest asked to save their collection to,
-- until they click the link mailed there. Only then does it move into
-- `email` (see EmailVerificationService.consume), so an account never exists
-- in an unverified state, and typing someone else's address claims nothing.
alter table app_user
    add column is_guest      boolean not null default false,
    add column pending_email text;

-- GuestCleanupJob looks for guests with no live session left.
create index idx_app_user_guest on app_user (id) where is_guest;
create index idx_app_session_user on app_session (user_id);
