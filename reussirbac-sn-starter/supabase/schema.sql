-- ============================================================
-- Schéma de base de données — Plateforme e-learning Sénégal
-- À exécuter dans Supabase : SQL Editor → New query → coller → Run
-- ============================================================

-- Table des niveaux (3e, Terminale S2, Terminale L2...)
create table niveaux (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  ordre int not null default 0
);

-- Table des matières, rattachées à un niveau
create table matieres (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  niveau_id uuid references niveaux(id) on delete cascade,
  ordre int not null default 0
);

-- Table des chapitres, rattachés à une matière
create table chapitres (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  matiere_id uuid references matieres(id) on delete cascade,
  ordre int not null default 0
);

-- Table des ressources (cours, exercices, annales)
create table ressources (
  id uuid primary key default gen_random_uuid(),
  chapitre_id uuid references chapitres(id) on delete cascade,
  type text not null check (type in ('cours', 'exercice', 'annale')),
  titre text not null,
  description text,
  source text not null check (source in ('pdf', 'video')),
  url_fichier text,       -- chemin vers le fichier dans Supabase Storage
  url_video text,         -- lien YouTube
  statut text not null default 'brouillon' check (statut in ('brouillon', 'publie')),
  cree_le timestamptz not null default now()
);

-- Table de suivi de progression par utilisateur
create table progression_utilisateur (
  user_id uuid references auth.users(id) on delete cascade,
  ressource_id uuid references ressources(id) on delete cascade,
  vu boolean not null default true,
  vu_le timestamptz not null default now(),
  primary key (user_id, ressource_id)
);

-- ============================================================
-- Sécurité (Row Level Security) — qui peut lire/écrire quoi
-- ============================================================

alter table niveaux enable row level security;
alter table matieres enable row level security;
alter table chapitres enable row level security;
alter table ressources enable row level security;
alter table progression_utilisateur enable row level security;

-- Tout le monde (même non connecté) peut lire les niveaux/matières/chapitres
create policy "Lecture publique niveaux" on niveaux for select using (true);
create policy "Lecture publique matieres" on matieres for select using (true);
create policy "Lecture publique chapitres" on chapitres for select using (true);

-- Les ressources publiées sont visibles par tous les utilisateurs connectés
-- (les brouillons restent invisibles côté élève — à affiner plus tard avec un rôle admin)
create policy "Lecture ressources publiées" on ressources for select
  using (statut = 'publie');

-- Un utilisateur connecté peut lire/écrire SA PROPRE progression uniquement
create policy "Lecture propre progression" on progression_utilisateur for select
  using (auth.uid() = user_id);
create policy "Ecriture propre progression" on progression_utilisateur for insert
  with check (auth.uid() = user_id);

-- ============================================================
-- Données de démarrage (à adapter / compléter toi-même ensuite)
-- ============================================================

insert into niveaux (nom, ordre) values
  ('3e', 1),
  ('Terminale S2', 2),
  ('Terminale L2', 3);

-- Exemple pour Terminale S2 (reproduis ce schéma pour les autres niveaux)
insert into matieres (nom, niveau_id, ordre)
  select 'Mathématiques', id, 1 from niveaux where nom = 'Terminale S2';
insert into matieres (nom, niveau_id, ordre)
  select 'Français', id, 2 from niveaux where nom = 'Terminale S2';
insert into matieres (nom, niveau_id, ordre)
  select 'Physique-Chimie', id, 3 from niveaux where nom = 'Terminale S2';
insert into matieres (nom, niveau_id, ordre)
  select 'SVT', id, 4 from niveaux where nom = 'Terminale S2';

-- Un chapitre d'exemple avec une ressource, pour tester que tout fonctionne
insert into chapitres (nom, matiere_id, ordre)
  select 'Fonctions numériques', id, 1 from matieres
  where nom = 'Mathématiques' and niveau_id = (select id from niveaux where nom = 'Terminale S2');

insert into ressources (chapitre_id, type, titre, description, source, url_video, statut)
  select id, 'cours', 'Limites et continuité', 'Introduction aux limites de fonctions', 'video',
         'https://youtube.com/watch?v=EXEMPLE', 'publie'
  from chapitres where nom = 'Fonctions numériques';
