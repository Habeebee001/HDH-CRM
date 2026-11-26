-- Local testing only (needs a superuser): the service_role used by Atomic
-- CRM's Playwright fixtures to reset and seed the database. Never run on Neon.
do $$
begin
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;
grant service_role to authenticator;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
-- Column types (citext) and trigger helpers (auth.uid) live in these schemas.
grant usage on schema extensions to service_role;
grant usage on schema auth to service_role;
grant execute on function auth.uid() to service_role;
