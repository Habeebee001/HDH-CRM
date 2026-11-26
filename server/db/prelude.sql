--
-- HDH CRM on Neon: platform objects that Supabase used to provide.
--
-- Supabase ships an `auth` schema (GoTrue), a `storage` schema, the
-- `anon` / `authenticated` roles and an `extensions` schema. Neon is plain
-- Postgres, so this file creates the minimal equivalents the CRM schema
-- relies on. The HDH CRM server (server/) owns the auth and storage logic.
--

-- Roles used by PostgREST: it logs in as `authenticator`, then switches to
-- `anon` (no JWT) or `authenticated` (valid JWT) for each request.
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticator') then
    -- The server sets its password at startup (see server/postgrest.ts).
    create role authenticator login noinherit;
  end if;
end
$$;

grant anon to authenticator;
grant authenticated to authenticator;

-- Extensions live in their own schema, like on Supabase.
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated;
create extension if not exists citext with schema extensions;

--
-- auth: users, sessions and one-time tokens (invites, password resets)
--
create schema if not exists auth;
grant usage on schema auth to anon, authenticated;

create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email extensions.citext not null unique,
    encrypted_password text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    raw_app_meta_data jsonb not null default '{"provider": "email", "providers": ["email"]}'::jsonb,
    is_sso_user boolean not null default false,
    banned_until timestamp with time zone,
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now()
);

create table auth.sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    user_agent text,
    ip text,
    created_at timestamp with time zone not null default now(),
    refreshed_at timestamp with time zone not null default now()
);
create index sessions_user_id_idx on auth.sessions using btree (user_id);

create table auth.refresh_tokens (
    id bigint generated always as identity primary key,
    token_hash text not null unique,
    session_id uuid not null references auth.sessions(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone not null default now()
);
create index refresh_tokens_session_id_idx on auth.refresh_tokens using btree (session_id);

create table auth.one_time_tokens (
    token_hash text primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    token_type text not null check (token_type in ('invite', 'recovery')),
    expires_at timestamp with time zone not null,
    used_at timestamp with time zone,
    created_at timestamp with time zone not null default now()
);
create index one_time_tokens_user_id_idx on auth.one_time_tokens using btree (user_id);

-- Server settings generated on first start (e.g. the JWT signing secret when
-- JWT_SECRET is not set). Only the database owner can read it.
create table auth.settings (
    key text primary key,
    value text not null,
    created_at timestamp with time zone not null default now()
);

revoke all on all tables in schema auth from public, anon, authenticated;

-- Same helpers as Supabase: PostgREST exposes the verified JWT claims as the
-- request.jwt.claims setting, and policies use auth.uid() to read the user.
create or replace function auth.uid() returns uuid
    language sql stable
    as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid
$$;

create or replace function auth.role() returns text
    language sql stable
    as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create or replace function auth.jwt() returns jsonb
    language sql stable
    as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

grant execute on function auth.uid() to anon, authenticated;
grant execute on function auth.role() to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;

--
-- storage: uploaded files (avatars, logos, note attachments), kept in
-- Postgres so the app needs no extra storage service. Only the server reads
-- and writes this schema.
--
create schema if not exists storage;

create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null,
    name text not null,
    owner uuid,
    mime_type text,
    size bigint not null,
    content bytea not null,
    created_at timestamp with time zone not null default now(),
    constraint objects_bucket_id_name_key unique (bucket_id, name)
);

revoke all on schema storage from public;
revoke all on all tables in schema storage from public, anon, authenticated;
