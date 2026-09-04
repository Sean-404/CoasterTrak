-- Epic Universe: ThemeParks leftover was labeled "Bowser Jr. Challenge".
-- Official Universal name is Mario Kart: Bowser's Challenge
-- (https://www.universalorlando.com/.../mario-kart-bowsers-challenge).

update public.coasters
set
  name = 'Mario Kart: Bowser''s Challenge',
  manufacturer = coalesce(manufacturer, 'Dynamic Attractions'),
  duration_s = coalesce(duration_s, 300),
  opening_year = coalesce(opening_year, 2025),
  enwiki_title = coalesce(enwiki_title, 'Mario Kart: Bowser''s Challenge'),
  status = 'Operating',
  last_synced_at = now()
where id = 9846
  and park_id = (select id from parks where name = 'Epic Universe' limit 1)
  and name ilike '%bowser%';
