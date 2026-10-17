-- ============================================================
-- 10 - SYSTÈME D'ABONNEMENT (plans, paiements, abonnements)
-- Supabase -> SQL Editor -> New query -> coller -> Run
-- À lancer APRÈS 01 à 09. Sans danger si relancé. Ne supprime rien.
--
-- Règles :
--  * Les prix et durées sont lus dans la table "plans" (modifiables dans l'admin).
--    Chaque transaction garde une COPIE du prix et de la durée au moment de l'achat.
--  * Seul le serveur (clé service_role) peut créer/activer un paiement.
--    Un élève ne peut ni créer, ni modifier, ni supprimer un abonnement.
--  * Activation atomique et idempotente : une transaction n'active qu'UN abonnement.
--  * Renouvellement : si l'abonnement de même périmètre est encore actif, le nouveau
--    commence à sa date de fin ; sinon il commence à la confirmation du paiement.
--  * Périmètre : 'une_classe' (l'élève choisit sa classe), 'selection' (classes fixes),
--    'toutes' (toutes les classes).
--  * L'ancien système (palier manuel dans "profils") continue de fonctionner.
-- ============================================================

-- ---------- 1. Plans ----------
create table if not exists plans (
  id text primary key,
  nom text not null,
  description text not null default '',
  prix_fcfa integer not null check (prix_fcfa > 0),
  duree_jours integer not null check (duree_jours > 0),
  portee text not null default 'une_classe' check (portee in ('une_classe','selection','toutes')),
  niveaux_autorises uuid[],                    -- classes concernées (selection) ou proposées (une_classe)
  avantages text[] not null default '{}',
  mis_en_avant boolean not null default false,
  actif boolean not null default true,
  ordre integer not null default 0,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);

-- ---------- 2. Transactions ----------
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null references plans(id),
  plan_nom text not null,
  duree_jours integer not null check (duree_jours > 0),
  niveaux_ids uuid[],                          -- périmètre acheté (null = toutes les classes)
  montant integer not null check (montant > 0),
  devise text not null default 'XOF',
  prestataire text not null default 'paydunya',
  ref_prestataire text unique,
  checkout_url text,
  statut text not null default 'en_attente'
    check (statut in ('en_attente','payee','echouee','annulee','remboursee')),
  a_verifier boolean not null default false,
  motif text,
  cree_le timestamptz not null default now(),
  confirme_le timestamptz,
  modifie_le timestamptz not null default now()
);
create index if not exists transactions_user_idx on transactions (user_id, cree_le desc);
create index if not exists transactions_statut_idx on transactions (statut, cree_le);

-- ---------- 3. Abonnements ----------
create table if not exists abonnements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text references plans(id),
  plan_nom text not null,
  niveaux_ids uuid[],                          -- null = toutes les classes
  debut timestamptz not null,
  fin timestamptz not null,
  statut text not null default 'actif' check (statut in ('actif','annule')),
  transaction_id uuid unique references transactions(id), -- UNIQUE = une transaction n'active qu'un abonnement
  origine text not null default 'paiement' check (origine in ('paiement','admin')),
  cree_le timestamptz not null default now(),
  check (fin > debut)
);
create index if not exists abonnements_user_idx on abonnements (user_id, fin desc);

-- ---------- 4. Journal d'audit (actions des administrateurs) ----------
create table if not exists audit_admin (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  action text not null,
  cible text,
  detail jsonb,
  cree_le timestamptz not null default now()
);

-- ---------- 5. Droits d'accès aux tables ----------
alter table plans enable row level security;
alter table transactions enable row level security;
alter table abonnements enable row level security;
alter table audit_admin enable row level security;

revoke all on plans, transactions, abonnements, audit_admin from anon, authenticated;
grant select on plans to anon, authenticated;
grant update on plans to authenticated;           -- limité aux admins par la policy
grant select on transactions, abonnements to authenticated;
grant select on audit_admin to authenticated;

drop policy if exists "Plans visibles" on plans;
create policy "Plans visibles" on plans for select using (actif or is_admin());
drop policy if exists "Admins modifient les plans" on plans;
create policy "Admins modifient les plans" on plans for update using (is_admin()) with check (is_admin());

drop policy if exists "Mes transactions" on transactions;
create policy "Mes transactions" on transactions for select using (user_id = auth.uid() or is_admin());
drop policy if exists "Mes abonnements" on abonnements;
create policy "Mes abonnements" on abonnements for select using (user_id = auth.uid() or is_admin());
drop policy if exists "Admins lisent l audit" on audit_admin;
create policy "Admins lisent l audit" on audit_admin for select using (is_admin());
-- Aucune policy d'écriture sur transactions / abonnements / audit_admin :
-- seules les fonctions ci-dessous (et le serveur) peuvent y écrire.

