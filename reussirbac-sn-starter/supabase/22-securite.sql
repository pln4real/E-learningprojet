-- =====================================================================
-- 22 - DURCISSEMENT SÉCURITÉ (à lancer dans Supabase > SQL Editor)
-- Sans risque : peut être relancé plusieurs fois. Ne supprime aucune donnée.
-- Principe : "moindre privilège". On retire tout ce qui n'est pas nécessaire,
-- en plus des règles RLS déjà en place (qui restent la barrière principale).
-- =====================================================================

-- 1) VISITEURS NON CONNECTÉS (anon) : lecture du catalogue public seulement ------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

grant select on niveaux, matieres, chapitres, ressources, quiz, quiz_questions, plans, documents to anon;
grant insert on messages_contact to anon;   -- formulaire "Contact" (limité par la règle RLS + anti-spam ci-dessous)

-- 2) COMPTES CONNECTÉS : on retire les droits dangereux que RLS ne contrôle pas ----
-- (TRUNCATE, TRIGGER, REFERENCES ignorent les règles RLS)
revoke truncate, trigger, references on all tables in schema public from authenticated;

-- 3) FONCTIONS : plus d'exécution par défaut pour le public --------------------
-- Les fonctions "admin" et celles qui n'ont de sens que pour un compte connecté
-- ne sont plus appelables sans connexion.
revoke execute on function admin_cercle_suspendre(uuid, boolean) from public, anon;
revoke execute on function admin_signalement_statut(uuid, text) from public, anon;
revoke execute on function admin_signalements(text) from public, anon;
revoke execute on function modifier_mon_nom(text) from public, anon;

-- Fonctions de déclencheurs : elles ne se lancent que via la base, jamais depuis l'API
revoke execute on function creer_profil() from public, anon, authenticated;
revoke execute on function trg_amities_suspendus() from public, anon, authenticated;
revoke execute on function trg_audit_plans() from public, anon, authenticated;
revoke execute on function trg_points_quiz() from public, anon, authenticated;
revoke execute on function trg_points_ressource() from public, anon, authenticated;

-- Les futures fonctions ne seront plus exécutables par défaut par anon/public :
-- il faudra un "grant execute" explicite (un oubli devient sans danger).
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke all on tables from anon;

-- 4) RÉSULTATS DE QUIZ : valeurs cohérentes + anti-abus ---------------------------
alter table quiz_resultats drop constraint if exists quiz_resultats_coherence;
alter table quiz_resultats add constraint quiz_resultats_coherence
  check (total between 1 and 100 and score between 0 and total) not valid;
-- "not valid" : n'échoue pas sur d'anciennes lignes, mais s'applique à toute nouvelle ligne.

create or replace function trg_quiz_garde() returns trigger
language plpgsql security definer set search_path = public as $$
declare recents int;
begin
  new.fait_le := now();                       -- la date ne vient jamais du navigateur
  select count(*) into recents from quiz_resultats
   where user_id = new.user_id and fait_le > now() - interval '1 hour';
  if recents >= 30 then raise exception 'trop_de_resultats'; end if;
  return new;
end $$;
revoke execute on function trg_quiz_garde() from public, anon, authenticated;
drop trigger if exists quiz_garde on quiz_resultats;
create trigger quiz_garde before insert on quiz_resultats
  for each row execute function trg_quiz_garde();

-- 5) FORMULAIRE DE CONTACT : anti-spam -------------------------------------------
create or replace function trg_contact_garde() returns trigger
language plpgsql security definer set search_path = public as $$
declare par_email int; au_total int;
begin
  select count(*) into par_email from messages_contact
   where lower(email) = lower(new.email) and cree_le > now() - interval '1 hour';
  if par_email >= 3 then raise exception 'trop_de_messages'; end if;
  select count(*) into au_total from messages_contact where cree_le > now() - interval '1 hour';
  if au_total >= 100 then raise exception 'trop_de_messages'; end if;
  return new;
end $$;
revoke execute on function trg_contact_garde() from public, anon, authenticated;
drop trigger if exists contact_garde on messages_contact;
create trigger contact_garde before insert on messages_contact
  for each row execute function trg_contact_garde();

-- 6) NOM À L'INSCRIPTION : longueur bornée (le nom vient du navigateur) -------------
create or replace function creer_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profils (id, nom_complet, email)
  values (new.id, left(trim(new.raw_user_meta_data->>'nom_complet'), 80), new.email)
  on conflict (id) do nothing;
  return new;
end; $$;
revoke execute on function creer_profil() from public, anon, authenticated;

-- 7) STOCKAGE : types et tailles de fichiers acceptés côté serveur -----------------
-- (le contrôle du navigateur ne suffit pas : on le double ici)
update storage.buckets
   set file_size_limit = 52428800,   -- 50 Mo
       allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
 where id in ('ressources', 'bibliotheque');
update storage.buckets set public = false where id in ('ressources', 'bibliotheque');
