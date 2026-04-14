-- Enforce globally unique public display names (case-insensitive).
-- Allows null for users who have not set a display name yet.

create unique index if not exists profiles_display_name_lower_uidx
  on profiles (lower(display_name))
  where display_name is not null;
