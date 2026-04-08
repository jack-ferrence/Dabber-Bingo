-- Add favorite_teams JSONB column to profiles
-- Shape: { "nba": ["LAL", "BOS"], "mlb": ["NYY"] }
alter table profiles
  add column if not exists favorite_teams jsonb default '{}'::jsonb;
