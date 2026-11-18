-- ============================================================
-- 19 - « Mon cercle » lot 2 : badges et objectifs collectifs
-- Supabase -> SQL Editor -> New query -> coller -> Run
-- À lancer APRÈS le script 18. Sans danger si relancé (ajoute des tables et remplace
-- deux fonctions du script 18 par des versions qui gèrent aussi les badges).
--
-- Badges (calculés ici, jamais par le navigateur) :
--   regulier 5 jours d'affilée | genie 10 quiz réussis (70 % ou plus) | travailleur 20 cours
--   ou exercices terminés | champion 5 défis gagnés | esprit_equipe 1 objectif collectif
--   atteint | perseverant 30 jours d'activité
-- Objectifs collectifs : un groupe d'amis se fixe un total de points à atteindre dans la
--   semaine (du lundi au dimanche). Tous les membres contribuent avec leurs points.
-- ============================================================

create table if not exists badges_obtenus (
  user_id uuid not null references auth.users(id) on delete cascade,
  badge text not null,
  obtenu_le timestamptz not null default now(),
  primary key (user_id, badge)
);
alter table badges_obtenus enable row level security;
drop policy if exists "Lire mes badges" on badges_obtenus;
create policy "Lire mes badges" on badges_obtenus for select using (user_id = auth.uid());

create table if not exists objectifs (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  createur uuid not null references auth.users(id) on delete cascade,
  cible int not null check (cible between 100 and 5000),
  debut date not null,
  fin date not null,
  cree_le timestamptz not null default now()
);
create table if not exists objectif_membres (
  objectif_id uuid not null references objectifs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  statut text not null default 'invite' check (statut in ('invite', 'membre')),
  primary key (objectif_id, user_id)
);
alter table objectifs enable row level security;
alter table objectif_membres enable row level security;
drop policy if exists "Lire mes membres" on objectif_membres;
create policy "Lire mes membres" on objectif_membres for select using (user_id = auth.uid());
drop policy if exists "Lire mes objectifs" on objectifs;
create policy "Lire mes objectifs" on objectifs for select
  using (exists (select 1 from objectif_membres m where m.objectif_id = objectifs.id and m.user_id = auth.uid()));

-- ---------- Fonctions internes ----------
create or replace function objectif_total(p_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(a.points), 0)::int
  from objectifs o
  join objectif_membres m on m.objectif_id = o.id and m.statut = 'membre'
  join activite_jour a on a.user_id = m.user_id and a.jour between o.debut and o.fin
  where o.id = p_id
$$;

create or replace function badges_progres(p_uid uuid)
returns table (cle text, progres int, cible int)
language sql stable security definer set search_path = public as $$
  select 'regulier', serie_jours(p_uid), 5
  union all select 'genie', (select count(*)::int from quiz_resultats where user_id = p_uid and total > 0 and score * 100 >= 70 * total), 10
  union all select 'travailleur', (select count(*)::int from progression_utilisateur where user_id = p_uid and vu), 20
  union all select 'champion', (select count(*)::int from defi_manches a join defi_manches b on b.defi_id = a.defi_id and b.user_id <> a.user_id
                                where a.user_id = p_uid and a.score > b.score), 5
  union all select 'esprit_equipe', (select count(*)::int from objectif_membres m join objectifs o on o.id = m.objectif_id
                                     where m.user_id = p_uid and m.statut = 'membre' and objectif_total(o.id) >= o.cible), 1
  union all select 'perseverant', (select count(*)::int from activite_jour where user_id = p_uid and points > 0), 30
$$;

create or replace function badges_maj(p_uid uuid)
returns void language sql security definer set search_path = public as $$
  insert into badges_obtenus (user_id, badge)
  select p_uid, cle from badges_progres(p_uid) where progres >= cible
  on conflict do nothing
$$;

-- Remplace la fonction du script 18 : même comportement + vérification des badges
create or replace function ajouter_points(p_uid uuid, p_pts int, p_quiz int default 0)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into activite_jour (user_id, jour, points, quiz_faits)
  values (p_uid, current_date, least(greatest(p_pts, 0), 100), p_quiz)
  on conflict (user_id, jour) do update
    set points = least(100, activite_jour.points + greatest(p_pts, 0)),
        quiz_faits = activite_jour.quiz_faits + p_quiz;
  update amis_profils set vu_le = now() where user_id = p_uid;
  perform badges_maj(p_uid);
end $$;

-- Remplace amis_etat du script 18 : ajoute les badges (masqués pour les amis en mode discret)
create or replace function amis_etat()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me amis_profils;
begin
  me := amis_assurer_profil();
  update amis_profils set vu_le = now() where user_id = uid;
  perform badges_maj(uid);
  return jsonb_build_object(
    'moi', jsonb_build_object('code', me.code, 'pseudo', me.pseudo, 'discret', me.discret,
                              'serie', serie_jours(uid), 'points_semaine', points_semaine(uid),
                              'badges', coalesce((select jsonb_agg(badge order by obtenu_le) from badges_obtenus where user_id = uid), '[]'::jsonb)),
    'amis', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', p.user_id, 'pseudo', p.pseudo, 'discret', p.discret,
        'serie', case when p.discret then null else serie_jours(p.user_id) end,
        'points_semaine', case when p.discret then null else points_semaine(p.user_id) end,
        'vu_le', case when p.discret then null else p.vu_le end,
        'badges', case when p.discret then '[]'::jsonb
                  else coalesce((select jsonb_agg(badge order by obtenu_le) from badges_obtenus b where b.user_id = p.user_id), '[]'::jsonb) end
      ) order by p.pseudo)
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

