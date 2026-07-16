alter table public.assignments
  add column if not exists boarding_order integer not null default 0
  check (boarding_order >= 0);

create index if not exists assignments_bus_boarding_order_idx
  on public.assignments (bus_id, boarding_order)
  where boarding_order > 0;

create or replace function public.reorder_bus_assignments(
  p_bus_id bigint,
  p_assignment_ids bigint[]
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  with ordered as (
    select assignment_id, position::integer as boarding_order
    from unnest(p_assignment_ids) with ordinality as items(assignment_id, position)
  ), updated as (
    update public.assignments as assignment
    set boarding_order = ordered.boarding_order
    from ordered
    where assignment.id = ordered.assignment_id
      and assignment.bus_id = p_bus_id
    returning assignment.id
  )
  select count(*)::integer from updated;
$$;

revoke all on function public.reorder_bus_assignments(bigint, bigint[]) from public, anon, authenticated;
grant execute on function public.reorder_bus_assignments(bigint, bigint[]) to service_role;
