-- ============================================================
-- 15b - Chapitres de Philosophie (Terminale) : le bon programme, 34 leçons
-- Supabase -> SQL Editor -> New query -> coller -> Run
-- À lancer APRÈS 15a (suppression des anciens chapitres).
-- Sans danger si relancé : ce qui existe déjà n'est jamais dupliqué, rien n'est supprimé.
--
-- Les domaines ne sont PAS des chapitres : ils servent de préfixe (« Domaine 2 - ... »).
-- Les sous-parties (I, I.1, I.2, II, ...) sont les leçons. Les chapitres sont créés VIDES :
-- ils n'apparaissent pour les élèves qu'une fois un contenu publié dedans.
-- Créés dans chaque classe « Terminale ... » qui a déjà la matière « Philosophie ».
-- ============================================================
with data(chapitre, ordre) as (values
  ('Domaine 1 - I.1 : Les origines de la philosophie', 1),
  ('Domaine 1 - I.2 : Spécificité de la philosophie', 2),
  ('Domaine 1 - II.1 : L''interrogation métaphysique', 3),
  ('Domaine 1 - II.2 : L''interrogation axiologique', 4),
  ('Domaine 1 - II.3 : L''interrogation anthropologique', 5),
  ('Domaine 1 - III.1 : Enjeux et finalités de la philosophie', 6),
  ('Domaine 1 - III.2 : Perspectives philosophiques', 7),
  ('Domaine 1 - IV.1 : L''origine du débat', 8),
  ('Domaine 1 - IV.2 : Controverses autour de l''existence d''une philosophie africaine', 9),
  ('Domaine 1 - Œuvre : L''Apologie de Socrate', 10),
  ('Domaine 1 - Méthodologie : La dissertation philosophique', 11),
  ('Domaine 2 - I.1 : L''homme et la société', 12),
  ('Domaine 2 - I.2 : Le langage et le travail', 13),
  ('Domaine 2 - II.1 : L''idée de société', 14),
  ('Domaine 2 - II.2 : Les normes sociales', 15),
  ('Domaine 2 - Œuvre : Du contrat social de Jean-Jacques Rousseau', 16),
  ('Domaine 2 - III.1 : L''idée de conscience', 17),
  ('Domaine 2 - III.2 : L''inconscience psychique', 18),
  ('Domaine 2 - III.3 : La formation de la personnalité', 19),
  ('Domaine 2 - IV.1 : Liberté, libre arbitre et responsabilité', 20),
  ('Domaine 2 - IV.2 : Liberté, déterminisme et fatalisme', 21),
  ('Domaine 2 - V.1 : Définition et origines de l''État', 22),
  ('Domaine 2 - V.2 : Formes et fonctions de l''État', 23),
  ('Domaine 2 - V.3 : État et liberté', 24),
  ('Domaine 2 - Méthodologie : Le commentaire de texte philosophique', 25),
  ('Domaine 3 - I.1 : Les premières approches du réel', 26),
  ('Domaine 3 - I.2 : Les différents types de science', 27),
  ('Domaine 3 - I.3 : Les obstacles épistémologiques', 28),
  ('Domaine 3 - II : Les différents types de science et la question de la vérité scientifique', 29),
  ('Domaine 3 - III : Science et technique', 30),
  ('Domaine 4 - I.1 : L''art et le beau', 31),
  ('Domaine 4 - I.2 : La création artistique', 32),
  ('Domaine 4 - II.1 : Les différentes formes de l''art', 33),
  ('Domaine 4 - II.2 : Les fonctions de l''art', 34)
)
insert into chapitres (nom, matiere_id, ordre)
select d.chapitre, m.id, d.ordre
from data d
join niveaux n on n.nom ilike 'Terminale%'
join matieres m on m.niveau_id = n.id and m.nom ilike 'philo%'
where not exists (
  select 1 from chapitres c where c.matiere_id = m.id and c.nom = d.chapitre
);

-- Contrôle : 34 lignes par classe, dans l'ordre du programme
select n.nom as niveau, c.ordre, c.nom as chapitre
from chapitres c
join matieres m on m.id = c.matiere_id
join niveaux n on n.id = m.niveau_id
where m.nom ilike 'philo%'
order by n.nom, c.ordre;
