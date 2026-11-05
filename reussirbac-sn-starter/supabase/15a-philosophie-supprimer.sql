-- ============================================================
-- 15a - SUPPRIMER tous les chapitres de Philosophie (mauvais programme)
-- Supabase -> SQL Editor -> New query
--
-- /!\ DÉFINITIF : en supprimant un chapitre, on supprime aussi tout ce qu'il contient
--     (cours, exercices, annales, révisions, fiches, quiz, progression des élèves).
--     Les fichiers PDF restent dans le Storage (ils ne sont plus visibles sur le site).
--
-- Lance ce script en DEUX fois :
--   1) colle et lance seulement l'ÉTAPE 1 (lecture seule) pour vérifier ce qui sera supprimé ;
--   2) si c'est bien ça, colle et lance l'ÉTAPE 2.
-- Puis lance 15b-philosophie-programme.sql pour créer les bons chapitres.
-- ============================================================


-- ===== ÉTAPE 1 : VÉRIFIER (ne supprime rien) =====
select n.nom as niveau, m.nom as matiere,
       count(distinct c.id) as chapitres,
       count(r.id) as contenus_qui_seront_supprimes
from matieres m
join niveaux n on n.id = m.niveau_id
left join chapitres c on c.matiere_id = m.id
left join ressources r on r.chapitre_id = c.id
where m.nom ilike 'philo%'
group by n.nom, m.nom
order by n.nom;


-- ===== ÉTAPE 2 : SUPPRIMER (définitif) =====
delete from chapitres
where matiere_id in (select id from matieres where nom ilike 'philo%');

-- Contrôle : doit afficher 0 chapitre
select count(*) as chapitres_philosophie_restants
from chapitres
where matiere_id in (select id from matieres where nom ilike 'philo%');
