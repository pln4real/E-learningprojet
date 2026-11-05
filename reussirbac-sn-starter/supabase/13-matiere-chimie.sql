-- ============================================================
-- Ajout de la matière « Chimie » (Terminale S2) et de ses 9 leçons
-- Supabase → SQL Editor → New query → coller → Run
-- Sans danger si relancé : ce qui existe déjà n'est jamais dupliqué.
-- Les chapitres sont créés VIDES : ils apparaissent sur le site
-- dès que tu y publies un contenu (Admin → Ajouter).
-- ============================================================

-- 1. La matière « Chimie » dans Terminale S2
insert into matieres (nom, niveau_id, ordre)
select 'Chimie', n.id, 6
from niveaux n
where n.nom = 'Terminale S2'
  and not exists (
    select 1 from matieres m where m.niveau_id = n.id and m.nom = 'Chimie'
  );

-- 2. Les 9 leçons
with data(chapitre, ordre) as (values
  ('Leçon 1 : Les alcools', 1),
  ('Leçon 2 : Les amines', 2),
  ('Leçon 3 : Les acides carboxyliques et leurs dérivés', 3),
  ('Leçon 4 : Cinétique chimique', 4),
  ('Leçon 5 : Produit ionique de l''eau, pH, indicateurs colorés', 5),
  ('Leçon 6 : Acides forts et bases fortes', 6),
  ('Leçon 7 : Acides faibles et bases faibles', 7),
  ('Leçon 8 : Réactions acide faible / base forte et solution tampon', 8),
  ('Leçon 9 : Les acides α-aminés', 9)
)
insert into chapitres (nom, matiere_id, ordre)
select d.chapitre, m.id, d.ordre
from data d
join niveaux n on n.nom = 'Terminale S2'
join matieres m on m.niveau_id = n.id and m.nom = 'Chimie'
where not exists (
  select 1 from chapitres c where c.matiere_id = m.id and c.nom = d.chapitre
);

-- 3. Contrôle : doit afficher 9 lignes
select n.nom as niveau, m.nom as matiere, c.ordre, c.nom as chapitre
from chapitres c
join matieres m on m.id = c.matiere_id
join niveaux n on n.id = m.niveau_id
where m.nom = 'Chimie'
order by n.nom, c.ordre;
