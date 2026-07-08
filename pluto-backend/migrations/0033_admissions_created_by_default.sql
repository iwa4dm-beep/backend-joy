-- Fix admissions inserts from PostgREST-style clients that omit created_by.
-- The RLS policy correctly requires created_by = auth.uid(), but without a
-- default/trigger omitted values evaluate as NULL and fail WITH CHECK.

alter table public.admissions
  alter column created_by set default auth.uid();

create or replace function public.admissions_set_created_by()
returns trigger language plpgsql as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_admissions_set_created_by on public.admissions;
create trigger trg_admissions_set_created_by
  before insert on public.admissions
  for each row execute function public.admissions_set_created_by();

-- Keep the secure ownership policy explicit and idempotent.
drop policy if exists "authenticated can insert own admissions" on public.admissions;
create policy "authenticated can insert own admissions"
  on public.admissions for insert
  to authenticated
  with check (created_by = auth.uid());