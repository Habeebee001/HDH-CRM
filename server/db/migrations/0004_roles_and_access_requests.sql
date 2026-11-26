--
-- Roles and account requests.
--
-- Roles:
--   admin      everything: every workspace, users, settings, workspaces
--   manager    every record of the workspaces they can open
--   sales_rep  in those workspaces, only the contacts and deals they own (and
--              the notes and tasks attached to them); companies are shared
--
-- Account requests: people can ask for an account on the sign-in page. Their
-- account stays locked (pending_approval) until an administrator approves it
-- and chooses their role and workspaces.
--

alter table public.sales
    add column role text not null default 'manager',
    add column pending_approval boolean not null default false,
    add constraint sales_role_check check (role in ('admin', 'manager', 'sales_rep'));

-- Existing users keep what they could do: administrators stay administrators,
-- everybody else could see every record, i.e. managers.
update public.sales set role = case when administrator then 'admin' else 'manager' end;

-- "administrator" is used throughout the app and by is_admin(): it follows
-- the role, and the role follows it when only "administrator" is changed.
create or replace function public.sync_sales_role() returns trigger
    language plpgsql
    set search_path to ''
    as $$
begin
  if tg_op = 'INSERT' then
    if new.administrator then
      new.role := 'admin';
    elsif new.role = 'admin' then
      new.administrator := true;
    end if;
  elsif new.role is distinct from old.role then
    new.administrator := new.role = 'admin';
  elsif new.administrator is distinct from old.administrator then
    new.role := case
      when new.administrator then 'admin'
      when old.role = 'admin' then 'manager'
      else old.role
    end;
  end if;
  return new;
end;
$$;

create trigger "00_sync_sales_role"
    before insert or update on public.sales
    for each row execute function public.sync_sales_role();

-- Pending requests are only visible to administrators
drop policy "Enable read access for authenticated users" on public.sales;
create policy "Team members are visible, pending requests to administrators" on public.sales
    for select to authenticated
    using (not pending_approval or (select public.is_admin()));

--
-- Access helpers
--

create or replace function public.current_sales_id() returns bigint
    language sql stable security definer
    set search_path to ''
    as $$
  select s.id from public.sales s where s.user_id = auth.uid();
$$;

-- Administrators and managers see every record of their workspaces
create or replace function public.sees_all_records() returns boolean
    language sql stable security definer
    set search_path to ''
    as $$
  select coalesce(
    (select s.role in ('admin', 'manager') from public.sales s where s.user_id = auth.uid()),
    false
  );
$$;

grant execute on function public.current_sales_id() to authenticated;
grant execute on function public.sees_all_records() to authenticated;

--
-- Policies: the workspace rule of 0002, plus the record rule of the role
--

do $$
declare
  t text;
  r record;
begin
  foreach t in array array['companies', 'contacts', 'contact_notes', 'deals', 'deal_notes', 'tasks'] loop
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
  end loop;
end
$$;

-- Contacts and deals: their owner, or everybody who sees all records
create policy "Read own or all" on public.contacts for select to authenticated
    using (workspace_id = (select public.current_workspace_id())
           and ((select public.sees_all_records()) or sales_id = (select public.current_sales_id())));
create policy "Create own or any" on public.contacts for insert to authenticated
    with check (workspace_id = (select public.current_workspace_id())
                and ((select public.sees_all_records()) or sales_id = (select public.current_sales_id())));
create policy "Update own or all" on public.contacts for update to authenticated
    using (workspace_id = (select public.current_workspace_id())
           and ((select public.sees_all_records()) or sales_id = (select public.current_sales_id())))
    with check (workspace_id = (select public.current_workspace_id())
                and ((select public.sees_all_records()) or sales_id = (select public.current_sales_id())));
create policy "Delete own or all" on public.contacts for delete to authenticated
    using (workspace_id = (select public.current_workspace_id())
           and ((select public.sees_all_records()) or sales_id = (select public.current_sales_id())));

create policy "Read own or all" on public.deals for select to authenticated
    using (workspace_id = (select public.current_workspace_id())
           and ((select public.sees_all_records()) or sales_id = (select public.current_sales_id())));
create policy "Create own or any" on public.deals for insert to authenticated
    with check (workspace_id = (select public.current_workspace_id())
                and ((select public.sees_all_records()) or sales_id = (select public.current_sales_id())));
create policy "Update own or all" on public.deals for update to authenticated
    using (workspace_id = (select public.current_workspace_id())
           and ((select public.sees_all_records()) or sales_id = (select public.current_sales_id())))
    with check (workspace_id = (select public.current_workspace_id())
                and ((select public.sees_all_records()) or sales_id = (select public.current_sales_id())));
create policy "Delete own or all" on public.deals for delete to authenticated
    using (workspace_id = (select public.current_workspace_id())
           and ((select public.sees_all_records()) or sales_id = (select public.current_sales_id())));

-- Companies are shared within the workspace (a sales rep's contacts and deals
-- name them); only their owner, managers and administrators change them.
create policy "Read workspace companies" on public.companies for select to authenticated
    using (workspace_id = (select public.current_workspace_id()));
create policy "Create workspace companies" on public.companies for insert to authenticated
    with check (workspace_id = (select public.current_workspace_id()));
create policy "Update own or all" on public.companies for update to authenticated
    using (workspace_id = (select public.current_workspace_id())
           and ((select public.sees_all_records()) or sales_id = (select public.current_sales_id())))
    with check (workspace_id = (select public.current_workspace_id()));
create policy "Delete own or all" on public.companies for delete to authenticated
    using (workspace_id = (select public.current_workspace_id())
           and ((select public.sees_all_records()) or sales_id = (select public.current_sales_id())));

-- Notes go with their contact or deal: the subquery applies the contacts'
-- and deals' own policies.
create policy "Notes of visible contacts" on public.contact_notes for all to authenticated
    using (workspace_id = (select public.current_workspace_id())
           and exists (select 1 from public.contacts c where c.id = contact_id))
    with check (workspace_id = (select public.current_workspace_id())
                and exists (select 1 from public.contacts c where c.id = contact_id));

create policy "Notes of visible deals" on public.deal_notes for all to authenticated
    using (workspace_id = (select public.current_workspace_id())
           and exists (select 1 from public.deals d where d.id = deal_id))
    with check (workspace_id = (select public.current_workspace_id())
                and exists (select 1 from public.deals d where d.id = deal_id));

-- Tasks: those of visible contacts, and those assigned to oneself
create policy "Tasks of visible contacts or own" on public.tasks for all to authenticated
    using (workspace_id = (select public.current_workspace_id())
           and ((select public.sees_all_records())
                or sales_id = (select public.current_sales_id())
                or exists (select 1 from public.contacts c where c.id = contact_id)))
    with check (workspace_id = (select public.current_workspace_id())
                and ((select public.sees_all_records())
                     or sales_id = (select public.current_sales_id())
                     or exists (select 1 from public.contacts c where c.id = contact_id)));

--
-- Weekly summary e-mails: one row per week sent, so a restart or a second
-- replica never sends the same week twice.
--

create table if not exists hdh_meta.weekly_summaries (
    week text primary key,
    sent_at timestamp with time zone not null default now(),
    recipients text not null
);
