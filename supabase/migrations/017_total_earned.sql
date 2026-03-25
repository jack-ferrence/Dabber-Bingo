-- =============================================================================
-- 017: Add total_earned to profiles for lifetime leaderboard sorting
-- Paste into Supabase SQL Editor and execute.
-- =============================================================================

-- ── Add column ────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_earned int NOT NULL DEFAULT 0;

-- ── Backfill from existing positive transactions ───────────────────────────────
UPDATE public.profiles p
SET total_earned = COALESCE((
  SELECT SUM(amount)
  FROM public.dabs_transactions t
  WHERE t.user_id = p.id
    AND t.amount > 0
), 0);

-- ── Trigger: increment total_earned on each positive transaction insert ────────
CREATE OR REPLACE FUNCTION public.trg_increment_total_earned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.amount > 0 THEN
    UPDATE public.profiles
    SET total_earned = total_earned + NEW.amount
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_total_earned ON public.dabs_transactions;
CREATE TRIGGER trg_total_earned
  AFTER INSERT ON public.dabs_transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_increment_total_earned();
