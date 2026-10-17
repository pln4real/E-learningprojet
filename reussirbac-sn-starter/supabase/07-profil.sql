-- ============================================================
-- Profil élève : modifier son propre nom (et rien d'autre)
-- Supabase → SQL Editor → New query → coller → Run
-- ============================================================
create or replace function modifier_mon_nom(p_nom text)
returns void
language sql
security definer
set search_path = public
as $$
  update profils set nom_complet = left(trim(p_nom), 80) where id = auth.uid();
$$;
grant execute on function modifier_mon_nom(text) to authenticated;
