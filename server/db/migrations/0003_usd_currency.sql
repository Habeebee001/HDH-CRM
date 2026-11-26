--
-- Amounts are shown in US dollars.
--
-- The deal amounts entered until now were in naira: they are converted once,
-- at 1 USD = 1,550 NGN, and rounded to whole dollars (amount is a bigint).
--

update public.deals
set amount = round(amount / 1550.0)
where amount is not null;

-- The app reads its settings from this row: saving the currency here makes
-- every browser switch to dollars, whatever it had cached.
insert into public.configuration (id, config)
values (1, '{"currency": "USD"}'::jsonb)
on conflict (id) do update
set config = public.configuration.config || '{"currency": "USD"}'::jsonb;
