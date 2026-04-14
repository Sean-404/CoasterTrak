-- Guard future Wikidata binding integrity without rewriting historical rows.
-- This prevents new inserts/updates from assigning the same Wikidata Q-id to
-- multiple coaster rows.

create or replace function public.guard_unique_wikidata_binding()
returns trigger
language plpgsql
as $$
declare
  new_qid text;
  conflict_id bigint;
begin
  -- Only check when binding columns are inserted/changed.
  if TG_OP = 'UPDATE' then
    if not (
      new.wikidata_id is distinct from old.wikidata_id
      or new.external_source is distinct from old.external_source
      or new.external_id is distinct from old.external_id
    ) then
      return new;
    end if;
  end if;

  new_qid := coalesce(nullif(trim(new.wikidata_id), ''), null);
  if new_qid is null and new.external_source = 'wikidata' then
    new_qid := nullif(trim(new.external_id), '');
  end if;

  if new_qid is null then
    return new;
  end if;

  new_qid := upper(new_qid);

  select c.id
    into conflict_id
    from coasters c
   where c.id <> new.id
     and (
       upper(coalesce(nullif(trim(c.wikidata_id), ''), '')) = new_qid
       or (
         c.external_source = 'wikidata'
         and upper(coalesce(nullif(trim(c.external_id), ''), '')) = new_qid
       )
     )
   order by c.id
   limit 1;

  if conflict_id is not null then
    raise exception
      'Wikidata Q-id % is already bound to coaster id=%',
      new_qid, conflict_id
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_unique_wikidata_binding on coasters;
create trigger trg_guard_unique_wikidata_binding
before insert or update on coasters
for each row
execute function public.guard_unique_wikidata_binding();
