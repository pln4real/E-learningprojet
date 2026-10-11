# RéussirBac SN — Starter technique

Projet de départ : Next.js + Supabase. Remplace les prototypes statiques
par une vraie base de données et une vraie authentification.

## 1. Configurer Supabase

1. Crée un projet sur https://supabase.com (connexion via GitHub).
2. Dans l'onglet **SQL Editor**, ouvre une nouvelle requête, colle tout
   le contenu de `supabase/schema.sql`, puis clique sur **Run**.
   → Ça crée toutes les tables (niveaux, matières, chapitres, ressources,
   progression) avec la sécurité (RLS) et quelques données d'exemple.
3. Dans **Storage**, crée un nouveau bucket nommé `ressources` (public),
   pour que les PDF uploadés depuis l'espace Admin soient accessibles.
4. Dans **Authentication → Providers**, active **Phone** (tu devras
   connecter un fournisseur SMS comme Twilio — Supabase guide pas à pas,
   un compte Twilio d'essai suffit pour commencer) et vérifie que
   **Email** est déjà activé par défaut.
5. Dans **Project Settings → API**, récupère `Project URL` et
   `anon public key`.

## 2. Configurer le projet en local (optionnel, pour tester)

```bash
cp .env.example .env.local
# Remplis .env.local avec tes vraies valeurs Supabase

npm install
npm run dev
# Ouvre http://localhost:3000
```

Tu n'as pas besoin de faire ça si tu préfères tester directement en ligne
après déploiement (étape 4).

## 3. Mettre le code sur GitHub

```bash
cd reussirbac-sn
git init
git add .
git commit -m "Premier commit — starter technique"
git branch -M main
git remote add origin https://github.com/TON-COMPTE/reussirbac-sn.git
git push -u origin main
```

(Crée d'abord un dépôt vide sur GitHub avec le nom `reussirbac-sn`,
sans README ni .gitignore, puis copie l'URL qu'il te donne.)

## 4. Déployer sur Vercel

1. Sur https://vercel.com, clique sur **Add New → Project**.
2. Choisis ton dépôt GitHub `reussirbac-sn`.
3. Dans **Environment Variables**, ajoute :
   - `NEXT_PUBLIC_SUPABASE_URL` → ton Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → ta clé anon
4. Clique sur **Deploy**. En 1-2 minutes, ton app est en ligne,
   avec une URL du type `reussirbac-sn.vercel.app`.
5. Chaque fois que tu pousses du code sur GitHub (`git push`), Vercel
   redéploie automatiquement — tu n'as plus rien à faire manuellement.

## Structure du projet

```
app/
  login/page.js       → connexion (téléphone OTP + e-mail)
  catalogue/page.js    → catalogue élève (lit les vraies données)
  admin/page.js         → ajout de contenu (écrit dans Supabase)
lib/
  supabaseClient.js     → connexion partagée à Supabase
supabase/
  schema.sql             → à exécuter une fois dans Supabase
```

## Design

Le style premium (polices Fraunces/Work Sans, palette vert foncé + doré,
cartes avec ombre portée) est maintenant appliqué sur les 3 pages, via
`app/globals.css`. C'est la même identité visuelle que les prototypes
validés précédemment.

## Sécurité Admin — à faire une fois (important !)

Par défaut, n'importe quel compte connecté pouvait accéder à `/admin`.
C'est corrigé avec les fichiers `supabase/01-admin-security.sql` et
`supabase/02-storage-security.sql`. Étapes :

1. Dans Supabase → SQL Editor, exécute `01-admin-security.sql` en entier
   (après avoir déjà exécuté `schema.sql` une première fois).
2. Exécute ensuite `02-storage-security.sql`.
3. Connecte-toi une première fois sur ton site via `/login`, avec ton
   e-mail (le plus simple pour toi en tant qu'admin).
4. Dans Supabase → Authentication → Users, trouve ton compte et copie
   son **User UID**.
5. Retourne dans SQL Editor et exécute :
   ```sql
   insert into admins (user_id) values ('TON_USER_UID_ICI');
   ```
6. Recharge `/admin` sur ton site — tu dois maintenant y accéder.
   N'importe qui d'autre qui se connecte verra un écran "Accès réservé".

Cette protection est à deux niveaux : l'interface redirige poliment les
non-admins, et la base de données (policies RLS) refuse réellement
toute écriture si la personne n'est pas dans la table `admins` — même
si quelqu'un essayait de contourner l'interface directement.

## Prochaines étapes suggérées

- Ajouter le reste des niveaux/matières/chapitres dans `schema.sql` ou
  directement depuis l'espace Admin une fois en ligne.
- Gérer le cas "aucun e-mail confirmé" / page d'inscription dédiée si tu
  veux séparer clairement inscription et connexion.
Premier déploiement
