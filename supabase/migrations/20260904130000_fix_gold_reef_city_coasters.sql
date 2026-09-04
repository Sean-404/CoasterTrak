-- Gold Reef City catalog quality: fill sparse Wikidata rows + Operating status for Tower of Terror.

update coasters
set
  name = 'Anaconda',
  coaster_type = 'Steel',
  status = 'Operating',
  manufacturer = 'Vekoma',
  height_ft = 112,
  speed_mph = 56,
  length_ft = 2448,
  inversions = 5,
  duration_s = 100,
  last_synced_at = now()
where wikidata_id = 'Q483513';

update coasters
set
  name = 'Golden Loop',
  coaster_type = 'Steel',
  status = 'Operating',
  manufacturer = 'Schwarzkopf',
  height_ft = 138,
  speed_mph = 57,
  length_ft = 863,
  inversions = 1,
  duration_s = 30,
  last_synced_at = now()
where wikidata_id = 'Q28649619';

update coasters
set
  name = 'Tower of Terror',
  coaster_type = 'Steel',
  status = 'Operating',
  manufacturer = coalesce(nullif(trim(manufacturer), ''), 'Intamin'),
  height_ft = coalesce(height_ft, 112),
  speed_mph = coalesce(speed_mph, 59),
  inversions = coalesce(inversions, 0),
  duration_s = coalesce(duration_s, 28),
  last_synced_at = now()
where wikidata_id = 'Q2446903';
