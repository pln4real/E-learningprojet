-- ============================================================
-- 14 - BIBLIOTHÈQUE (fascicules, livres, méthodes, orientation)
-- Supabase -> SQL Editor -> New query -> coller -> Run
-- À lancer AVANT de déployer le code de la bibliothèque. Sans danger si relancé.
--
-- Principe : les fichiers sont dans un bucket PRIVÉ « bibliotheque ». Le site demande
-- un lien temporaire (2 minutes) que Supabase n'accorde que si l'élève est connecté
-- et a le droit de lire le document (gratuit, ou abonné actif).
-- ============================================================

-- 1. Les documents
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  auteur text,
  description text,
  categorie text not null default 'fascicule'
    check (categorie in ('fascicule', 'livre', 'methode', 'orientation')),
  niveau_id uuid references niveaux(id) on delete set null,   -- vide = toutes les classes
  chemin_fichier text not null,        -- chemin dans le bucket « bibliotheque »
  chemin_couverture text,
  pages int,
  acces text not null default 'abonne' check (acces in ('gratuit', 'abonne')),
  statut text not null default 'brouillon' check (statut in ('brouillon', 'publie')),
  droits_confirmes boolean not null default false,   -- l'admin certifie avoir le droit de diffuser
  cree_le timestamptz not null default now()
);

-- 2. Favoris et progression de lecture (chaque élève ne voit que les siens)
create table if not exists favoris_documents (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  cree_le timestamptz not null default now(),
  primary key (user_id, document_id)
);
create table if not exists lecture_documents (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  page int not null default 1,
  maj_le timestamptz not null default now(),
  primary key (user_id, document_id)
);

alter table documents enable row level security;
alter table favoris_documents enable row level security;
alter table lecture_documents enable row level security;

grant select, insert, update, delete on documents to authenticated;
grant select, insert, delete on favoris_documents to authenticated;
grant select, insert, update on lecture_documents to authenticated;

-- 3. Qui peut faire quoi
drop policy if exists "Voir les documents publiés" on documents;
create policy "Voir les documents publiés" on documents for select
  to authenticated using (statut = 'publie' or is_admin());
drop policy if exists "Admins ajoutent des documents" on documents;
create policy "Admins ajoutent des documents" on documents for insert
  to authenticated with check (is_admin() and droits_confirmes);
drop policy if exists "Admins modifient les documents" on documents;
create policy "Admins modifient les documents" on documents for update
  to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "Admins suppriment les documents" on documents;
create policy "Admins suppriment les documents" on documents for delete
  to authenticated using (is_admin());

drop policy if exists "Mes favoris" on favoris_documents;
create policy "Mes favoris" on favoris_documents for select
  to authenticated using (user_id = auth.uid() or is_admin());   -- l'admin voit les totaux
drop policy if exists "Ajouter un favori" on favoris_documents;
create policy "Ajouter un favori" on favoris_documents for insert
  to authenticated with check (user_id = auth.uid());
drop policy if exists "Retirer un favori" on favoris_documents;
create policy "Retirer un favori" on favoris_documents for delete
  to authenticated using (user_id = auth.uid());

drop policy if exists "Ma lecture" on lecture_documents;
create policy "Ma lecture" on lecture_documents for select
  to authenticated using (user_id = auth.uid());
drop policy if exists "Enregistrer ma page" on lecture_documents;
create policy "Enregistrer ma page" on lecture_documents for insert
  to authenticated with check (user_id = auth.uid());
drop policy if exists "Mettre à jour ma page" on lecture_documents;
create policy "Mettre à jour ma page" on lecture_documents for update
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 4. Le bucket privé et ses règles d'accès
insert into storage.buckets (id, name, public)
values ('bibliotheque', 'bibliotheque', false)
on conflict (id) do update set public = false;

drop policy if exists "Bibliotheque : admins ajoutent" on storage.objects;
create policy "Bibliotheque : admins ajoutent" on storage.objects for insert
  to authenticated with check (bucket_id = 'bibliotheque' and is_admin());
drop policy if exists "Bibliotheque : admins suppriment" on storage.objects;
create policy "Bibliotheque : admins suppriment" on storage.objects for delete
  to authenticated using (bucket_id = 'bibliotheque' and is_admin());

drop policy if exists "Bibliotheque : lecture selon les droits" on storage.objects;
create policy "Bibliotheque : lecture selon les droits" on storage.objects for select
  to authenticated
  using (
    bucket_id = 'bibliotheque'
    and (
      is_admin()
      or exists (
        select 1 from public.documents d
        where d.statut = 'publie'
          and (
            d.chemin_couverture = storage.objects.name           -- couverture : visible par tout élève connecté
            or (d.chemin_fichier = storage.objects.name           -- PDF : gratuit ou abonnement actif
                and (d.acces = 'gratuit' or public.peut_lire_niveau(null)))
          )
      )
    )
  );

-- Contrôle : doit afficher la table « documents » et le bucket « bibliotheque »
select 'documents' as element, count(*)::text as valeur from documents
union all
select 'bucket bibliotheque (public = false attendu)', public::text from storage.buckets where id = 'bibliotheque';
