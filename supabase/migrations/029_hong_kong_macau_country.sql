-- Keep Hong Kong / Macau parks distinct from China in catalog country labels.
update parks
set country = 'Hong Kong'
where latitude between 22.15 and 22.6
  and longitude between 113.82 and 114.5
  and (
    country is null
    or lower(btrim(country)) in ('china', 'prc', 'people''s republic of china', 'peoples republic of china')
    or lower(country) like '%hong kong%'
  );

update parks
set country = 'Macau'
where latitude between 22.1 and 22.26
  and longitude between 113.52 and 113.63
  and (
    country is null
    or lower(btrim(country)) in ('china', 'prc', 'people''s republic of china', 'peoples republic of china')
    or lower(country) like '%macau%'
    or lower(country) like '%macao%'
  );
