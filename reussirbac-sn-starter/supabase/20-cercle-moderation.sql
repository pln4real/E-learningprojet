-- =====================================================================
-- 20 : Mon cercle - modération (écran admin « Signalements »)
-- À lancer APRÈS les scripts 18 et 19. Relançable sans risque.
-- =====================================================================

-- 1. Suivi des signalements : statut + qui a traité et quand
alter table amis_signalements add column if not exists statut text not null default 'nouveau';
alter table amis_signalements add column if not exists traite_le timestamptz;
alter table amis_signalements add column if not exists traite_par uuid references auth.users(id) on delete set null;
alter table amis_signalements drop constraint if exists amis_signalements_statut_check;
alter table amis_signalements add constraint amis_signalements_statut_check check (statut in ('nouveau', 'traite', 'classe'));

-- 2. Suspension d'un élève du cercle
alter table amis_profils add column if not exists suspendu boolean not null default false;
alter table amis_profils add column if not exists suspendu_le timestamptz;

-- Un élève suspendu ne peut plus recevoir ni envoyer de demandes d'ami,
-- et ne peut plus être défié (il faut être "ami" pour lancer un défi).
create or replace function trg_amities_suspendus() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from amis_profils where user_id in (new.demandeur, new.destinataire) and suspendu) then
    raise exception 'compte_suspendu';
  end if;
  return new;
end $$;
drop trigger if exists amities_suspendus on amities;
create trigger amities_suspendus before insert or update on amities for each row execute function trg_amities_suspendus();

create or replace function sont_amis(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from amities
    where statut = 'acceptee'
      and ((demandeur = a and destinataire = b) or (demandeur = b and destinataire = a))
  ) and not exists (select 1 from amis_profils where user_id in (a, b) and suspendu);
$$;

-- Le classement n'affiche plus les élèves suspendus
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
       or (not p.discret and not p.suspendu and exists (
            select 1 from amities a
            where a.statut = 'acceptee' and uid in (a.demandeur, a.destinataire) and p.user_id in (a.demandeur, a.destinataire)))
    order by 3 desc, 2;
end $$;

-- 3. Fonctions réservées aux admins
create or replace function admin_signalements(p_statut text default 'nouveau')
returns table (
  id uuid, cree_le timestamptz, motif text, statut text, traite_le timestamptz,
  auteur_id uuid, auteur_pseudo text, auteur_nom text,
  cible_id uuid, cible_pseudo text, cible_nom text,
  cible_nb_signalements int, cible_suspendu boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'acces_refuse'; end if;
  return query
    select s.id, s.cree_le, s.motif, s.statut, s.traite_le,
           s.auteur, ap.pseudo, pa.nom_complet,
           s.cible, cp.pseudo, pc.nom_complet,
           (select count(*)::int from amis_signalements x where x.cible = s.cible),
           coalesce(cp.suspendu, false)
    from amis_signalements s
    left join amis_profils ap on ap.user_id = s.auteur
    left join profils pa on pa.id = s.auteur
    left join amis_profils cp on cp.user_id = s.cible
    left join profils pc on pc.id = s.cible
    where p_statut is null or p_statut = 'tous' or s.statut = p_statut
    order by s.cree_le desc
    limit 300;
end $$;

create or replace function admin_signalement_statut(p_id uuid, p_statut text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'acces_refuse'; end if;
  if p_statut not in ('nouveau', 'traite', 'classe') then raise exception 'statut_invalide'; end if;
  update amis_signalements
     set statut = p_statut,
         traite_le = case when p_statut = 'nouveau' then null else now() end,
         traite_par = case when p_statut = 'nouveau' then null else auth.uid() end
   where id = p_id;
end $$;

create or replace function admin_cercle_suspendre(p_user uuid, p_suspendre boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'acces_refuse'; end if;
  insert into amis_profils (user_id, code, pseudo)
    select p_user, substr(translate(upper(md5(random()::text || p_user::text)), '01', 'XY'), 1, 8), amis_pseudo_defaut(p_user)
    where not exists (select 1 from amis_profils where user_id = p_user);
  update amis_profils
     set suspendu = p_suspendre, suspendu_le = case when p_suspendre then now() else null end
   where user_id = p_user;
  if p_suspendre then
    -- coupe toutes les amitiés en cours et les défis ouverts de cet élève
    delete from amities where p_user in (demandeur, destinataire);
    update defis set statut = 'refuse' where statut = 'en_cours' and p_user in (createur, adversaire);
  end if;
end $$;

revoke all on function admin_signalements(text), admin_signalement_statut(uuid, text), admin_cercle_suspendre(uuid, boolean) from public;
grant execute on function admin_signalements(text), admin_signalement_statut(uuid, text), admin_cercle_suspendre(uuid, boolean) to authenticated;
