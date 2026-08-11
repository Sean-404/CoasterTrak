-- Keep Taiwan parks distinct from China in catalog country labels.
update parks
set country = 'Taiwan'
where latitude between 21.9 and 25.4
  and longitude between 119.5 and 122.1
  and (
    country is null
    or lower(btrim(country)) in ('china', 'prc', 'people''s republic of china', 'peoples republic of china')
    or lower(country) like '%taiwan%'
    or lower(country) like '%chinese taipei%'
  );
