insert into parks (name, country, latitude, longitude)
values
  ('Alton Towers', 'United Kingdom', 52.9894, -1.8919),
  ('Cedar Point', 'United States', 41.4822, -82.6835),
  ('Europa-Park', 'Germany', 48.2661, 7.7216),
  ('Fuji-Q Highland', 'Japan', 35.4869, 138.7804)
on conflict do nothing;

insert into coasters (park_id, name, coaster_type, status)
select p.id, c.name, c.coaster_type, c.status
from (
  values
    ('Alton Towers', 'Nemesis Reborn', 'Inverted', 'Operating'),
    ('Alton Towers', 'Wicker Man', 'Wood', 'Operating'),
    ('Cedar Point', 'Steel Vengeance', 'Hybrid', 'Operating'),
    ('Cedar Point', 'Millennium Force', 'Steel', 'Operating'),
    ('Europa-Park', 'Blue Fire', 'Launch', 'Operating'),
    ('Fuji-Q Highland', 'Eejanaika', '4D', 'Operating')
) as c(park_name, name, coaster_type, status)
join parks p on p.name = c.park_name
on conflict do nothing;
