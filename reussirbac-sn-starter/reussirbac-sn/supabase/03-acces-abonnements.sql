-- ============================================================
-- Accès gratuit / abonné + palier de chaque élève
-- À exécuter AVANT d'envoyer la nouvelle version du site sur GitHub.
-- Supabase → SQL Editor → New query → coller → Run
-- (sans danger : l'ancienne version du site continue de fonctionner)
-- ============================================================

-- 1. Chaque ressource est « gratuit » (tout le monde) ou « abonne » (abonnés seulement)
alter table ressources
  add column if not exists acces text not null default 'gratuit'
  check (acces in ('gratuit', 'abonne'));

-- 2. Un profil par élève, avec son palier : gratuit, abonne ou premium
create table if not exists profils (
  id uuid primary key references auth.users(id) on delete cascade,
  nom_complet text,
  palier text not null default 'gratuit' check (palier in ('gratuit', 'abonne', 'premium')),
  cree_le timestamptz not null default now()
);

alter table profils enable row level security;

-- Chaque élève lit son propre profil. Personne ne peut modifier son palier
-- lui-même : seuls les admins le peuvent (et plus tard, le paiement).
create policy "Chacun lit son profil" on profils for select using (auth.uid() = id);
create policy "Admins lisent les profils" on profils for select using (is_admin());
create policy "Admins modifient les profils" on profils for update using (is_admin());

-- 3. Création automatique du profil à chaque inscription
create or replace function creer_profil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profils (id, nom_complet)
  values (new.id, new.raw_user_meta_data->>'nom_complet')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists a_la_creation_utilisateur on auth.users;
create trigger a_la_creation_utilisateur
  after insert on auth.users
  for each row execute function creer_profil();

-- Profils pour les comptes déjà créés (toi, tes tests)
insert into profils (id, nom_complet)
select id, raw_user_meta_data->>'nom_complet' from auth.users
on conflict (id) do nothing;

-- 4. « Quel est mon palier ? » (les admins comptent comme premium)
create or replace function mon_palier()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    when is_admin() then 'premium'
    else coalesce((select palier from profils where id = auth.uid()), 'gratuit')
  end;
$$;

-- 5. Qui peut lire quoi : une ressource publiée est lisible si elle est gratuite
--    ou si l'élève est abonné/premium. Les liens des fichiers payants ne sont
--    donc JAMAIS envoyés aux élèves non abonnés.
drop policy if exists "Lecture ressources publiées" on ressources;
create policy "Lecture ressources selon accès" on ressources for select
  using (statut = 'publie' and (acces = 'gratuit' or mon_palier() in ('abonne', 'premium')));
-- (la policy « Admins voient aussi les brouillons » reste en place)

-- 6. Liste des ressources verrouillées SANS leurs liens, pour afficher
--    un cadenas aux élèves non abonnés.
create or replace function ressources_verrouillees(p_chapitre uuid)
returns table (id uuid, type text, source text, titre text, description text, acces text, cree_le timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select r.id, r.type, r.source, r.titre, r.description, r.acces, r.cree_le
  from ressources r
  where r.chapitre_id = p_chapitre
    and r.statut = 'publie'
    and r.acces <> 'gratuit'
    and mon_palier() = 'gratuit'
  order by r.cree_le;
$$;

grant execute on function mon_palier() to anon, authenticated;
grant execute on function ressources_verrouillees(uuid) to anon, authenticated;

-- ============================================================
-- POUR DONNER UN PALIER À UN ÉLÈVE (en attendant le paiement) :
--   update profils set palier = 'abonne'
--   where id = (select id from auth.users where email = 'eleve@exemple.com');
-- Valeurs possibles : 'gratuit', 'abonne', 'premium'
-- (premium = abonné + bouton « Télécharger »)
-- ============================================================
