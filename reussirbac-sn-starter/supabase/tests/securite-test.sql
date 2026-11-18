-- Tests du script 22 (sécurité). Base de TEST uniquement.
\set ON_ERROR_STOP on
\set QUIET on
create or replace function pg_temp.ok(l text, c boolean) returns void language plpgsql as $$ begin if c is not true then raise exception 'ECHEC : %', l; end if; raise notice 'OK  %', l; end $$;
create or replace function pg_temp.erreur(l text, q text, attendu text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then
    if sqlerrm like '%'||attendu||'%' then raise notice 'OK  %', l; return; end if;
    raise exception 'ECHEC : % (erreur inattendue : %)', l, sqlerrm;
  end;
  raise exception 'ECHEC : % (aucune erreur)', l;
end $$;
truncate quiz_resultats, messages_contact, quiz, chapitres, matieres, niveaux, activite_jour, amis_profils cascade;
delete from auth.users;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-00000000000a','a@t');
insert into niveaux(id,nom) values ('10000000-0000-0000-0000-000000000001','TS2');
insert into matieres(id,niveau_id,nom) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Maths');
insert into chapitres(id,matiere_id,nom) values ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Limites');
insert into quiz(id,chapitre_id,titre,statut,acces) values ('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Q','publie','gratuit');

-- visiteur non connecté
set role anon;
select pg_temp.ok('anon lit le catalogue', (select count(*) from niveaux) = 1);
select pg_temp.erreur('anon ne lit pas les profils', 'select * from profils', 'permission denied');
select pg_temp.erreur('anon ne lit pas les transactions', 'select * from transactions', 'permission denied');
select pg_temp.erreur('anon ne peut pas appeler admin_signalements', 'select * from admin_signalements()', 'permission denied');
select pg_temp.erreur('anon ne peut pas appeler modifier_mon_nom', $$select modifier_mon_nom('x')$$, 'permission denied');
select pg_temp.erreur('anon ne peut pas écrire un quiz', $$insert into quiz_resultats(user_id,quiz_id,score,total) values (gen_random_uuid(),'50000000-0000-0000-0000-000000000001',1,1)$$, 'permission denied');
select pg_temp.erreur('anon ne peut pas vider une table', 'truncate quiz', 'permission denied');
-- contact : valide, puis spam bloqué
insert into messages_contact(nom,email,sujet,message) values ('Awa','awa@x.sn','Test','Bonjour, ceci est un message');
insert into messages_contact(nom,email,sujet,message) values ('Awa','awa@x.sn','Test','Bonjour, ceci est un message 2');
insert into messages_contact(nom,email,sujet,message) values ('Awa','AWA@x.sn','Test','Bonjour, ceci est un message 3');
select pg_temp.erreur('4e message en 1 h refusé', $$insert into messages_contact(nom,email,sujet,message) values ('Awa','awa@x.sn','Test','Bonjour, ceci est un message 4')$$, 'trop_de_messages');
select pg_temp.erreur('message trop court refusé', $$insert into messages_contact(nom,email,sujet,message) values ('Bob','bob@x.sn','T','court')$$, 'row-level security');

-- compte connecté
reset role; set role authenticated; set app.uid = '00000000-0000-0000-0000-00000000000a';
select pg_temp.erreur('truncate refusé à un compte connecté', 'truncate quiz_resultats', 'permission denied');
select pg_temp.erreur('score > total refusé', $$insert into quiz_resultats(user_id,quiz_id,score,total) values (auth.uid(),'50000000-0000-0000-0000-000000000001',9,3)$$, 'quiz_resultats_coherence');
select pg_temp.erreur('score négatif refusé', $$insert into quiz_resultats(user_id,quiz_id,score,total) values (auth.uid(),'50000000-0000-0000-0000-000000000001',-1,3)$$, 'quiz_resultats_coherence');
select pg_temp.erreur('total absurde refusé', $$insert into quiz_resultats(user_id,quiz_id,score,total) values (auth.uid(),'50000000-0000-0000-0000-000000000001',1000,1000)$$, 'quiz_resultats_coherence');
select pg_temp.erreur('usurpation refusée', $$insert into quiz_resultats(user_id,quiz_id,score,total) values (gen_random_uuid(),'50000000-0000-0000-0000-000000000001',1,3)$$, 'row-level security');
insert into quiz_resultats(user_id,quiz_id,score,total,fait_le) values (auth.uid(),'50000000-0000-0000-0000-000000000001',3,3,'2020-01-01');
select pg_temp.ok('date imposée par le serveur', (select fait_le > now() - interval '1 minute' from quiz_resultats limit 1));
do $$ begin for i in 1..29 loop insert into quiz_resultats(user_id,quiz_id,score,total) values (auth.uid(),'50000000-0000-0000-0000-000000000001',1,3); end loop; end $$;
select pg_temp.erreur('31e résultat en 1 h refusé', $$insert into quiz_resultats(user_id,quiz_id,score,total) values (auth.uid(),'50000000-0000-0000-0000-000000000001',1,3)$$, 'trop_de_resultats');
select pg_temp.erreur('fonction de paiement non appelable', $$select activer_abonnement('x',1,'y')$$, 'permission denied');
select pg_temp.erreur('fonction de déclencheur non appelable', $$select trg_points_quiz()$$, 'permission denied');
select pg_temp.erreur('un élève ne lit pas les messages', 'select 1/(count(*)) from messages_contact', 'division by zero');
reset role;
\echo 'TOUS LES TESTS SÉCURITÉ OK'
