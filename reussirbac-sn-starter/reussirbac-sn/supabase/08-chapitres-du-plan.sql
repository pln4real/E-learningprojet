-- ============================================================
-- Création de tous les chapitres du plan de contenu (Terminale S2 et L2)
-- Supabase → SQL Editor → New query → coller → Run
-- Sans danger si relancé : ce qui existe déjà n'est jamais dupliqué.
-- Les chapitres sont créés VIDES : ils n'apparaissent sur le site
-- qu'à partir du moment où tu y publies une ressource.
-- ============================================================

-- 1. Niveaux
insert into niveaux (nom, ordre) values
  ('Terminale S2', 2),
  ('Terminale L2', 3)
on conflict (nom) do nothing;

-- 2. Matières (créées seulement si elles n'existent pas déjà dans ce niveau)
with data(niveau, matiere, ordre) as (values
  ('Terminale S2', 'Mathématiques', 1),
  ('Terminale S2', 'Physique-Chimie', 3),
  ('Terminale S2', 'SVT', 4),
  ('Terminale S2', 'Histoire-Géographie', 5),
  ('Terminale L2', 'Philosophie', 1),
  ('Terminale L2', 'Français', 2),
  ('Terminale L2', 'Histoire-Géographie', 3)
)
insert into matieres (nom, niveau_id, ordre)
select d.matiere, n.id, d.ordre
from data d
join niveaux n on n.nom = d.niveau
where not exists (
  select 1 from matieres m where m.niveau_id = n.id and m.nom = d.matiere
);

-- 3. Chapitres (142)
with data(niveau, matiere, chapitre, ordre) as (values
  ('Terminale S2', 'Mathématiques', 'Rappels', 1),
  ('Terminale S2', 'Mathématiques', 'Limite - Continuité - Dérivation', 2),
  ('Terminale S2', 'Mathématiques', 'Généralités sur les fonctions', 3),
  ('Terminale S2', 'Mathématiques', 'Fonctions Logarithme népérien et exponentielle', 4),
  ('Terminale S2', 'Mathématiques', 'Nombres complexes - Similitudes directes', 5),
  ('Terminale S2', 'Mathématiques', 'Suites numériques', 6),
  ('Terminale S2', 'Mathématiques', 'Primitives. Calcul intégral. Équations différentielles', 7),
  ('Terminale S2', 'Mathématiques', 'Dénombrement - Probabilité', 8),
  ('Terminale S2', 'Mathématiques', 'Série statistique double', 9),
  ('Terminale S2', 'Mathématiques', 'Problèmes d''entraînement type de Bac', 10),
  ('Terminale S2', 'Mathématiques', 'Sujets type de Bac', 11),
  ('Terminale S2', 'Mathématiques', 'Corrigé des exercices d''application', 12),
  ('Terminale S2', 'Physique-Chimie', 'Mécanique - Mouvement d''un point matériel', 1),
  ('Terminale S2', 'Physique-Chimie', 'Mécanique - Relation Fondamentale de la Dynamique (RFD)', 2),
  ('Terminale S2', 'Physique-Chimie', 'Mécanique - Étude Énergétique d''un Système Mécanique', 3),
  ('Terminale S2', 'Physique-Chimie', 'Mécanique - Champ de Pesanteur et champ Gravitationnel', 4),
  ('Terminale S2', 'Physique-Chimie', 'Mécanique - Oscillateurs Mécaniques', 5),
  ('Terminale S2', 'Physique-Chimie', 'Mécanique - Particules à Grande énergie', 6),
  ('Terminale S2', 'Physique-Chimie', 'Électromagnétisme - Champ Électrostatique uniforme', 7),
  ('Terminale S2', 'Physique-Chimie', 'Électromagnétisme - Champ magnétique uniforme', 8),
  ('Terminale S2', 'Physique-Chimie', 'Électromagnétisme - Loi de Laplace', 9),
  ('Terminale S2', 'Physique-Chimie', 'Électromagnétisme - Induction Électromagnétique', 10),
  ('Terminale S2', 'Physique-Chimie', 'Électromagnétisme - Auto Induction', 11),
  ('Terminale S2', 'Physique-Chimie', 'Électricité - Dipôle (R,L)', 12),
  ('Terminale S2', 'Physique-Chimie', 'Électricité - Dipôle (R,C)', 13),
  ('Terminale S2', 'Physique-Chimie', 'Électricité - Oscillation électrique (Circuit (L,C))', 14),
  ('Terminale S2', 'Physique-Chimie', 'Électricité - Circuit (R,L,C) en régime sinusoïdal forcé', 15),
  ('Terminale S2', 'SVT', 'Thème 1 : Organisation du système nerveux cérébro-spinal des mammifères', 1),
  ('Terminale S2', 'SVT', 'Thème 2 : Tissu nerveux et ses propriétés', 2),
  ('Terminale S2', 'SVT', 'Thème 3 : Rôle du système nerveux dans le comportement moteur d''un animal', 3),
  ('Terminale S2', 'SVT', 'Thème 4 : Activité du muscle strié squelettique', 4),
  ('Terminale S2', 'SVT', 'Thème 5 : Activité cardiaque et régulation de la pression artérielle', 5),
  ('Terminale S2', 'SVT', 'Thème 6 : Milieu intérieur', 6),
  ('Terminale S2', 'SVT', 'Thème 7 : Régulation de la glycémie', 7),
  ('Terminale S2', 'SVT', 'Thème 8 : Immunologie', 8),
  ('Terminale S2', 'SVT', 'Thème 9 : Reproduction chez les mammifères', 9),
  ('Terminale S2', 'SVT', 'Thème 10 : Reproduction chez les spermaphytes', 10),
  ('Terminale S2', 'SVT', 'Thème 11 : Génétique', 11),
  ('Terminale S2', 'SVT', 'Thème 12 : Hérédité humaine', 12),
  ('Terminale S2', 'Histoire-Géographie', 'Histoire - 1. Les conséquences de la Deuxième Guerre mondiale et les règlements du conflit.', 1),
  ('Terminale S2', 'Histoire-Géographie', 'Histoire - 2. Les relations Est-Ouest : la Guerre froide.', 2),
  ('Terminale S2', 'Histoire-Géographie', 'Histoire - 3. La Chine de 1945 aux années 1990.', 3),
  ('Terminale S2', 'Histoire-Géographie', 'Histoire - 4. Les causes générales de la décolonisation.', 4),
  ('Terminale S2', 'Histoire-Géographie', 'Histoire - 5. Les formes de la décolonisation.', 5),
  ('Terminale S2', 'Histoire-Géographie', 'Histoire - 6. La décolonisation en Asie : l''Inde et l''Indochine.', 6),
  ('Terminale S2', 'Histoire-Géographie', 'Histoire - 7. La décolonisation au Proche-Orient : la question palestinienne et les relations israélo-arabes.', 7),
  ('Terminale S2', 'Histoire-Géographie', 'Histoire - 8. La décolonisation au Maghreb : l''Algérie.', 8),
  ('Terminale S2', 'Histoire-Géographie', 'Histoire - 9. La décolonisation en Afrique noire : La Gold Coast (Ghana).', 9),
  ('Terminale S2', 'Histoire-Géographie', 'Histoire - 9. La décolonisation en Afrique noire : Le Sénégal.', 10),
  ('Terminale S2', 'Histoire-Géographie', 'Histoire - 9. La décolonisation en Afrique noire : La Guinée-Bissau.', 11),
  ('Terminale S2', 'Histoire-Géographie', 'Histoire - 9. La décolonisation en Afrique noire : L''Angola.', 12),
  ('Terminale S2', 'Histoire-Géographie', 'Géographie - Leçon 1 : Le système-monde : des espaces interdépendants.', 13),
  ('Terminale S2', 'Histoire-Géographie', 'Géographie - Leçon 2 : L''espace nord-américain : atouts et handicaps de la nature.', 14),
  ('Terminale S2', 'Histoire-Géographie', 'Géographie - Leçon 3 : L''espace nord-américain : populations, villes et sociétés.', 15),
  ('Terminale S2', 'Histoire-Géographie', 'Géographie - Leçon 4 : La construction de l''espace économique : États-Unis, Canada et Mexique.', 16),
  ('Terminale S2', 'Histoire-Géographie', 'Géographie - Leçon 5 : Le modèle économique américain : caractéristiques et problèmes.', 17),
  ('Terminale S2', 'Histoire-Géographie', 'Géographie - Leçon 6 : L''Europe : milieux naturels et populations.', 18),
  ('Terminale S2', 'Histoire-Géographie', 'Géographie - Leçon 7 : La construction européenne : réalités et perspectives.', 19),
  ('Terminale S2', 'Histoire-Géographie', 'Géographie - Leçon 8 : L''Allemagne : milieux naturels et population.', 20),
  ('Terminale S2', 'Histoire-Géographie', 'Géographie - Leçon 9 : L''Asie-Pacifique : les facteurs d''émergence et leurs limites.', 21),
  ('Terminale S2', 'Histoire-Géographie', 'Géographie - Leçon 10 : Le Japon : une puissance économique mondiale.', 22),
  ('Terminale S2', 'Histoire-Géographie', 'Géographie - Leçon 11 : La Chine : population et développement économique.', 23),
  ('Terminale S2', 'Histoire-Géographie', 'Géographie - Leçon 13 : L''Amérique latine : milieux naturels et populations.', 24),
  ('Terminale S2', 'Histoire-Géographie', 'Géographie - Leçon 14 : Le Brésil : les facteurs de la réussite économique et ses limites.', 25),
  ('Terminale S2', 'Histoire-Géographie', 'Géographie - Leçon 16 : Le Sénégal : milieux naturels et populations.', 26),
  ('Terminale L2', 'Philosophie', 'Introduction générale', 1),
  ('Terminale L2', 'Philosophie', 'Culture et civilisation - Le langage', 2),
  ('Terminale L2', 'Philosophie', 'Culture et civilisation - Le travail', 3),
  ('Terminale L2', 'Philosophie', 'Culture et civilisation - Les échanges', 4),
  ('Terminale L2', 'Philosophie', 'Culture et civilisation - L''art et la question du beau', 5),
  ('Terminale L2', 'Philosophie', 'Culture et civilisation - La technique - le progrès - le développement', 6),
  ('Terminale L2', 'Philosophie', 'Culture et civilisation - La religion - foi et raison', 7),
  ('Terminale L2', 'Philosophie', 'Culture et civilisation - La tradition', 8),
  ('Terminale L2', 'Philosophie', 'La raison et le réel - Logique et mathématiques', 9),
  ('Terminale L2', 'Philosophie', 'La raison et le réel - Les sciences (vivant, homme, matière)', 10),
  ('Terminale L2', 'Philosophie', 'La raison et le réel - La vérité', 11),
  ('Terminale L2', 'Philosophie', 'Individu et communauté - Autrui', 12),
  ('Terminale L2', 'Philosophie', 'Individu et communauté - L''ethnie', 13),
  ('Terminale L2', 'Philosophie', 'Individu et communauté - La société et la nation', 14),
  ('Terminale L2', 'Philosophie', 'Individu et communauté - Le sujet ; conscience et l''inconscient', 15),
  ('Terminale L2', 'Philosophie', 'Politique et morale - Les passions', 16),
  ('Terminale L2', 'Philosophie', 'Politique et morale - L''Etat', 17),
  ('Terminale L2', 'Philosophie', 'Politique et morale - La justice, le droit et le devoir', 18),
  ('Terminale L2', 'Philosophie', 'Politique et morale - La violence', 19),
  ('Terminale L2', 'Philosophie', 'Politique et morale - La liberté', 20),
  ('Terminale L2', 'Philosophie', 'Politique et morale - Le bonheur', 21),
  ('Terminale L2', 'Philosophie', 'Relatif et absolu - L''existence', 22),
  ('Terminale L2', 'Philosophie', 'Relatif et absolu - La mort', 23),
  ('Terminale L2', 'Philosophie', 'Relatif et absolu - Le temps - La mémoire', 24),
  ('Terminale L2', 'Philosophie', 'Relatif et absolu - L''histoire', 25),
  ('Terminale L2', 'Français', 'Rappel des courants littéraires - La pléiade fascicule', 1),
  ('Terminale L2', 'Français', 'Rappel des courants littéraires - Baroque et classicisme', 2),
  ('Terminale L2', 'Français', 'Rappel des courants littéraires - L''esprit des lumières et réveil philosophique', 3),
  ('Terminale L2', 'Français', 'Rappel des courants littéraires - Le romantisme', 4),
  ('Terminale L2', 'Français', 'Rappel des courants littéraires - Le réalisme', 5),
  ('Terminale L2', 'Français', 'Rappel des courants littéraires - Naturalisme', 6),
  ('Terminale L2', 'Français', 'Rappel des courants littéraires - Le parnasse', 7),
  ('Terminale L2', 'Français', 'Rappel des courants littéraires - Le symbolisme', 8),
  ('Terminale L2', 'Français', 'Cours de Terminales - Le surréalisme', 9),
  ('Terminale L2', 'Français', 'Cours de Terminales - Poésie, caractérisation et fonctions', 10),
  ('Terminale L2', 'Français', 'Cours de Terminales - Roman, caractérisations et orientations', 11),
  ('Terminale L2', 'Français', 'Cours de Terminales - Théâtre, caractérisations et orientations', 12),
  ('Terminale L2', 'Français', 'Cours de Terminales - Le théâtre de l''absurde', 13),
  ('Terminale L2', 'Français', 'Cours de Terminales - Le nouveau roman', 14),
  ('Terminale L2', 'Français', 'Cours de Terminales - La poésie africaine', 15),
  ('Terminale L2', 'Français', 'Étude des œuvres intégrales - Poésie africaine : Chants d''ombre de Léopold Sédar Senghor', 16),
  ('Terminale L2', 'Français', 'Étude des œuvres intégrales - Poésie française : les contemplations de Victor Hugo', 17),
  ('Terminale L2', 'Français', 'Étude des œuvres intégrales - Le roman africain : les soleils des indépendances d''Ahmadou Kourouma', 18),
  ('Terminale L2', 'Français', 'Étude des œuvres intégrales - Le roman français : l''étranger d''Albert Camus', 19),
  ('Terminale L2', 'Français', 'Étude des œuvres intégrales - Le théâtre français : Antigone de Jean Anouilh', 20),
  ('Terminale L2', 'Français', 'Exercices pratiques - Le résumé suivi de discussion', 21),
  ('Terminale L2', 'Français', 'Exercices pratiques - Le commentaire suivi', 22),
  ('Terminale L2', 'Français', 'Exercices pratiques - Le commentaire composé', 23),
  ('Terminale L2', 'Français', 'Exercices pratiques - La dissertation', 24),
  ('Terminale L2', 'Français', 'Exercices pratiques - Exercices corrigés', 25),
  ('Terminale L2', 'Français', 'Exercices pratiques - Exercices analysés', 26),
  ('Terminale L2', 'Histoire-Géographie', 'Histoire - 1. Les conséquences de la Deuxième Guerre mondiale et les règlements du conflit.', 1),
  ('Terminale L2', 'Histoire-Géographie', 'Histoire - 2. Les relations Est-Ouest : la Guerre froide.', 2),
  ('Terminale L2', 'Histoire-Géographie', 'Histoire - 3. La Chine de 1945 aux années 1990.', 3),
  ('Terminale L2', 'Histoire-Géographie', 'Histoire - 4. Les causes générales de la décolonisation.', 4),
  ('Terminale L2', 'Histoire-Géographie', 'Histoire - 5. Les formes de la décolonisation.', 5),
  ('Terminale L2', 'Histoire-Géographie', 'Histoire - 6. La décolonisation en Asie : l''Inde et l''Indochine.', 6),
  ('Terminale L2', 'Histoire-Géographie', 'Histoire - 7. La décolonisation au Proche-Orient : la question palestinienne et les relations israélo-arabes.', 7),
  ('Terminale L2', 'Histoire-Géographie', 'Histoire - 8. La décolonisation au Maghreb : l''Algérie.', 8),
  ('Terminale L2', 'Histoire-Géographie', 'Histoire - 9. La décolonisation en Afrique noire : La Gold Coast (Ghana).', 9),
  ('Terminale L2', 'Histoire-Géographie', 'Histoire - 9. La décolonisation en Afrique noire : Le Sénégal.', 10),
  ('Terminale L2', 'Histoire-Géographie', 'Histoire - 9. La décolonisation en Afrique noire : La Guinée-Bissau.', 11),
  ('Terminale L2', 'Histoire-Géographie', 'Histoire - 9. La décolonisation en Afrique noire : L''Angola.', 12),
  ('Terminale L2', 'Histoire-Géographie', 'Géographie - Leçon 1 : Le système-monde : des espaces interdépendants.', 13),
  ('Terminale L2', 'Histoire-Géographie', 'Géographie - Leçon 2 : L''espace nord-américain : atouts et handicaps de la nature.', 14),
  ('Terminale L2', 'Histoire-Géographie', 'Géographie - Leçon 3 : L''espace nord-américain : populations, villes et sociétés.', 15),
  ('Terminale L2', 'Histoire-Géographie', 'Géographie - Leçon 4 : La construction de l''espace économique : États-Unis, Canada et Mexique.', 16),
  ('Terminale L2', 'Histoire-Géographie', 'Géographie - Leçon 5 : Le modèle économique américain : caractéristiques et problèmes.', 17),
  ('Terminale L2', 'Histoire-Géographie', 'Géographie - Leçon 6 : L''Europe : milieux naturels et populations.', 18),
  ('Terminale L2', 'Histoire-Géographie', 'Géographie - Leçon 7 : La construction européenne : réalités et perspectives.', 19),
  ('Terminale L2', 'Histoire-Géographie', 'Géographie - Leçon 8 : L''Allemagne : milieux naturels et population.', 20),
  ('Terminale L2', 'Histoire-Géographie', 'Géographie - Leçon 9 : L''Asie-Pacifique : les facteurs d''émergence et leurs limites.', 21),
  ('Terminale L2', 'Histoire-Géographie', 'Géographie - Leçon 10 : Le Japon : une puissance économique mondiale.', 22),
  ('Terminale L2', 'Histoire-Géographie', 'Géographie - Leçon 11 : La Chine : population et développement économique.', 23),
  ('Terminale L2', 'Histoire-Géographie', 'Géographie - Leçon 13 : L''Amérique latine : milieux naturels et populations.', 24),
  ('Terminale L2', 'Histoire-Géographie', 'Géographie - Leçon 14 : Le Brésil : les facteurs de la réussite économique et ses limites.', 25),
  ('Terminale L2', 'Histoire-Géographie', 'Géographie - Leçon 16 : Le Sénégal : milieux naturels et populations.', 26)
)
insert into chapitres (nom, matiere_id, ordre)
select d.chapitre, m.id, d.ordre
from data d
join niveaux n on n.nom = d.niveau
join matieres m on m.niveau_id = n.id and m.nom = d.matiere
where not exists (
  select 1 from chapitres c where c.matiere_id = m.id and c.nom = d.chapitre
);

-- 4. Vérification : nombre de chapitres par niveau et matière
select n.nom as niveau, m.nom as matiere, count(c.id) as chapitres
from niveaux n
join matieres m on m.niveau_id = n.id
left join chapitres c on c.matiere_id = m.id
group by n.nom, n.ordre, m.nom, m.ordre
order by n.ordre, m.ordre;
