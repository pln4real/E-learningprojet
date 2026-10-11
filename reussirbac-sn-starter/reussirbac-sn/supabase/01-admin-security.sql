-- ============================================================
-- Sécurité Admin — à exécuter APRÈS schema.sql
-- Supabase → SQL Editor → New query → coller → Run
-- ============================================================

-- Table qui liste les utilisateurs autorisés à administrer le contenu.
-- Pour l'instant : juste toi. Plus tard, tu pourras y ajouter d'autres
-- enseignants/contributeurs en insérant une ligne de plus.
create table admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ajoute_le timestamptz not null default now()
);

alter table admins enable row level security;

-- Un utilisateur connecté peut seulement vérifier S'IL est admin lui-même
-- (pas la liste complète des autres admins)
create policy "Chacun peut vérifier son propre statut admin" on admins
  for select using (auth.uid() = user_id);

-- Petite fonction utilitaire : "l'utilisateur connecté est-il admin ?"
-- Réutilisée dans toutes les policies ci-dessous.
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from admins where user_id = auth.uid()
  );
$$;

-- ---- Mise à jour des policies existantes pour n'autoriser QUE les admins ----

-- Chapitres : tout le monde peut lire, seuls les admins peuvent créer/modifier
create policy "Admins peuvent créer des chapitres" on chapitres
  for insert with check (is_admin());
create policy "Admins peuvent modifier des chapitres" on chapitres
  for update using (is_admin());
create policy "Admins peuvent supprimer des chapitres" on chapitres
  for delete using (is_admin());

-- Ressources : les admins peuvent tout créer/modifier, et voir aussi
-- les brouillons (pas seulement les publiées comme les élèves)
create policy "Admins peuvent créer des ressources" on ressources
  for insert with check (is_admin());
create policy "Admins peuvent modifier des ressources" on ressources
  for update using (is_admin());
create policy "Admins peuvent supprimer des ressources" on ressources
  for delete using (is_admin());
create policy "Admins voient aussi les brouillons" on ressources
  for select using (is_admin());

-- ============================================================
-- IMPORTANT — dernière étape manuelle, à faire une fois connecté :
-- ============================================================
-- 1. Connecte-toi une première fois sur ton site via /login (par e-mail,
--    c'est plus simple pour toi en tant qu'admin).
-- 2. Dans Supabase → Authentication → Users, trouve ton compte et copie
--    son "User UID" (une longue chaîne).
-- 3. Reviens ici dans SQL Editor, lance cette requête en remplaçant
--    TON_USER_UID par la valeur copiée :
--
--    insert into admins (user_id) values ('TON_USER_UID');
--
-- C'est cette ligne qui fait de toi un admin. Tant qu'elle n'existe pas,
-- personne (même toi) ne peut ajouter de contenu.
