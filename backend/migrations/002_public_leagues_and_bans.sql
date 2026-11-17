-- Liga publiczna: widoczna na liście lig publicznych, dołączenie bez kodu.
-- Liga prywatna (domyślnie): dołączenie tylko kodem zaproszenia.
ALTER TABLE leagues ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_leagues_public ON leagues (is_public) WHERE is_public;

-- Gracze usunięci z ligi (ban) – nie mogą do niej wrócić, dopóki założyciel albo admin ich nie przywróci.
CREATE TABLE league_bans
(
    league_id INTEGER     NOT NULL REFERENCES leagues (id) ON DELETE CASCADE,
    user_id   INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    banned_by INTEGER     REFERENCES users (id) ON DELETE SET NULL,
    banned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (league_id, user_id)
);
