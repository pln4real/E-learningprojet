-- ============================================================
-- 18 - « Mon cercle » : amis, défis quiz, classement hebdomadaire, séries de jours
-- Supabase -> SQL Editor -> New query -> coller -> Run
-- (à lancer après 06 ; sans danger si relancé ; AJOUTE seulement de nouvelles tables
--  et fonctions, ne modifie aucune donnée existante)
--
-- Sécurité : les élèves n'ont AUCUN accès direct en écriture à ces tables. Tout passe par
-- des fonctions qui vérifient qui est qui : on ne voit que ses propres amis, on ne peut
-- pas modifier les points ni les scores, et les bonnes réponses d'un défi ne sont jamais
-- envoyées avant que l'élève ait répondu.
-- ============================================================

-- 1. Profil « cercle » : code d'invitation, pseudo, mode discret
create table if not exists amis_profils (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  pseudo text not null,
  discret boolean not null default false,
  vu_le timestamptz,
  cree_le timestamptz not null default now()
);
alter table amis_profils enable row level security;
drop policy if exists "Lire mon profil cercle" on amis_profils;
create policy "Lire mon profil cercle" on amis_profils for select using (user_id = auth.uid());

-- 2. Amitiés (une seule ligne par paire d'élèves)
create table if not exists amities (
  id uuid primary key default gen_random_uuid(),
  demandeur uuid not null references auth.users(id) on delete cascade,
  destinataire uuid not null references auth.users(id) on delete cascade,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'acceptee')),
  cree_le timestamptz not null default now(),
  check (demandeur <> destinataire)
);
create unique index if not exists amities_paire on amities (least(demandeur, destinataire), greatest(demandeur, destinataire));
alter table amities enable row level security;
drop policy if exists "Lire mes amities" on amities;
create policy "Lire mes amities" on amities for select using (auth.uid() in (demandeur, destinataire));

-- 3. Blocages et signalements
create table if not exists amis_blocages (
  bloqueur uuid not null references auth.users(id) on delete cascade,
  bloque uuid not null references auth.users(id) on delete cascade,
  cree_le timestamptz not null default now(),
  primary key (bloqueur, bloque)
);
alter table amis_blocages enable row level security;
drop policy if exists "Lire mes blocages" on amis_blocages;
create policy "Lire mes blocages" on amis_blocages for select using (bloqueur = auth.uid());

create table if not exists amis_signalements (
  id uuid primary key default gen_random_uuid(),
  auteur uuid references auth.users(id) on delete set null,
  cible uuid references auth.users(id) on delete cascade,
  motif text,
  cree_le timestamptz not null default now()
);
alter table amis_signalements enable row level security;
drop policy if exists "Admin lit les signalements" on amis_signalements;
create policy "Admin lit les signalements" on amis_signalements for select using (is_admin());

-- 4. Activité par jour : points (plafonnés à 100 par jour) -> série et classement
create table if not exists activite_jour (
  user_id uuid not null references auth.users(id) on delete cascade,
  jour date not null,
  points int not null default 0,
  quiz_faits int not null default 0,
  primary key (user_id, jour)
);
alter table activite_jour enable row level security;
drop policy if exists "Lire mon activite" on activite_jour;
create policy "Lire mon activite" on activite_jour for select using (user_id = auth.uid());

-- 5. Défis : un quiz, deux élèves, 48 h pour répondre (chacun quand il peut)
create table if not exists defis (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quiz(id) on delete cascade,
  createur uuid not null references auth.users(id) on delete cascade,
  adversaire uuid not null references auth.users(id) on delete cascade,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'refuse')),
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null default now() + interval '48 hours',
  check (createur <> adversaire)
);
alter table defis enable row level security;
drop policy if exists "Lire mes defis" on defis;
create policy "Lire mes defis" on defis for select using (auth.uid() in (createur, adversaire));

