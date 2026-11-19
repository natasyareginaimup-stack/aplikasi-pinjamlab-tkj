begin;

create or replace function public.handle_new_pinjam_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    case
      when lower(new.email) = 'adminpinjamlab@gmail.com'
        and new.raw_user_meta_data ->> 'requested_role' = 'admin'
      then 'admin'
      else 'user'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

grant select on public.alat to anon;
drop policy if exists "alat public read" on public.alat;
create policy "alat public read" on public.alat
  for select to anon using (true);

drop policy if exists "peminjaman update own or admin" on public.peminjaman;
drop policy if exists "peminjaman update admin only" on public.peminjaman;
create policy "peminjaman update admin only" on public.peminjaman
  for update to authenticated
  using ((select public.is_pinjam_admin()))
  with check ((select public.is_pinjam_admin()));

drop policy if exists "peminjaman delete own or admin" on public.peminjaman;
drop policy if exists "peminjaman delete admin only" on public.peminjaman;
create policy "peminjaman delete admin only" on public.peminjaman
  for delete to authenticated
  using ((select public.is_pinjam_admin()));

create or replace function public.pinjamlab_active_loan_counts()
returns table(alat_id uuid, jumlah bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.alat_id, count(*) as jumlah
  from public.peminjaman p
  where p.status = 'Dipinjam'
  group by p.alat_id;
$$;
revoke all on function public.pinjamlab_active_loan_counts() from public;
grant execute on function public.pinjamlab_active_loan_counts() to anon, authenticated;

create or replace function public.enforce_pinjam_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  available_stock integer;
  current_active bigint;
begin
  if tg_op = 'INSERT' and new.status <> 'Dipinjam' then
    raise exception 'Peminjaman baru harus berstatus Dipinjam';
  end if;

  if new.status = 'Dipinjam' then
    perform pg_advisory_xact_lock(hashtextextended(new.alat_id::text, 0));
    select a.stok into available_stock
    from public.alat a
    where a.id = new.alat_id;
    if not found then
      raise exception 'Alat tidak ditemukan';
    end if;

    select count(*) into current_active
    from public.peminjaman p
    where p.alat_id = new.alat_id
      and p.status = 'Dipinjam'
      and (tg_op = 'INSERT' or p.id is distinct from new.id);
    if current_active >= available_stock then
      raise exception 'Stok alat ini sedang habis dipinjam';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_pinjam_stock_before_write on public.peminjaman;
create trigger enforce_pinjam_stock_before_write
  before insert or update of alat_id, status on public.peminjaman
  for each row execute function public.enforce_pinjam_stock();

drop policy if exists "peminjaman insert own" on public.peminjaman;
drop policy if exists "peminjaman insert own active" on public.peminjaman;
create policy "peminjaman insert own active" on public.peminjaman
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'Dipinjam');

commit;
