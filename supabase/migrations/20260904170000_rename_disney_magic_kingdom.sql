-- Align WDW Magic Kingdom with Disney's Animal Kingdom / Hollywood Studios naming.
update public.parks
set name = 'Disney''s Magic Kingdom'
where name = 'Magic Kingdom'
  and country = 'United States';
