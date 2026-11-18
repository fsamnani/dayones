-- Heat v2 (decided 2026-11-17): every eligible talent gets a stat line every week.
-- Heat = heatBaselinePoints + heatPointsPerDoubling x log2(this week / baseline), clamped 0..heatCap.
insert into public.scoring_settings (key, value, description) values
  ('heatBaselinePoints', '15', 'Heat: points for a normal week (attention equal to the talent''s own baseline)')
on conflict (key) do nothing;
