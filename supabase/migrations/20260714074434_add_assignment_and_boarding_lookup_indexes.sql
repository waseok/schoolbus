-- Speed up student assignment lookups by student and assignment period.
create index if not exists assignments_student_dates_idx
  on public.assignments (student_id, start_date, end_date);

-- Speed up loading a daily run's boarding status and absence statistics.
create index if not exists boarding_records_run_boarded_idx
  on public.boarding_records (daily_run_id, boarded);
