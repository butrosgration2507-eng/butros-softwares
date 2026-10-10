-- BUTROS SOFTWARES initial schema

create table admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  display_name text,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  admin_id uuid not null references admins(id) on delete cascade,
  csrf_token text not null,
  oauth_state text,
  oauth_state_expires_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_admin_idx on sessions(admin_id);
create index sessions_expires_idx on sessions(expires_at);

create table categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Small images only (icons, screenshots). Installers are NEVER stored here.
create table media (
  id uuid primary key default gen_random_uuid(),
  mime text not null check (mime in ('image/png','image/jpeg','image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 2097152),
  data bytea not null,
  created_at timestamptz not null default now()
);

create table drive_accounts (
  id uuid primary key default gen_random_uuid(),
  google_email text not null unique,
  friendly_name text,
  status text not null default 'connected' check (status in ('connected','needs_reauth','disconnected')),
  encrypted_refresh_token text,
  is_default boolean not null default false,
  quota_limit_bytes bigint,
  quota_used_bytes bigint,
  quota_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index drive_accounts_single_default on drive_accounts(is_default) where is_default;

create table software (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  short_description text not null,
  description text not null default '',
  publisher text,
  publisher_url text,
  category_id uuid references categories(id) on delete set null,
  operating_systems text[] not null default '{}',
  system_requirements text,
  installation_instructions text,
  version text not null default '1.0.0',
  release_date date,
  size_bytes bigint,
  icon_media_id uuid references media(id) on delete set null,
  screenshot_media_ids uuid[] not null default '{}',
  download_source text not null default 'self' check (download_source in ('self','publisher','third_party')),
  download_source_note text,
  redistribution_confirmed boolean not null default false,
  featured boolean not null default false,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index software_status_idx on software(status);
create index software_category_idx on software(category_id);
create index software_created_idx on software(created_at desc);

create table software_versions (
  id uuid primary key default gen_random_uuid(),
  software_id uuid not null references software(id) on delete cascade,
  version text not null,
  release_date date,
  changelog text,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  unique (software_id, version)
);

create table software_files (
  id uuid primary key default gen_random_uuid(),
  software_id uuid not null references software(id) on delete cascade,
  version_id uuid references software_versions(id) on delete set null,
  drive_account_id uuid not null references drive_accounts(id) on delete restrict,
  drive_file_id text not null,
  label text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  md5 text,
  sha256 text,
  operating_system text,
  is_public boolean not null default false,
  availability text not null default 'unknown' check (availability in ('unknown','available','missing','quota','forbidden')),
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (drive_account_id, drive_file_id)
);
create index software_files_software_idx on software_files(software_id);

-- One row each time the site hands a visitor a working download link.
-- Google does not tell us when a download finishes, so this counts STARTED downloads only.
create table download_events (
  id uuid primary key default gen_random_uuid(),
  software_id uuid not null references software(id) on delete cascade,
  file_id uuid references software_files(id) on delete set null,
  created_at timestamptz not null default now()
);
create index download_events_software_idx on download_events(software_id);
create index download_events_created_idx on download_events(created_at desc);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references admins(id) on delete set null,
  admin_email text,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on audit_logs(created_at desc);

create table site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
