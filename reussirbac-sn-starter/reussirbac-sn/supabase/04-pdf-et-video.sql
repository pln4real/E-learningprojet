-- ============================================================
-- Un contenu peut avoir un PDF ET une vidéo
-- À exécuter dans Supabase → SQL Editor → New query → Run
-- (à lancer après 03-acces-abonnements.sql ; sans danger)
-- ============================================================

-- La liste des ressources verrouillées indique maintenant si elles ont
-- un PDF et/ou une vidéo (sans jamais donner les liens).
drop function if exists ressources_verrouillees(uuid);

create or replace function ressources_verrouillees(p_chapitre uuid)
returns table (
  id uuid, type text, source text, titre text, description text,
  acces text, cree_le timestamptz, a_pdf boolean, a_video boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select r.id, r.type, r.source, r.titre, r.description, r.acces, r.cree_le,
         (r.url_fichier is not null) as a_pdf,
         (r.url_video is not null) as a_video
  from ressources r
  where r.chapitre_id = p_chapitre
    and r.statut = 'publie'
    and r.acces <> 'gratuit'
    and mon_palier() = 'gratuit'
  order by r.cree_le;
$$;

grant execute on function ressources_verrouillees(uuid) to anon, authenticated;
