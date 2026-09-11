-- Energylandia Dragon (Q25412902 / park branding "RMF Dragon") has no English
-- Wikipedia sitelink. Fuzzy enrichment attached the Legoland multi-park series
-- article "The Dragon (roller coaster)" plus its image / manufacturer / year.

update public.coasters
set
  name = 'RMF Dragon',
  enwiki_title = null,
  summary_text = null,
  image_url = null,
  manufacturer = case
    when manufacturer ilike 'various' then null
    else manufacturer
  end,
  opening_year = case
    when opening_year = 1997 then null
    else opening_year
  end,
  rcdb_id = coalesce(rcdb_id, '12264'),
  last_synced_at = now()
where wikidata_id = 'Q25412902'
  and park_id = (
    select id from public.parks
    where name ilike 'Energylandia'
    order by id
    limit 1
  )
  and (
    enwiki_title = 'The Dragon (roller coaster)'
    or name = 'Dragon'
    or manufacturer ilike 'various'
    or opening_year = 1997
  );
