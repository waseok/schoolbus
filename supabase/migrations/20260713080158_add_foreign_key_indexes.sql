create index boarding_records_student_id_idx on public.boarding_records (student_id);
create index inspection_responses_item_code_idx on public.inspection_responses (item_code);
create index monthly_inspection_buses_bus_id_idx on public.monthly_inspection_buses (bus_id);
create index monthly_inspections_group_id_idx on public.monthly_inspections (group_id);
create index sessions_user_id_idx on public.sessions (user_id);
create index user_bus_assignments_bus_id_idx on public.user_bus_assignments (bus_id);
