-- =====================================================================
-- 21 : Atelier d'entraînement (sujets générés, chrono, corrigé, suivi)
-- À lancer APRÈS 10 (abonnements) et 12. Relançable sans risque.
-- =====================================================================

-- 1. Fiche d'un exercice / d'une annale (toutes les colonnes sont facultatives)
alter table ressources add column if not exists duree_min int;
alter table ressources add column if not exists bareme int;
alter table ressources add column if not exists difficulte int;
alter table ressources add column if not exists calculatrice text;
alter table ressources add column if not exists url_corrige text;
alter table ressources drop constraint if exists ressources_duree_check;
alter table ressources add constraint ressources_duree_check check (duree_min is null or duree_min between 5 and 360);
alter table ressources drop constraint if exists ressources_bareme_check;
alter table ressources add constraint ressources_bareme_check check (bareme is null or bareme between 1 and 40);
alter table ressources drop constraint if exists ressources_difficulte_check;
alter table ressources add constraint ressources_difficulte_check check (difficulte is null or difficulte between 1 and 3);
alter table ressources drop constraint if exists ressources_calculatrice_check;
alter table ressources add constraint ressources_calculatrice_check check (calculatrice is null or calculatrice in ('autorisee', 'interdite'));

-- 2. Le PDF du corrigé suit les mêmes règles d'accès que le sujet
--    (lecture : gratuit pour tous, ou inclus dans l'abonnement de l'élève)
drop policy if exists "Lecture des PDF selon les droits" on storage.objects;
create policy "Lecture des PDF selon les droits" on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'ressources'
    and (
      is_admin()
      or exists (
        select 1 from public.ressources r
        where (r.url_fichier is not null and right(r.url_fichier, length(storage.objects.name) + 1) = '/' || storage.objects.name)
           or (r.url_corrige is not null and right(r.url_corrige, length(storage.objects.name) + 1) = '/' || storage.objects.name)
      )
    )
  );

-- 3. Suivi de l'élève : auto-évaluation + note simulée, et favoris
create table if not exists atelier_evaluations (
  user_id uuid not null references auth.users(id) on delete cascade,
  ressource_id uuid not null references ressources(id) on delete cascade,
  etat text check (etat in ('reussi', 'a_revoir', 'rate')),
  note numeric(4, 1) check (note is null or note >= 0),
  bareme int,
  maj timestamptz not null default now(),
  primary key (user_id, ressource_id)
);
alter table atelier_evaluations enable row level security;
drop policy if exists "Mes evaluations" on atelier_evaluations;
create policy "Mes evaluations" on atelier_evaluations for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists atelier_favoris (
  user_id uuid not null references auth.users(id) on delete cascade,
  ressource_id uuid not null references ressources(id) on delete cascade,
  cree_le timestamptz not null default now(),
  primary key (user_id, ressource_id)
);
alter table atelier_favoris enable row level security;
drop policy if exists "Mes favoris" on atelier_favoris;
create policy "Mes favoris" on atelier_favoris for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 4. Combien de sujets sont réservés aux abonnés dans la sélection de l'élève
--    (on ne renvoie qu'un nombre, jamais de liens)
create or replace function atelier_verrouilles(p_chapitres uuid[], p_types text[])
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int
  from ressources r
  where r.chapitre_id = any (p_chapitres)
    and r.type = any (p_types)
    and r.statut = 'publie'
    and r.url_fichier is not null
    and r.acces <> 'gratuit'
    and not peut_lire_niveau(niveau_du_chapitre(r.chapitre_id));
$$;
revoke all on function atelier_verrouilles(uuid[], text[]) from public, anon;
grant execute on function atelier_verrouilles(uuid[], text[]) to authenticated;
