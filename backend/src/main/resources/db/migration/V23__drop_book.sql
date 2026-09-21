-- Aozora Bunko integration removed: nothing in the seeded catalog scored below
-- N2/N1 (public-domain Japanese literature is, structurally, old and skews
-- hard), and the source itself needs replacing before this table is worth
-- having again. A new migration to drop it rather than deleting V20 — this
-- codebase treats migrations as append-only history, and a fresh source will
-- get its own table and its own migration when it's ready.

drop table if exists book;
