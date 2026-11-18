-- Tests de l'Atelier d'entraînement (script 21). Base de TEST uniquement : ce fichier vide des tables.
\set ON_ERROR_STOP on
\set QUIET on
truncate atelier_evaluations, atelier_favoris, ressources, chapitres, matieres, niveaux, abonnes, admins, storage.objects, auth.users cascade;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-00000000000a','a@t'),('00000000-0000-0000-0000-00000000000b','b@t');
insert into niveaux(id,nom) values ('10000000-0000-0000-0000-000000000001','TS2'),('10000000-0000-0000-0000-000000000002','3e');
insert into matieres(id,niveau_id,nom) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Maths'),('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Maths 3e');
insert into chapitres(id,matiere_id,nom) values ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Limites'),('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','Thales');
insert into ressources(id,chapitre_id,type,titre,acces,url_fichier) values
 ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','exercice','Gratuit','gratuit','http://x/ressources/a.pdf'),
 ('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','exercice','Payant','abonne','http://x/ressources/b.pdf'),
 ('40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','annale','Payant annale','abonne','http://x/ressources/c.pdf'),
 ('40000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001','cours','Cours payant','abonne','http://x/ressources/d.pdf');
insert into abonnes values ('00000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-000000000001');
grant usage on schema public, auth to authenticated;
grant all on all tables in schema public to authenticated;
grant usage on schema storage to authenticated, anon;
grant select on storage.objects to authenticated, anon;
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

-- contraintes de la fiche
select pg_temp.erreur('durée trop courte refusée', $$update ressources set duree_min = 1 where id = '40000000-0000-0000-0000-000000000001'$$, 'ressources_duree_check');
select pg_temp.erreur('barème trop grand refusé', $$update ressources set bareme = 99 where id = '40000000-0000-0000-0000-000000000001'$$, 'ressources_bareme_check');
select pg_temp.erreur('difficulté invalide refusée', $$update ressources set difficulte = 5 where id = '40000000-0000-0000-0000-000000000001'$$, 'ressources_difficulte_check');
select pg_temp.erreur('calculatrice invalide refusée', $$update ressources set calculatrice = 'peut-etre' where id = '40000000-0000-0000-0000-000000000001'$$, 'ressources_calculatrice_check');
update ressources set duree_min = 45, bareme = 4, difficulte = 2, calculatrice = 'interdite', url_corrige = 'http://x/ressources/corr-a.pdf' where id = '40000000-0000-0000-0000-000000000001';
select pg_temp.ok('fiche valide enregistrée', (select duree_min = 45 and calculatrice = 'interdite' from ressources where id = '40000000-0000-0000-0000-000000000001'));

-- sujets réservés
set role authenticated;
set app.uid = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok('non abonné : 2 sujets réservés (exercice+annale, cours exclu)', atelier_verrouilles(array['30000000-0000-0000-0000-000000000001']::uuid[], array['exercice','annale']) = 2);
select pg_temp.ok('non abonné : types limités à exercice', atelier_verrouilles(array['30000000-0000-0000-0000-000000000001']::uuid[], array['exercice']) = 1);
set app.uid = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok('abonné : plus rien de réservé', atelier_verrouilles(array['30000000-0000-0000-0000-000000000001']::uuid[], array['exercice','annale']) = 0);
reset role;
set role anon;
select pg_temp.erreur('anonyme ne peut pas appeler la fonction', $$select atelier_verrouilles(array[]::uuid[], array['exercice'])$$, 'permission denied');
reset role;

-- suivi : isolation entre élèves
set role authenticated;
set app.uid = '00000000-0000-0000-0000-00000000000a';
insert into atelier_evaluations(user_id, ressource_id, etat, note, bareme) values ('00000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-000000000001','a_revoir', 2.5, 4);
insert into atelier_favoris(user_id, ressource_id) values ('00000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-000000000001');
select pg_temp.ok('A voit son évaluation', (select count(*) from atelier_evaluations) = 1);
select pg_temp.erreur('A ne peut pas écrire pour B', $$insert into atelier_evaluations(user_id, ressource_id, etat) values ('00000000-0000-0000-0000-00000000000b','40000000-0000-0000-0000-000000000001','reussi')$$, 'row-level security');
select pg_temp.erreur('état invalide refusé', $$update atelier_evaluations set etat = 'genial'$$, 'atelier_evaluations_etat_check');
select pg_temp.erreur('note négative refusée', $$update atelier_evaluations set note = -1$$, 'atelier_evaluations_note_check');
set app.uid = '00000000-0000-0000-0000-00000000000b';
select pg_temp.ok('B ne voit pas l''évaluation de A', (select count(*) from atelier_evaluations) = 0);
select pg_temp.ok('B ne voit pas les favoris de A', (select count(*) from atelier_favoris) = 0);
delete from atelier_favoris;
set app.uid = '00000000-0000-0000-0000-00000000000a';
select pg_temp.ok('B n''a pas supprimé le favori de A', (select count(*) from atelier_favoris) = 1);
reset role;

-- politique de stockage : le corrigé suit les mêmes règles que le sujet
insert into storage.objects(bucket_id, name) values ('ressources','a.pdf'),('ressources','corr-a.pdf'),('ressources','inconnu.pdf');
set role authenticated;
select pg_temp.ok('le sujet et son corrigé sont lisibles, pas un fichier inconnu', (select count(*) from storage.objects) = 2);
reset role;
\echo TOUS LES TESTS OK