-- ---------- Fonctions appelées par le site ----------
create or replace function badges_etat()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'non_connecte'; end if;
  perform badges_maj(uid);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'cle', p.cle, 'cible', p.cible, 'progres', least(p.progres, p.cible),
      'obtenu', b.badge is not null, 'obtenu_le', b.obtenu_le) order by p.cible)
    from badges_progres(uid) p left join badges_obtenus b on b.user_id = uid and b.badge = p.cle), '[]'::jsonb);
end $$;

create or replace function objectif_creer(p_nom text, p_cible int, p_amis uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); nom text := trim(coalesce(p_nom, '')); id uuid; a uuid; debut date := date_trunc('week', current_date)::date;
begin
  if uid is null then raise exception 'non_connecte'; end if;
  perform amis_assurer_profil();
  if char_length(nom) < 2 or char_length(nom) > 40 then raise exception 'nom_invalide'; end if;
  if p_cible is null or p_cible < 100 or p_cible > 5000 then raise exception 'cible_invalide'; end if;
  if p_amis is null or coalesce(array_length(p_amis, 1), 0) < 1 or array_length(p_amis, 1) > 5 then raise exception 'amis_invalides'; end if;
  if (select count(*) from objectifs where createur = uid and fin >= current_date) >= 3 then raise exception 'trop_d_objectifs'; end if;
  foreach a in array p_amis loop
    if not sont_amis(uid, a) then raise exception 'pas_ami'; end if;
  end loop;
  insert into objectifs (nom, createur, cible, debut, fin) values (nom, uid, p_cible, debut, debut + 6) returning objectifs.id into id;
  insert into objectif_membres (objectif_id, user_id, statut) values (id, uid, 'membre');
  insert into objectif_membres (objectif_id, user_id) select id, x from (select distinct unnest(p_amis) as x) t where x <> uid;
  return id;
end $$;

create or replace function objectif_repondre(p_id uuid, p_accepter boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_accepter then
    update objectif_membres set statut = 'membre'
     where objectif_id = p_id and user_id = auth.uid() and statut = 'invite'
       and exists (select 1 from objectifs o where o.id = p_id and o.fin >= current_date);
  else
    delete from objectif_membres where objectif_id = p_id and user_id = auth.uid() and statut = 'invite';
  end if;
end $$;

create or replace function objectif_quitter(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if exists (select 1 from objectifs where id = p_id and createur = uid) then
    delete from objectifs where id = p_id;
  else
    delete from objectif_membres where objectif_id = p_id and user_id = uid;
  end if;
end $$;

create or replace function objectifs_etat()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  return coalesce((
    select jsonb_agg(x order by (x->>'debut') desc, (x->>'nom')) from (
      select jsonb_build_object(
        'id', o.id, 'nom', o.nom, 'cible', o.cible, 'debut', o.debut, 'fin', o.fin,
        'createur', o.createur = uid, 'mon_statut', me.statut,
        'createur_pseudo', (select pseudo from amis_profils where user_id = o.createur),
        'total', objectif_total(o.id),
        'atteint', objectif_total(o.id) >= o.cible,
        'termine', o.fin < current_date,
        'jours_restants', greatest(0, o.fin - current_date + 1),
        'membres', (
          select jsonb_agg(jsonb_build_object(
            'pseudo', p.pseudo, 'statut', m.statut, 'moi', m.user_id = uid,
            'points', case when m.statut = 'membre' and (not p.discret or m.user_id = uid)
                      then (select coalesce(sum(a.points), 0) from activite_jour a where a.user_id = m.user_id and a.jour between o.debut and o.fin) end
          ) order by p.pseudo)
          from objectif_membres m join amis_profils p on p.user_id = m.user_id where m.objectif_id = o.id)
      ) as x
      from objectifs o
      join objectif_membres me on me.objectif_id = o.id and me.user_id = uid
      where o.fin >= current_date - 14
      limit 20
    ) t), '[]'::jsonb);
end $$;

revoke all on function objectif_total(uuid), badges_progres(uuid), badges_maj(uuid) from public, anon, authenticated;
revoke all on function ajouter_points(uuid, int, int) from public, anon, authenticated;
revoke all on function badges_etat(), objectif_creer(text, int, uuid[]), objectif_repondre(uuid, boolean), objectif_quitter(uuid), objectifs_etat() from public, anon;
grant execute on function amis_etat(), badges_etat(), objectif_creer(text, int, uuid[]), objectif_repondre(uuid, boolean), objectif_quitter(uuid), objectifs_etat() to authenticated;
