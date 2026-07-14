alter table public.school_settings
  add column if not exists semester1_start_date date,
  add column if not exists semester1_end_date date,
  add column if not exists semester2_start_date date,
  add column if not exists semester2_end_date date;

update public.school_settings
set
  semester1_start_date = coalesce(semester1_start_date, make_date(school_year, 3, 1)),
  semester1_end_date = coalesce(semester1_end_date, make_date(school_year, 8, 31)),
  semester2_start_date = coalesce(semester2_start_date, make_date(school_year, 9, 1)),
  semester2_end_date = coalesce(semester2_end_date, make_date(school_year + 1, 2, 28))
where id = 1;;
