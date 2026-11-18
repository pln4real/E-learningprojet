-- ============================================================
-- 17 - Terminale L2 : matières SVT, Physique et Chimie avec leurs chapitres
--   SVT : 11 leçons | Physique : 5 chapitres (P1 à P5) | Chimie : 5 chapitres (C1 à C5)
-- Supabase -> SQL Editor -> New query -> coller -> Run
-- Sans danger si relancé : ce qui existe déjà n'est jamais dupliqué.
-- Les chapitres sont créés VIDES : ils apparaissent pour les élèves dès qu'un contenu
-- est publié dedans. Les thèmes du programme ne sont pas des chapitres.
-- ============================================================

-- 1. Les trois matières
with data(matiere, ordre) as (values ('SVT', 5), ('Physique', 6), ('Chimie', 7))
insert into matieres (nom, niveau_id, ordre)
select d.matiere, n.id, d.ordre
from data d
join niveaux n on n.nom = 'Terminale L2'
where not exists (select 1 from matieres m where m.niveau_id = n.id and m.nom = d.matiere);

-- 2. Les chapitres
with data(matiere, chapitre, ordre) as (values
  ('SVT', 'Leçon 1 : Organisation de l''encéphale', 1),
  ('SVT', 'Leçon 2 : Organisation de la moelle épinière', 2),
  ('SVT', 'Leçon 3 : Régulation de la pression artérielle', 3),
  ('SVT', 'Leçon 4 : Régulation de la glycémie', 4),
  ('SVT', 'Leçon 5 : Système immunitaire', 5),
  ('SVT', 'Leçon 6 : Réponse immunitaire', 6),
  ('SVT', 'Leçon 7 : Exemple de dysfonctionnement du système immunitaire : cas de l''infection au VIH/SIDA', 7),
  ('SVT', 'Leçon 8 : Gamétogenèse', 8),
  ('SVT', 'Leçon 9 : Fécondation', 9),
  ('SVT', 'Leçon 10 : Régulation du fonctionnement des appareils reproducteurs', 10),
  ('SVT', 'Leçon 11 : Hérédité chez l''espèce humaine', 11),

  ('Physique', 'P1 : Production, transport, utilisation de l''énergie électrique', 1),
  ('Physique', 'P2 : Énergie nucléaire : réactions spontanées, fusion et fission', 2),
  ('Physique', 'P3 : Généralités sur les signaux et ondes mécaniques', 3),
  ('Physique', 'P4 : Aspect ondulatoire de la lumière', 4),
  ('Physique', 'P5 : Aspect corpusculaire de la lumière ; Dualité onde-corpuscule', 5),

  ('Chimie', 'C1 : Matières plastiques', 1),
  ('Chimie', 'C2 : Les textiles', 2),
  ('Chimie', 'C3 : Les savons', 3),
  ('Chimie', 'C4 : Les lessives, les antiseptiques et les désinfectants', 4),
  ('Chimie', 'C5 : La pollution de l''air et de l''eau', 5)
)
insert into chapitres (nom, matiere_id, ordre)
select d.chapitre, m.id, d.ordre
from data d
join niveaux n on n.nom = 'Terminale L2'
join matieres m on m.niveau_id = n.id and m.nom = d.matiere
where not exists (select 1 from chapitres c where c.matiere_id = m.id and c.nom = d.chapitre);

-- 3. Contrôle : SVT 11, Physique 5, Chimie 5
select m.nom as matiere, count(c.id) as chapitres
from niveaux n
join matieres m on m.niveau_id = n.id
left join chapitres c on c.matiere_id = m.id
where n.nom = 'Terminale L2' and m.nom in ('SVT', 'Physique', 'Chimie')
group by m.nom, m.ordre
order by m.ordre;
