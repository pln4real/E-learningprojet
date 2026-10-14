-- ============================================================
-- Gestion des élèves depuis l'espace admin
-- Supabase → SQL Editor → New query → coller → Run
-- (à lancer après 03 et 04 ; sans danger)
-- ============================================================

-- 1. On garde l'e-mail et une date de fin d'abonnement dans chaque profil
alter table profils add column if not exists email text;
alter table profils add column if not exists palier_jusqu_au date;  -- vide = sans date de fin

-- 2. Le profil créé à l'inscription reprend l'e-mail
create or replace function creer_profil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profils (id, nom_complet, email)
  values (new.id, new.raw_user_meta_data->>'nom_complet', new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 3. Remplit l'e-mail et le nom des comptes déjà créés
update profils p
set email = u.email,
    nom_complet = coalesce(p.nom_complet, u.raw_user_meta_data->>'nom_complet')
from auth.users u
where u.id = p.id;

-- 4. Un abonnement qui a dépassé sa date de fin repasse tout seul à « gratuit »
create or replace function mon_palier()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    when is_admin() then 'premium'
    else coalesce(
      (select case
                when palier_jusqu_au is not null and palier_jusqu_au < current_date then 'gratuit'
                else palier
              end
       from profils where id = auth.uid()),
      'gratuit')
  end;
$$;

grant execute on function mon_palier() to anon, authenticated;
