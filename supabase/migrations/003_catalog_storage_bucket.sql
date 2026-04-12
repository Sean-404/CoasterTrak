-- Public bucket for generated catalog JSON (e.g. wikidata_coasters.json) used by WIKIDATA_COASTERS_URL.
-- Run in Supabase SQL Editor or via CLI so server-side sync can fetch the snapshot.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalog',
  'catalog',
  true,
  104857600, -- 100 MiB
  array['application/json', 'text/plain', 'application/octet-stream']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read catalog objects" on storage.objects;
create policy "Public read catalog objects"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'catalog');
