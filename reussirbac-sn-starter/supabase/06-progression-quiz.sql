-- ============================================================
-- Progression des élèves + Quiz
-- Supabase → SQL Editor → New query → coller → Run
-- (à lancer après 05 ; sans danger si relancé)
-- ============================================================

-- 1. Progression : l'élève peut aussi décocher (supprimer) sa ligne
drop policy if exists "Suppression propre progression" on progression_utilisateur;
create policy "Suppression propre progression" on progression_utilisateur for delete
  using (auth.uid() = user_id);

drop policy if exists "Modification propre progression" on progression_utilisateur;
create policy "Modification propre progression" on progression_utilisateur for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. Quiz
create table if not exists quiz (
  id uuid primary key default gen_random_uuid(),
  chapitre_id uuid not null references chapitres(id) on delete cascade,
  titre text not null,
  description text,
  acces text not null default 'gratuit' check (acces in ('gratuit','abonne')),
  statut text not null default 'brouillon' check (statut in ('brouillon','publie')),
  cree_le timestamptz not null default now()
);

create table if not exists quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quiz(id) on delete cascade,
  ordre int not null default 0,
  enonce text not null,
  options jsonb not null,            -- ["réponse A","réponse B",...]
  bonne_reponse int not null,        -- index (0 = première option)
  explication text
);

create table if not exists quiz_resultats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid not null references quiz(id) on delete cascade,
  score int not null,
  total int not null,
  fait_le timestamptz not null default now()
);

alter table quiz enable row level security;
alter table quiz_questions enable row level security;
alter table quiz_resultats enable row level security;

-- Lecture des quiz : publiés ET (gratuits OU palier abonné/premium) ; les admins voient tout
drop policy if exists "Lecture quiz" on quiz;
create policy "Lecture quiz" on quiz for select
  using (statut = 'publie' and (acces = 'gratuit' or mon_palier() in ('abonne','premium')));
drop policy if exists "Admin quiz" on quiz;
create policy "Admin quiz" on quiz for all
  using (is_admin()) with check (is_admin());

drop policy if exists "Lecture questions" on quiz_questions;
create policy "Lecture questions" on quiz_questions for select
  using (exists (select 1 from quiz q where q.id = quiz_id));
drop policy if exists "Admin questions" on quiz_questions;
create policy "Admin questions" on quiz_questions for all
  using (is_admin()) with check (is_admin());

drop policy if exists "Lecture propres resultats" on quiz_resultats;
create policy "Lecture propres resultats" on quiz_resultats for select
  using (auth.uid() = user_id);
drop policy if exists "Ecriture propres resultats" on quiz_resultats;
create policy "Ecriture propres resultats" on quiz_resultats for insert
  with check (auth.uid() = user_id);

-- 3. Quiz réservés aux abonnés : titre seulement (jamais les questions)
drop function if exists quiz_verrouilles(uuid);
create or replace function quiz_verrouilles(p_chapitre uuid)
returns table (id uuid, titre text, description text, cree_le timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select q.id, q.titre, q.description, q.cree_le
  from quiz q
  where q.chapitre_id = p_chapitre
    and q.statut = 'publie'
    and q.acces <> 'gratuit'
    and mon_palier() = 'gratuit'
  order by q.cree_le;
$$;
grant execute on function quiz_verrouilles(uuid) to anon, authenticated;
