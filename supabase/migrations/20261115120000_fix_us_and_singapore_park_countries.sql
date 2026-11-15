-- A loose coordinate box (43–47.5°N, 80–57°W) labelled these northern US parks as Canada,
-- and Universal Studios Singapore was stored as Malaysia. geo-country.ts no longer does the
-- first, and PARK_COUNTRY_BY_NAME keeps all five correct after future syncs.
update public.parks
set country = 'United States'
where country = 'Canada'
  and name in ('Seabreeze Amusement Park', 'Great Escape', 'Story Land', 'Funtown Splashtown USA');

update public.parks
set country = 'Singapore'
where country = 'Malaysia'
  and name = 'Universal Studios Singapore';