-- Journal automatique de toute modification de plan
create or replace function trg_audit_plans() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.modifie_le := now();
  insert into audit_admin (admin_id, action, cible, detail)
  values (auth.uid(), 'plan_modifie', old.id,
          jsonb_build_object('avant', to_jsonb(old) - 'modifie_le', 'apres', to_jsonb(new) - 'modifie_le'));
  return new;
end $$;
drop trigger if exists plans_audit on plans;
create trigger plans_audit before update on plans for each row execute function trg_audit_plans();

-- ---------- 6. Les 4 formules (modifiables ensuite dans l'admin) ----------
insert into plans (id, nom, description, prix_fcfa, duree_jours, portee, avantages, mis_en_avant, ordre) values
 ('decouverte','Découverte','Pour essayer sans t''engager.',500,7,'une_classe',
  array['Tous les cours, exercices et annales de ta classe','Quiz corrigés','Accès sur téléphone et ordinateur'], false, 1),
 ('essentiel','Essentiel','Un mois pour réviser sereinement.',1500,30,'une_classe',
  array['Tous les cours, exercices et annales de ta classe','Quiz corrigés','Suivi de progression'], false, 2),
 ('reussite','Réussite','Un trimestre complet pour préparer l''examen.',3500,90,'une_classe',
  array['Tous les cours, exercices et annales de ta classe','Quiz corrigés','Suivi de progression','Le meilleur prix par mois'], true, 3),
 ('excellence','Excellence','Toute l''année scolaire, sans souci.',12000,365,'une_classe',
  array['Tous les cours, exercices et annales de ta classe','Quiz corrigés','Suivi de progression','Valable 365 jours'], false, 4)
on conflict (id) do nothing;

-- ---------- 7. Accès par classe ----------
create or replace function palier_manuel() returns text
language sql security definer stable set search_path = public as $$
  select case
    when is_admin() then 'premium'
    else coalesce(
      (select case when palier_jusqu_au is not null and palier_jusqu_au < current_date then 'gratuit'
                   else palier end
       from profils where id = auth.uid()), 'gratuit')
  end;
$$;

create or replace function a_abonnement_actif(p_niveau uuid default null) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from abonnements a
    where a.user_id = auth.uid() and a.statut = 'actif'
      and a.debut <= now() and a.fin > now()
      and (p_niveau is null or a.niveaux_ids is null or p_niveau = any(a.niveaux_ids))
  );
$$;