create table if not exists defi_manches (
  defi_id uuid not null references defis(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score int not null,
  total int not null,
  fait_le timestamptz not null default now(),
  primary key (defi_id, user_id)
);
alter table defi_manches enable row level security;
drop policy if exists "Lire mes manches" on defi_manches;
create policy "Lire mes manches" on defi_manches for select using (user_id = auth.uid());

-- ============================================================
-- Fonctions internes (non appelables depuis le site)
-- ============================================================
create or replace function amis_pseudo_defaut(p_uid uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare n text; mots text[];
begin
  select nom_complet into n from profils where id = p_uid;
  n := trim(coalesce(n, ''));
  if n = '' then return 'Élève'; end if;
  mots := regexp_split_to_array(n, '\s+');
  if array_length(mots, 1) = 1 then return left(mots[1], 20); end if;
  return left(mots[1], 20) || ' ' || upper(left(mots[array_length(mots, 1)], 1)) || '.';
end $$;

create or replace function ajouter_points(p_uid uuid, p_pts int, p_quiz int default 0)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into activite_jour (user_id, jour, points, quiz_faits)
  values (p_uid, current_date, least(greatest(p_pts, 0), 100), p_quiz)
  on conflict (user_id, jour) do update
    set points = least(100, activite_jour.points + greatest(p_pts, 0)),
        quiz_faits = activite_jour.quiz_faits + p_quiz;
  update amis_profils set vu_le = now() where user_id = p_uid;
end $$;

create or replace function serie_jours(p_uid uuid)
returns int language sql stable security definer set search_path = public as $$
  with j as (
    select jour, jour - (row_number() over (order by jour))::int as g
    from activite_jour where user_id = p_uid and points > 0
  ), ile as (select g, max(jour) as fin, count(*) as n from j group by g)
  select coalesce((select n from ile where fin >= current_date - 1 order by fin desc limit 1), 0)::int
$$;

create or replace function points_semaine(p_uid uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(points), 0)::int from activite_jour
  where user_id = p_uid and jour >= date_trunc('week', current_date)::date
$$;

create or replace function sont_amis(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from amities
    where statut = 'acceptee' and ((demandeur = a and destinataire = b) or (demandeur = b and destinataire = a)))
$$;

-- 6. Points gagnés automatiquement (calculés ici, pas par le navigateur)
create or replace function trg_points_quiz() returns trigger
language plpgsql security definer set search_path = public as $$
declare deja int; pts int;
begin
  select count(*) into deja from quiz_resultats
   where user_id = new.user_id and quiz_id = new.quiz_id and fait_le::date = current_date and id <> new.id;
  if deja < 2 and new.total > 0 then
    pts := 3 + new.score * 2 + case when new.score * 100 >= 80 * new.total then 5 else 0 end;
    perform ajouter_points(new.user_id, pts, 1);
  end if;
  return new;
end $$;
drop trigger if exists points_quiz on quiz_resultats;
create trigger points_quiz after insert on quiz_resultats for each row execute function trg_points_quiz();

create or replace function trg_points_ressource() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.vu and (tg_op = 'INSERT' or not coalesce(old.vu, false)) then
    perform ajouter_points(new.user_id, 5, 0);
  end if;
  return new;
end $$;
drop trigger if exists points_ressource on progression_utilisateur;
create trigger points_ressource after insert or update on progression_utilisateur for each row execute function trg_points_ressource();

-- ============================================================
-- Fonctions appelées par le site
-- ============================================================
create or replace function amis_assurer_profil()
returns amis_profils language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r amis_profils; c text; i int;
begin
  if uid is null then raise exception 'non_connecte'; end if;
  select * into r from amis_profils where user_id = uid;
  if found then return r; end if;
  loop
    c := '';
    for i in 1..8 loop c := c || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1); end loop;
    begin
      insert into amis_profils (user_id, code, pseudo) values (uid, c, amis_pseudo_defaut(uid)) returning * into r;
      return r;
    exception when unique_violation then
      select * into r from amis_profils where user_id = uid;
      if found then return r; end if;
    end;
  end loop;
end $$;

create or replace function amis_modifier_profil(p_pseudo text, p_discret boolean)
returns void language plpgsql security definer set search_path = public as $$
declare p text := trim(coalesce(p_pseudo, ''));
begin
  perform amis_assurer_profil();
  if char_length(p) < 2 or char_length(p) > 30 then raise exception 'pseudo_invalide'; end if;
  update amis_profils set pseudo = p, discret = coalesce(p_discret, false) where user_id = auth.uid();
end $$;

create or replace function amis_etat()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me amis_profils;
begin
  me := amis_assurer_profil();
  update amis_profils set vu_le = now() where user_id = uid;
  return jsonb_build_object(
    'moi', jsonb_build_object('code', me.code, 'pseudo', me.pseudo, 'discret', me.discret,
                              'serie', serie_jours(uid), 'points_semaine', points_semaine(uid)),
    'amis', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', p.user_id, 'pseudo', p.pseudo, 'discret', p.discret,
        'serie', case when p.discret then null else serie_jours(p.user_id) end,
        'points_semaine', case when p.discret then null else points_semaine(p.user_id) end,
        'vu_le', case when p.discret then null else p.vu_le end) order by p.pseudo)
      from amities a
      join amis_profils p on p.user_id = case when a.demandeur = uid then a.destinataire else a.demandeur end
      where a.statut = 'acceptee' and uid in (a.demandeur, a.destinataire)), '[]'::jsonb),
    'recues', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'pseudo', p.pseudo) order by a.cree_le)
      from amities a join amis_profils p on p.user_id = a.demandeur
      where a.statut = 'en_attente' and a.destinataire = uid), '[]'::jsonb),
    'envoyees', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'pseudo', p.pseudo) order by a.cree_le)
      from amities a join amis_profils p on p.user_id = a.destinataire
      where a.statut = 'en_attente' and a.demandeur = uid), '[]'::jsonb)
  );
