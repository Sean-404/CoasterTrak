-- Wikipedia / editorial content for catalog pages (AdSense + SEO).
alter table coasters
  add column if not exists enwiki_title text,
  add column if not exists summary_text text;

create index if not exists idx_coasters_enwiki_title on coasters (enwiki_title)
  where enwiki_title is not null;
