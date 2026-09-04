-- Relocated Wikidata QIDs often keep the previous park's retirement/demolition year.
-- That makes opening_year > closing_year and fails catalog quality (hard error).

-- Knightmare (Camelot): prior Portopialand closed 2006; UK install ran 2007–2012.
update public.coasters
set closing_year = 2012, status = 'Defunct'
where wikidata_id = 'Q13415786'
  and opening_year = 2007
  and closing_year is not null
  and closing_year < opening_year;

-- Matugani (Lost Island): prior Liseberg Kanonen closed 2016; Iowa reopen 2023.
update public.coasters
set closing_year = null, status = 'Operating'
where wikidata_id = 'Q134966734'
  and opening_year is not null
  and closing_year is not null
  and closing_year < opening_year;
