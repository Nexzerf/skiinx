-- Expiry tracking for shelf products: unopened / opened / finished, when it was opened, how many
-- months it lasts once open (PAO, the "12M" jar symbol) and the printed expiry date.
alter table public.skiinx_products
  add column if not exists status      text not null default 'opened' check (status in ('unopened','opened','empty')),
  add column if not exists opened_at   date,
  add column if not exists pao_months  smallint check (pao_months between 1 and 120),
  add column if not exists expires_on  date,
  add column if not exists finished_at date;
