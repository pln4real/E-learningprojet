-- ============================================================
-- 12 - Nouveaux contenus : « Révision », « Fiche visuelle » et « Sommaire » des cours
-- Supabase -> SQL Editor -> New query -> coller -> Run
-- À lancer AVANT d'envoyer le nouveau code. Sans danger si relancé.
-- Ne modifie aucun contenu existant.
-- ============================================================

-- 1. Deux types de contenu en plus (cours, exercice, annale existent déjà)
alter table ressources drop constraint if exists ressources_type_check;
alter table ressources add constraint ressources_type_check
  check (type in ('cours', 'exercice', 'annale', 'revision', 'fiche'));

-- 2. Sommaire d'un cours : liste [{ "titre": "...", "page": 3, "niveau": 0 }], détectée dans l'admin
alter table ressources add column if not exists sommaire jsonb;
