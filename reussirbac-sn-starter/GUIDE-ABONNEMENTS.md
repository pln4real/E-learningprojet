# Abonnements RéussirBac SN : guide de mise en service

## Ce qui est en place
- 4 formules (Découverte 500 F / 7 j, Essentiel 1 500 F / 30 j, Réussite 3 500 F / 90 j, Excellence 12 000 F / 365 j), modifiables dans Admin > Abonnements > Plans.
- Chaque formule donne accès à UNE classe au choix (modifiable : classes fixes ou toutes les classes).
- Paiement PayDunya (Wave, Orange Money, Free Money, carte). L'abonnement n'est activé qu'après vérification serveur auprès de PayDunya (statut, montant, référence).
- Accès Premium contrôlé par la base (RLS) classe par classe. PDF privés avec liens temporaires (après le script 11).
- Renouvellement : le nouvel abonnement de la même classe commence à la fin de l'ancien ; sinon à la confirmation du paiement. Les abonnements de classes différentes s'additionnent sans se mélanger.
- L'ancien système (palier manuel dans Admin > Élèves) continue de fonctionner et donne accès à toutes les classes.
- Téléchargement des PDF : réservé au palier manuel « premium » (comme avant). Un abonnement payé donne la lecture.

## Ordre de mise en service
1. Supabase > SQL Editor : lancer `10-abonnements.sql`.
2. Envoyer le projet sur GitHub (un seul commit). Vercel redéploie.
3. Supabase > SQL Editor : lancer `11-bucket-prive.sql` (APRÈS le déploiement). Les PDF ne s'ouvrent plus que par liens temporaires.
4. Vercel > Settings > Environment Variables (jamais sur GitHub) :
   - `NEXT_PUBLIC_SITE_URL` = l'adresse du site (https://...)
   - `SUPABASE_SERVICE_ROLE_KEY` = clé « service_role » (Supabase > Project Settings > API). SECRÈTE.
   - `PAYDUNYA_MODE` = `test` puis `live`
   - `PAYDUNYA_MASTER_KEY`, `PAYDUNYA_PRIVATE_KEY`, `PAYDUNYA_TOKEN` = clés de l'application PayDunya (mode test d'abord)
   Puis Redeploy.
5. Essayer en mode test : choisir une formule, payer avec le compte de test PayDunya, vérifier que l'abonnement s'active.
6. Passer en `live` avec les vraies clés, faire un vrai paiement de 500 F soi-même, vérifier dans Admin > Transactions.

## À configurer chez PayDunya
- L'adresse de notification (IPN) est envoyée automatiquement avec chaque facture : `https://TON-SITE/api/paiement/webhook`. Rien à saisir, mais vérifier dans le tableau de bord que les notifications ne sont pas bloquées.
- Compte marchand validé (pièces demandées par PayDunya) avant le mode live.

## Si un élève dit « j'ai payé mais rien »
Admin > Abonnements > Transactions > « Vérifier les paiements douteux ». Le serveur redemande le statut réel à PayDunya. Si besoin, Admin > Abonnements > « Accorder un abonnement manuellement » (tracé dans le journal).

## Limites connues
- Aucun test avec le vrai PayDunya n'a pu être fait pendant le développement : les routes ont été testées avec un faux PayDunya. Le test sandbox puis le vrai paiement de 500 F sont obligatoires.
- La documentation PayDunya ne précise pas tout le calcul du « hash » de notification. Il est utilisé en contrôle supplémentaire ; la vraie preuve reste la vérification directe auprès de PayDunya. Si PayDunya envoie un hash différent en sandbox, les notifications seront rejetées : la page de retour et le bouton « Vérifier » activent quand même l'abonnement. Dans ce cas, dis-le moi.
- Les remboursements se font chez PayDunya ; ensuite Admin > Transactions > « Marquer comme remboursé » coupe l'accès.
- Vercel Hobby est réservé à un usage non commercial : passer à Vercel Pro avant d'encaisser.

## Nouveaux onglets de chapitre : Révision, Fiche visuelle, Sommaire
- Script `12-revision-fiche-sommaire.sql` à lancer dans Supabase AVANT d'envoyer le code.
- Admin > Ajouter : types « Révision » (PDF de résumé) et « Fiche visuelle » (image PNG/JPG/WebP ou PDF).
- Sommaire : en ajoutant un PDF de type Cours, les titres sont détectés automatiquement (signets du PDF, sinon titres plus grands que le texte). Tu peux corriger la liste avant d'enregistrer. Pour un PDF existant : Modifier > « Détecter à nouveau ».
- Pour de meilleurs résultats : exporte tes PDF depuis Word ou Google Docs avec les styles « Titre 1 » / « Titre 2 ».
- Un onglet vide n'est plus affiché dans le chapitre.
