-- Q2197655 is Plopsaland Ardennes (formerly Plopsa Coo). WDQS stored the
-- entity id because the item had no English label. Q122460556 is Wickie The Ride.

update parks
set
  name = 'Plopsaland Ardennes',
  external_source = 'wikidata',
  external_id = 'Q2197655',
  last_synced_at = now()
where name = 'Q2197655'
   or external_id = 'Q2197655';

update coasters
set
  name = 'Wickie The Ride',
  last_synced_at = now()
where wikidata_id = 'Q122460556'
  and name ~* '^Q[0-9]+$';