end $$;

create or replace function amis_ajouter(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c text; cible uuid; am amities; n int;
begin
  perform amis_assurer_profil();
  c := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  select user_id into cible from amis_profils where code = c;
  if cible is null then raise exception 'code_inconnu'; end if;
  if cible = uid then raise exception 'soi_meme'; end if;
  if exists (select 1 from amis_blocages where (bloqueur = uid and bloque = cible) or (bloqueur = cible and bloque = uid)) then
    raise exception 'impossible';
  end if;
  select * into am from amities
   where (demandeur = uid and destinataire = cible) or (demandeur = cible and destinataire = uid);
  if found then
    if am.statut = 'acceptee' then raise exception 'deja_amis'; end if;
    if am.demandeur = uid then raise exception 'deja_envoye'; end if;
    update amities set statut = 'acceptee' where id = am.id;
    return 'accepte';
  end if;
  select count(*) into n from amities where uid in (demandeur, destinataire);
  if n >= 50 then raise exception 'limite'; end if;
  insert into amities (demandeur, destinataire) values (uid, cible);
  return 'envoye';
end $$;

create or replace function amis_repondre(p_id uuid, p_accepter boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_accepter then
    update amities set statut = 'acceptee' where id = p_id and destinataire = auth.uid() and statut = 'en_attente';
  else
    delete from amities where id = p_id and destinataire = auth.uid() and statut = 'en_attente';
  end if;
end $$;

create or replace function amis_retirer(p_ami uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from amities where (demandeur = auth.uid() and destinataire = p_ami) or (demandeur = p_ami and destinataire = auth.uid());
end $$;

create or replace function amis_annuler(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from amities where id = p_id and demandeur = auth.uid() and statut = 'en_attente';
end $$;

create or replace function amis_signaler(p_cible uuid, p_motif text, p_bloquer boolean)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null or p_cible is null or p_cible = uid then return; end if;
  insert into amis_signalements (auteur, cible, motif) values (uid, p_cible, left(coalesce(p_motif, ''), 300));
  if p_bloquer then
    insert into amis_blocages (bloqueur, bloque) values (uid, p_cible) on conflict do nothing;
    delete from amities where (demandeur = uid and destinataire = p_cible) or (demandeur = p_cible and destinataire = uid);
  end if;
end $$;

create or replace function amis_classement()
returns table (user_id uuid, pseudo text, points int, serie int, moi boolean)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  perform amis_assurer_profil();
  return query
    select p.user_id, p.pseudo, points_semaine(p.user_id), serie_jours(p.user_id), p.user_id = uid
    from amis_profils p
    where p.user_id = uid
       or (not p.discret and exists (
            select 1 from amities a
            where a.statut = 'acceptee' and uid in (a.demandeur, a.destinataire) and p.user_id in (a.demandeur, a.destinataire)))
    order by 3 desc, 2;
end $$;

-- ---------- Défis ----------
create or replace function defi_creer(p_ami uuid, p_quiz uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); q quiz; id uuid; n int;
begin
  if uid is null then raise exception 'non_connecte'; end if;
  if not sont_amis(uid, p_ami) then raise exception 'pas_ami'; end if;
  select * into q from quiz where quiz.id = p_quiz and statut = 'publie';
  if not found or (q.acces <> 'gratuit' and mon_palier() = 'gratuit') then raise exception 'quiz_indisponible'; end if;
  if not exists (select 1 from quiz_questions where quiz_id = p_quiz) then raise exception 'quiz_indisponible'; end if;
  select count(*) into n from defis where createur = uid and expire_le > now() and statut = 'en_cours';
  if n >= 10 then raise exception 'trop_de_defis'; end if;
  insert into defis (quiz_id, createur, adversaire) values (p_quiz, uid, p_ami) returning defis.id into id;
  return id;
end $$;

create or replace function defi_questions(p_defi uuid)
returns table (ordre int, enonce text, options jsonb)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); d defis; q quiz;
begin
  select * into d from defis where id = p_defi and uid in (createur, adversaire);
  if not found then raise exception 'defi_introuvable'; end if;
  if d.statut = 'refuse' or d.expire_le < now() then raise exception 'defi_termine'; end if;
  if exists (select 1 from defi_manches where defi_id = p_defi and user_id = uid) then raise exception 'deja_joue'; end if;
  select * into q from quiz where quiz.id = d.quiz_id;
  if q.acces <> 'gratuit' and mon_palier() = 'gratuit' then raise exception 'quiz_reserve'; end if;
  return query select qq.ordre, qq.enonce, qq.options from quiz_questions qq where qq.quiz_id = d.quiz_id order by qq.ordre;
end $$;

create or replace function defi_repondre(p_defi uuid, p_reponses int[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); d defis; sc int := 0; tot int := 0; i int := 0; r record;
        bonnes int[] := '{}'; autre defi_manches; autre_id uuid;
begin
  select * into d from defis where id = p_defi and uid in (createur, adversaire);
  if not found then raise exception 'defi_introuvable'; end if;
  if d.statut = 'refuse' or d.expire_le < now() then raise exception 'defi_termine'; end if;
  if exists (select 1 from defi_manches where defi_id = p_defi and user_id = uid) then raise exception 'deja_joue'; end if;
  for r in select bonne_reponse from quiz_questions where quiz_id = d.quiz_id order by ordre loop
    i := i + 1; tot := tot + 1; bonnes := bonnes || r.bonne_reponse;
    if p_reponses is not null and p_reponses[i] is not null and p_reponses[i] = r.bonne_reponse then sc := sc + 1; end if;
  end loop;
  insert into defi_manches (defi_id, user_id, score, total) values (p_defi, uid, sc, tot);
  perform ajouter_points(uid, 10, 0);
  autre_id := case when d.createur = uid then d.adversaire else d.createur end;
  select * into autre from defi_manches where defi_id = p_defi and user_id = autre_id;
  if found then
    if sc > autre.score then perform ajouter_points(uid, 15, 0);
    elsif autre.score > sc then perform ajouter_points(autre_id, 15, 0); end if;
  end if;
  return jsonb_build_object('score', sc, 'total', tot, 'bonnes', to_jsonb(bonnes));
end $$;

create or replace function defi_refuser(p_defi uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update defis set statut = 'refuse'
   where id = p_defi and adversaire = auth.uid()
     and not exists (select 1 from defi_manches m where m.defi_id = defis.id and m.user_id = auth.uid());
end $$;

create or replace function defis_etat()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  return coalesce((
    select jsonb_agg(x order by (x->>'cree_le') desc) from (
      select jsonb_build_object(
        'id', d.id, 'cree_le', d.cree_le, 'expire_le', d.expire_le,
        'quiz_titre', q.titre, 'matiere', m.nom, 'chapitre', c.nom,
        'role', case when d.createur = uid then 'createur' else 'adversaire' end,
        'autre', p.pseudo,
        'etat', case
          when d.statut = 'refuse' then 'refuse'
          when mm.user_id is not null and om.user_id is not null then 'termine'
          when mm.user_id is null and d.expire_le < now() then 'expire'
          when mm.user_id is null then 'a_jouer'
          when d.expire_le < now() then 'expire'
          else 'attente' end,
        'mon_score', mm.score, 'mon_total', mm.total,
        'son_score', case when mm.user_id is not null then om.score end,
        'gagnant', case when mm.user_id is not null and om.user_id is not null then
                      case when mm.score > om.score then 'moi' when om.score > mm.score then 'lui' else 'egalite' end end
      ) as x
      from defis d
      join quiz q on q.id = d.quiz_id
      left join chapitres c on c.id = q.chapitre_id
      left join matieres m on m.id = c.matiere_id
      join amis_profils p on p.user_id = case when d.createur = uid then d.adversaire else d.createur end
      left join defi_manches mm on mm.defi_id = d.id and mm.user_id = uid
      left join defi_manches om on om.defi_id = d.id and om.user_id <> uid
      where uid in (d.createur, d.adversaire) and d.cree_le > now() - interval '30 days'
      limit 40
    ) t), '[]'::jsonb);
end $$;

-- Droits : seules les fonctions « site » sont appelables par un élève connecté
revoke all on function amis_pseudo_defaut(uuid), ajouter_points(uuid, int, int), serie_jours(uuid), points_semaine(uuid), sont_amis(uuid, uuid) from public, anon, authenticated;
revoke all on function amis_assurer_profil(), amis_modifier_profil(text, boolean), amis_etat(), amis_ajouter(text),
  amis_repondre(uuid, boolean), amis_retirer(uuid), amis_annuler(uuid), amis_signaler(uuid, text, boolean), amis_classement(),
  defi_creer(uuid, uuid), defi_questions(uuid), defi_repondre(uuid, int[]), defi_refuser(uuid), defis_etat() from public, anon;
grant execute on function amis_assurer_profil(), amis_modifier_profil(text, boolean), amis_etat(), amis_ajouter(text),
  amis_repondre(uuid, boolean), amis_retirer(uuid), amis_annuler(uuid), amis_signaler(uuid, text, boolean), amis_classement(),
  defi_creer(uuid, uuid), defi_questions(uuid), defi_repondre(uuid, int[]), defi_refuser(uuid), defis_etat() to authenticated;
