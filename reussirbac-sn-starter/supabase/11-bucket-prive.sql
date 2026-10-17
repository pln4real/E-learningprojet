-- ============================================================
-- 11 - PDF PRIVÉS (liens temporaires) - À lancer APRÈS 10 ET après le déploiement du code
-- Supabase -> SQL Editor -> New query -> coller -> Run
--
-- Après ce script, les PDF ne s'ouvrent plus par leur adresse publique : le site demande
-- un lien temporaire (1 heure), que Supabase n'accorde que si l'élève a le droit de lire
-- la ressource (gratuite, ou incluse dans son abonnement).
-- Pour revenir en arrière : voir la dernière ligne.
-- ============================================================
update storage.buckets set public = false where id = 'ressources';

drop policy if exists "Lecture publique des PDF" on storage.objects;
drop policy if exists "Lecture des PDF selon les droits" on storage.objects;
create policy "Lecture des PDF selon les droits" on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'ressources'
    and (
      is_admin()
      or exists (
        -- cette sous-requête est filtrée par les règles d'accès des ressources
        select 1 from public.ressources r
        where r.url_fichier is not null
          and right(r.url_fichier, length(storage.objects.name) + 1) = '/' || storage.objects.name
      )
    )
  );

-- Retour en arrière (si besoin) :
--   update storage.buckets set public = true where id = 'ressources';