-- Palier affiché (inchangé pour l'ancien système) : un abonnement actif = 'abonne'
create or replace function mon_palier() returns text
language sql security definer stable set search_path = public as $$
  select case
    when palier_manuel() <> 'gratuit' then palier_manuel()
    when a_abonnement_actif(null) then 'abonne'
    else 'gratuit'
  end;
$$;

create or replace function niveau_du_chapitre(p_chapitre uuid) returns uuid
language sql security definer stable set search_path = public as $$
  select m.niveau_id from chapitres c join matieres m on m.id = c.matiere_id where c.id = p_chapitre;
$$;

-- Peut-on lire le contenu payant de cette classe ? (admin, palier manuel, ou abonnement valide)
create or replace function peut_lire_niveau(p_niveau uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select palier_manuel() in ('abonne','premium') or a_abonnement_actif(p_niveau);
$$;

grant execute on function palier_manuel(), a_abonnement_actif(uuid), mon_palier(),
  niveau_du_chapitre(uuid), peut_lire_niveau(uuid) to anon, authenticated;

drop policy if exists "Lecture ressources selon accès" on ressources;
create policy "Lecture ressources selon accès" on ressources for select
  using (statut = 'publie' and (acces = 'gratuit' or peut_lire_niveau(niveau_du_chapitre(chapitre_id))));

drop policy if exists "Lecture quiz" on quiz;
create policy "Lecture quiz" on quiz for select
  using (statut = 'publie' and (acces = 'gratuit' or peut_lire_niveau(niveau_du_chapitre(chapitre_id))));

drop function if exists ressources_verrouillees(uuid);
create or replace function ressources_verrouillees(p_chapitre uuid)
returns table (id uuid, type text, source text, titre text, description text,
               acces text, cree_le timestamptz, a_pdf boolean, a_video boolean)
language sql security definer stable set search_path = public as $$
  select r.id, r.type, r.source, r.titre, r.description, r.acces, r.cree_le,
         (r.url_fichier is not null), (r.url_video is not null)
  from ressources r
  where r.chapitre_id = p_chapitre and r.statut = 'publie' and r.acces <> 'gratuit'
    and not peut_lire_niveau(niveau_du_chapitre(r.chapitre_id))
  order by r.cree_le;
$$;

drop function if exists quiz_verrouilles(uuid);
create or replace function quiz_verrouilles(p_chapitre uuid)
returns table (id uuid, titre text, description text, cree_le timestamptz)
language sql security definer stable set search_path = public as $$
  select q.id, q.titre, q.description, q.cree_le
  from quiz q
  where q.chapitre_id = p_chapitre and q.statut = 'publie' and q.acces <> 'gratuit'
    and not peut_lire_niveau(niveau_du_chapitre(q.chapitre_id))
  order by q.cree_le;
$$;
grant execute on function ressources_verrouillees(uuid), quiz_verrouilles(uuid) to anon, authenticated;

-- ---------- 8. Fonctions réservées au SERVEUR (clé service_role) ----------

-- Crée (ou réutilise) une transaction en attente. Le prix vient TOUJOURS de la table plans.
create or replace function creer_transaction(p_user uuid, p_plan text, p_niveau uuid)
returns transactions
language plpgsql security definer set search_path = public as $$
declare
  v_plan plans%rowtype;
  v_niveaux uuid[];
  v_tx transactions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('tx:' || p_user::text));
  select * into v_plan from plans where id = p_plan and actif;
  if not found then raise exception 'plan_introuvable'; end if;

  if v_plan.portee = 'toutes' then
    v_niveaux := null;
  elsif v_plan.portee = 'selection' then
    if v_plan.niveaux_autorises is null or cardinality(v_plan.niveaux_autorises) = 0 then
      raise exception 'plan_sans_classe';
    end if;
    v_niveaux := v_plan.niveaux_autorises;
  else
    if p_niveau is null or not exists (select 1 from niveaux where id = p_niveau) then
      raise exception 'classe_requise';
    end if;
    if v_plan.niveaux_autorises is not null and not (p_niveau = any(v_plan.niveaux_autorises)) then
      raise exception 'classe_non_proposee';
    end if;
    v_niveaux := array[p_niveau];
  end if;

  -- Les tentatives en attente depuis plus de 30 minutes sont closes
  update transactions set statut = 'annulee', motif = 'Délai dépassé sans paiement', modifie_le = now()
   where user_id = p_user and statut = 'en_attente' and cree_le < now() - interval '30 minutes'
     and ref_prestataire is null;

  -- Tentative répétée : on réutilise la transaction en attente identique (pas de doublon)
  select * into v_tx from transactions
   where user_id = p_user and plan_id = p_plan and statut = 'en_attente'
     and niveaux_ids is not distinct from v_niveaux
     and checkout_url is not null and cree_le > now() - interval '30 minutes'
   order by cree_le desc limit 1;
  if found then return v_tx; end if;

  insert into transactions (reference, user_id, plan_id, plan_nom, duree_jours, niveaux_ids, montant)
  values ('RB-' || to_char(now() at time zone 'utc','YYMMDD') || '-' ||
          upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
          p_user, v_plan.id, v_plan.nom, v_plan.duree_jours, v_niveaux, v_plan.prix_fcfa)
  returning * into v_tx;
  return v_tx;
end $$;

-- Active l'abonnement après CONFIRMATION FIABLE du paiement. Atomique et idempotente.
create or replace function activer_abonnement(p_reference text, p_montant integer, p_ref_prestataire text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tx transactions%rowtype;
  v_abo_id uuid;
  v_debut timestamptz;
  v_fin_precedente timestamptz;
begin
  select * into v_tx from transactions where reference = p_reference for update;
  if not found then raise exception 'transaction_introuvable'; end if;

  -- Déjà traitée : on renvoie l'abonnement existant, sans rien ajouter (notifications répétées)
  if v_tx.statut = 'payee' then
    select id into v_abo_id from abonnements where transaction_id = v_tx.id;
    return v_abo_id;
  end if;
  if v_tx.statut = 'remboursee' then raise exception 'transaction_remboursee'; end if;

  if p_montant is distinct from v_tx.montant then
    update transactions set a_verifier = true, motif = 'Montant reçu incorrect : ' || coalesce(p_montant::text,'?'),
           modifie_le = now() where id = v_tx.id;
    return null;   -- on n'active rien ; l'anomalie est signalée dans l'admin
  end if;

  perform pg_advisory_xact_lock(hashtext('abo:' || v_tx.user_id::text));

  select max(fin) into v_fin_precedente from abonnements
   where user_id = v_tx.user_id and statut = 'actif' and fin > now()
     and niveaux_ids is not distinct from v_tx.niveaux_ids;
  v_debut := greatest(now(), coalesce(v_fin_precedente, now()));

  insert into abonnements (user_id, plan_id, plan_nom, niveaux_ids, debut, fin, transaction_id, origine)
  values (v_tx.user_id, v_tx.plan_id, v_tx.plan_nom, v_tx.niveaux_ids, v_debut,
          v_debut + make_interval(days => v_tx.duree_jours), v_tx.id, 'paiement')
  on conflict (transaction_id) do nothing
  returning id into v_abo_id;

  update transactions set statut = 'payee', confirme_le = now(), modifie_le = now(),
         a_verifier = false, motif = null,
         ref_prestataire = coalesce(p_ref_prestataire, ref_prestataire)
   where id = v_tx.id;
  return v_abo_id;
end $$;

-- Paiement refusé / annulé (ne touche jamais une transaction déjà payée)
create or replace function marquer_transaction(p_reference text, p_statut text, p_motif text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_statut not in ('echouee','annulee') then raise exception 'statut_invalide'; end if;
  update transactions set statut = p_statut, motif = p_motif, modifie_le = now()
   where reference = p_reference and statut = 'en_attente';
end $$;

create or replace function signaler_transaction(p_reference text, p_motif text)
returns void
language sql security definer set search_path = public as $$
  update transactions set a_verifier = true, motif = p_motif, modifie_le = now()
   where reference = p_reference and statut <> 'payee';
$$;

revoke execute on function creer_transaction(uuid,text,uuid), activer_abonnement(text,integer,text),
  marquer_transaction(text,text,text), signaler_transaction(text,text) from public, anon, authenticated;
grant execute on function creer_transaction(uuid,text,uuid), activer_abonnement(text,integer,text),
  marquer_transaction(text,text,text), signaler_transaction(text,text) to service_role;

-- ---------- 9. Fonctions ADMIN (vérifient is_admin() et écrivent dans le journal) ----------
create or replace function admin_accorder_abonnement(p_email text, p_plan text, p_niveau uuid, p_jours integer default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid; v_plan plans%rowtype; v_niveaux uuid[]; v_debut timestamptz; v_prec timestamptz; v_id uuid;
begin
  if not is_admin() then raise exception 'reserve_aux_admins'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'eleve_introuvable'; end if;
  select * into v_plan from plans where id = p_plan;
  if not found then raise exception 'plan_introuvable'; end if;
  v_niveaux := case v_plan.portee when 'toutes' then null
                                  when 'selection' then v_plan.niveaux_autorises
                                  else array[p_niveau] end;
  if v_plan.portee = 'une_classe' and p_niveau is null then raise exception 'classe_requise'; end if;
  perform pg_advisory_xact_lock(hashtext('abo:' || v_user::text));
  select max(fin) into v_prec from abonnements
   where user_id = v_user and statut = 'actif' and fin > now() and niveaux_ids is not distinct from v_niveaux;
  v_debut := greatest(now(), coalesce(v_prec, now()));
  insert into abonnements (user_id, plan_id, plan_nom, niveaux_ids, debut, fin, origine)
  values (v_user, v_plan.id, v_plan.nom, v_niveaux, v_debut,
          v_debut + make_interval(days => coalesce(p_jours, v_plan.duree_jours)), 'admin')
  returning id into v_id;
  insert into audit_admin (admin_id, action, cible, detail)
  values (auth.uid(), 'abonnement_accorde', v_user::text,
          jsonb_build_object('plan', p_plan, 'niveaux', v_niveaux, 'jours', coalesce(p_jours, v_plan.duree_jours), 'abonnement', v_id));
  return v_id;
end $$;

create or replace function admin_annuler_abonnement(p_abonnement uuid, p_motif text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'reserve_aux_admins'; end if;
  update abonnements set statut = 'annule' where id = p_abonnement;
  insert into audit_admin (admin_id, action, cible, detail)
  values (auth.uid(), 'abonnement_annule', p_abonnement::text, jsonb_build_object('motif', p_motif));
end $$;

-- À utiliser APRÈS avoir remboursé l'élève chez le prestataire : coupe l'accès et trace le remboursement
create or replace function admin_marquer_rembourse(p_reference text, p_motif text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_tx transactions%rowtype;
begin
  if not is_admin() then raise exception 'reserve_aux_admins'; end if;
  select * into v_tx from transactions where reference = p_reference for update;
  if not found or v_tx.statut <> 'payee' then raise exception 'transaction_non_remboursable'; end if;
  update transactions set statut = 'remboursee', motif = p_motif, modifie_le = now() where id = v_tx.id;
  update abonnements set statut = 'annule' where transaction_id = v_tx.id;
  insert into audit_admin (admin_id, action, cible, detail)
  values (auth.uid(), 'transaction_remboursee', p_reference, jsonb_build_object('motif', p_motif, 'montant', v_tx.montant));
end $$;

create or replace function admin_transactions(p_limite integer default 200)
returns table (reference text, statut text, a_verifier boolean, motif text, plan_nom text, montant integer,
               cree_le timestamptz, confirme_le timestamptz, email text, nom text, ref_prestataire text)
language sql security definer stable set search_path = public as $$
  select t.reference, t.statut, t.a_verifier, t.motif, t.plan_nom, t.montant, t.cree_le, t.confirme_le,
         u.email::text, p.nom_complet, t.ref_prestataire
  from transactions t
  left join auth.users u on u.id = t.user_id
  left join profils p on p.id = t.user_id
  where is_admin()
  order by t.cree_le desc limit least(coalesce(p_limite, 200), 1000);
$$;

create or replace function admin_abonnements()
returns table (id uuid, plan_nom text, niveaux_ids uuid[], debut timestamptz, fin timestamptz, statut text,
               origine text, email text, nom text)
language sql security definer stable set search_path = public as $$
  select a.id, a.plan_nom, a.niveaux_ids, a.debut, a.fin, a.statut, a.origine, u.email::text, p.nom_complet
  from abonnements a
  left join auth.users u on u.id = a.user_id
  left join profils p on p.id = a.user_id
  where is_admin()
  order by a.fin desc limit 1000;
$$;

-- Tableau de bord commercial. L'argent encaissé = transactions 'payee' uniquement.
create or replace function admin_stats(p_debut timestamptz, p_fin timestamptz)
returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare r jsonb;
begin
  if not is_admin() then raise exception 'reserve_aux_admins'; end if;
  select jsonb_build_object(
    'encaisse', coalesce((select sum(montant) from transactions where statut = 'payee' and confirme_le >= p_debut and confirme_le < p_fin), 0),
    'nb_payees', (select count(*) from transactions where statut = 'payee' and confirme_le >= p_debut and confirme_le < p_fin),
    'en_attente_nb', (select count(*) from transactions where statut = 'en_attente'),
    'en_attente_montant', coalesce((select sum(montant) from transactions where statut = 'en_attente'), 0),
    'echouees', (select count(*) from transactions where statut in ('echouee','annulee') and cree_le >= p_debut and cree_le < p_fin),
    'rembourse_montant', coalesce((select sum(montant) from transactions where statut = 'remboursee' and modifie_le >= p_debut and modifie_le < p_fin), 0),
    'a_verifier', (select count(*) from transactions where a_verifier and statut <> 'payee'),
    'actifs', (select count(*) from abonnements where statut = 'actif' and debut <= now() and fin > now()),
    'nouveaux', (select count(*) from abonnements where cree_le >= p_debut and cree_le < p_fin),
    'expires', (select count(*) from abonnements where statut = 'actif' and fin >= p_debut and fin < least(p_fin, now())),
    'par_plan', coalesce((select jsonb_agg(x) from (
        select plan_nom, count(*) as ventes, sum(montant) as montant from transactions
        where statut = 'payee' and confirme_le >= p_debut and confirme_le < p_fin
        group by plan_nom order by sum(montant) desc) x), '[]'::jsonb)
  ) into r;
  return r;
end $$;

revoke execute on function admin_accorder_abonnement(text,text,uuid,integer), admin_annuler_abonnement(uuid,text),
  admin_marquer_rembourse(text,text), admin_transactions(integer), admin_abonnements(),
  admin_stats(timestamptz,timestamptz) from public, anon;
grant execute on function admin_accorder_abonnement(text,text,uuid,integer), admin_annuler_abonnement(uuid,text),
  admin_marquer_rembourse(text,text), admin_transactions(integer), admin_abonnements(),
  admin_stats(timestamptz,timestamptz) to authenticated;
