-- Tests de la modération Mon cercle (scripts 18, 19, 20 chargés). Base de TEST uniquement.
\set ON_ERROR_STOP on
\set QUIET on
truncate amis_signalements, amis_blocages, amities, amis_profils, admins, profils, auth.users cascade;
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','a@t'),('00000000-0000-0000-0000-00000000000b','b@t'),
 ('00000000-0000-0000-0000-00000000000c','c@t'),('00000000-0000-0000-0000-00000000000d','adm@t');
insert into profils(id,nom_complet) values
 ('00000000-0000-0000-0000-00000000000a','Awa Ndiaye'),('00000000-0000-0000-0000-00000000000b','Moussa Diop'),
 ('00000000-0000-0000-0000-00000000000c','Fatou Sow'),('00000000-0000-0000-0000-00000000000d','Admin');
insert into admins values ('00000000-0000-0000-0000-00000000000d');
grant usage on schema public, auth to authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
create or replace function pg_temp.ok(l text, c boolean) returns void language plpgsql as $$ begin if c is not true then raise exception 'ECHEC : %', l; end if; raise notice 'OK  %', l; end $$;
create or replace function pg_temp.erreur(l text, q text, attendu text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then
    if sqlerrm like '%'||attendu||'%' then raise notice 'OK  %', l; return; end if;
    raise exception 'ECHEC : % (erreur inattendue : %)', l, sqlerrm;
  end;
  raise exception 'ECHEC : % (aucune erreur)', l;
end $$;
set app.uid = '00000000-0000-0000-0000-00000000000b';
select amis_assurer_profil();
select code as codeb from amis_profils where user_id='00000000-0000-0000-0000-00000000000b' \gset
set app.uid = '00000000-0000-0000-0000-00000000000a';
select amis_ajouter(:'codeb');
set app.uid = '00000000-0000-0000-0000-00000000000b';
select amis_repondre(id, true) from amities limit 1;
set app.uid = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok('A et B sont amis', sont_amis('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b'));
select amis_signaler('00000000-0000-0000-0000-00000000000b', 'Pseudo inapproprié', false);
set app.uid = '00000000-0000-0000-0000-00000000000c';
select amis_signaler('00000000-0000-0000-0000-00000000000b', 'Harcèlement', true);

-- un élève ordinaire n'accède pas aux fonctions admin
set role authenticated;
select pg_temp.erreur('élève refusé : liste', $$select * from admin_signalements()$$, 'acces_refuse');
select pg_temp.erreur('élève refusé : suspension', $$select admin_cercle_suspendre('00000000-0000-0000-0000-00000000000b', true)$$, 'acces_refuse');
select pg_temp.erreur('élève refusé : statut', $$select admin_signalement_statut(gen_random_uuid(), 'traite')$$, 'acces_refuse');
reset role;

set app.uid = '00000000-0000-0000-0000-00000000000d';
select pg_temp.ok('admin voit 2 signalements nouveaux', (select count(*) from admin_signalements()) = 2);
select pg_temp.ok('compteur contre la cible = 2', (select min(cible_nb_signalements) from admin_signalements()) = 2);
select pg_temp.ok('noms visibles', exists (select 1 from admin_signalements() where cible_nom = 'Moussa Diop' and auteur_nom = 'Awa Ndiaye'));
select admin_signalement_statut(id, 'traite') from amis_signalements where motif = 'Pseudo inapproprié';
select pg_temp.ok('1 nouveau restant', (select count(*) from admin_signalements('nouveau')) = 1);
select pg_temp.ok('1 traité avec date', (select count(*) from admin_signalements('traite') where traite_le is not null) = 1);
select pg_temp.ok('tous = 2', (select count(*) from admin_signalements('tous')) = 2);
select pg_temp.erreur('statut invalide', $$select admin_signalement_statut(gen_random_uuid(), 'zzz')$$, 'statut_invalide');
select admin_signalement_statut(id, 'nouveau') from amis_signalements where motif = 'Pseudo inapproprié';
select pg_temp.ok('remise à nouveau efface la date', (select traite_le is null from amis_signalements where motif = 'Pseudo inapproprié'));

-- suspension
select admin_cercle_suspendre('00000000-0000-0000-0000-00000000000b', true);
select pg_temp.ok('B suspendu', (select suspendu from amis_profils where user_id='00000000-0000-0000-0000-00000000000b'));
select pg_temp.ok('amitiés de B coupées', not exists (select 1 from amities where '00000000-0000-0000-0000-00000000000b' in (demandeur, destinataire)));
select pg_temp.ok('signalement indique suspendu', (select bool_and(cible_suspendu) from admin_signalements()));
set app.uid = '00000000-0000-0000-0000-00000000000a';
select pg_temp.erreur('A ne peut plus ajouter B', format($$select amis_ajouter(%L)$$, :'codeb'), 'compte_suspendu');
-- levée de la suspension
set app.uid = '00000000-0000-0000-0000-00000000000d';
select admin_cercle_suspendre('00000000-0000-0000-0000-00000000000b', false);
select pg_temp.ok('B réactivé', not (select suspendu from amis_profils where user_id='00000000-0000-0000-0000-00000000000b'));
set app.uid = '00000000-0000-0000-0000-00000000000a';
select amis_ajouter(:'codeb');
select pg_temp.ok('A peut de nouveau ajouter B', exists (select 1 from amities where '00000000-0000-0000-0000-00000000000b' in (demandeur, destinataire)));
-- suspension d'un élève sans profil cercle
set app.uid = '00000000-0000-0000-0000-00000000000d';
select admin_cercle_suspendre('00000000-0000-0000-0000-00000000000c', true);
select pg_temp.ok('profil créé et suspendu pour C', (select suspendu from amis_profils where user_id='00000000-0000-0000-0000-00000000000c'));
\echo TOUS LES TESTS OK
