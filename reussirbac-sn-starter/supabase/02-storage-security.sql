-- ============================================================
-- Sécurité du stockage de fichiers (bucket "ressources")
-- À exécuter APRÈS 01-admin-security.sql
-- ============================================================

-- Tout le monde peut lire/télécharger les fichiers (ils sont publics,
-- c'est nécessaire pour que les élèves ouvrent les PDF)
create policy "Lecture publique des PDF" on storage.objects
  for select using (bucket_id = 'ressources');

-- Seuls les admins peuvent uploader des fichiers dans ce bucket
create policy "Seuls les admins uploadent" on storage.objects
  for insert with check (bucket_id = 'ressources' and is_admin());

-- Seuls les admins peuvent supprimer des fichiers
create policy "Seuls les admins suppriment" on storage.objects
  for delete using (bucket_id = 'ressources' and is_admin());
