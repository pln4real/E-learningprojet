-- ============================================================
-- 16 - Séparer les matières
--   • Terminale S2 : « Physique-Chimie » devient « Physique » (la Chimie a sa propre matière, script 13)
--   • Terminale S2 et L2 : « Histoire-Géographie » devient « Histoire », et les leçons de
--     géographie passent dans une NOUVELLE matière « Géographie »
-- Supabase -> SQL Editor -> New query -> coller -> Run
--
-- Rien n'est supprimé : les chapitres sont DÉPLACÉS, donc tous les cours, exercices,
-- quiz et fichiers déjà publiés sont conservés. Sans danger si relancé.
-- Les préfixes « Histoire - » et « Géographie - » des noms de chapitres sont retirés
-- (la matière suffit désormais).
-- ============================================================

-- 1. Terminale S2 : Physique-Chimie -> Physique
update matieres m
set nom = 'Physique'
from niveaux n
where m.niveau_id = n.id and n.nom = 'Terminale S2' and m.nom = 'Physique-Chimie'
  and not exists (select 1 from matieres x where x.niveau_id = n.id and x.nom = 'Physique');

-- 2. Histoire-Géographie -> Histoire (S2 et L2)
update matieres m
set nom = 'Histoire'
from niveaux n
where m.niveau_id = n.id and n.nom in ('Terminale S2', 'Terminale L2') and m.nom = 'Histoire-Géographie'
  and not exists (select 1 from matieres x where x.niveau_id = n.id and x.nom = 'Histoire');

-- 3. Nouvelle matière « Géographie » (à côté d'Histoire)
insert into matieres (nom, niveau_id, ordre)
select 'Géographie', n.id, case n.nom when 'Terminale S2' then 7 else 4 end
from niveaux n
where n.nom in ('Terminale S2', 'Terminale L2')
  and exists (select 1 from matieres h where h.niveau_id = n.id and h.nom = 'Histoire')
  and not exists (select 1 from matieres g where g.niveau_id = n.id and g.nom = 'Géographie');

-- 4. Les leçons de géographie quittent « Histoire » pour « Géographie » (numérotées à partir de 1)
update chapitres c
set matiere_id = g.id,
    nom = regexp_replace(c.nom, '^Géographie - ', ''),
    ordre = c.ordre - 12
from matieres h
join matieres g on g.niveau_id = h.niveau_id and g.nom = 'Géographie'
where h.nom = 'Histoire' and c.matiere_id = h.id and c.nom like 'Géographie - %';

-- 5. Les chapitres d'histoire perdent leur préfixe « Histoire - »
update chapitres c
set nom = regexp_replace(c.nom, '^Histoire - ', '')
from matieres h
where h.nom = 'Histoire' and c.matiere_id = h.id and c.nom like 'Histoire - %';

-- 6. Contrôle
select n.nom as niveau, m.nom as matiere, count(c.id) as chapitres
from niveaux n
join matieres m on m.niveau_id = n.id
left join chapitres c on c.matiere_id = m.id
where n.nom in ('Terminale S2', 'Terminale L2')
group by n.nom, n.ordre, m.nom, m.ordre
order by n.ordre, m.ordre;
