-- Ranking signal for ambiguous lookups.
--
-- jmdict-simplified collapses JMdict's priority fields (news1, ichi1, nf01…) into
-- a single `common` boolean, so it cannot separate 事 from 琴 — both are common,
-- and the tiebreak fell back to entry id, which is arbitrary. こと was resolving
-- to "koto (13-stringed zither)".
--
-- Sense count is a decent proxy for how central a word is: 事 carries 10 senses,
-- 琴 carries 3. Stored at import rather than aggregated per query, because this
-- sits on the hot path of every analysed word.

alter table dict_entry add column sense_count int not null default 0;

create index idx_dict_entry_rank on dict_entry (common desc, sense_count desc);
