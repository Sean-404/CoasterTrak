-- Catalog quality hard-fails when opening_year > closing_year (relocated QIDs
-- that kept the previous park's retirement after Wikipedia filled opening year).
-- Clear those stale prior-life closing years; keep status as-is.

update public.coasters
set closing_year = null,
    last_synced_at = now()
where opening_year is not null
  and closing_year is not null
  and opening_year > closing_year;
