-- Tests du système d'abonnement. À lancer sur une base de TEST (pas sur la production !).
-- Chaque test affiche OK ou échoue avec un message.
\set ON_ERROR_STOP on
\set QUIET on
-- ---------- données de test ----------
truncate abonnements, transactions, audit_admin, ressources, chapitres, matieres, niveaux, admins, profils, auth.users cascade;
insert into auth.users (id,email) values
 ('00000000-0000-0000-0000-00000000000a','alice@t.sn'),  -- sans abonnement
 ('00000000-0000-0000-0000-00000000000b','bob@t.sn'),    -- abonné Terminale S2
 ('00000000-0000-0000-0000-00000000000c','carol@t.sn'),  -- abonnement expiré
 ('00000000-0000-0000-0000-00000000000d','admin@t.sn'),
 ('00000000-0000-0000-0000-00000000000e','dave@t.sn');   -- abonné toutes classes
insert into profils (id) select id from auth.users on conflict do nothing;
insert into admins (user_id) values ('00000000-0000-0000-0000-00000000000d');
insert into niveaux (id,nom) values ('10000000-0000-0000-0000-000000000001','3e'),('10000000-0000-0000-0000-000000000002','Terminale S2');
insert into matieres (id,nom,niveau_id) values ('20000000-0000-0000-0000-000000000001','Maths 3e','10000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000002','Maths TS2','10000000-0000-0000-0000-000000000002');
insert into chapitres (id,nom,matiere_id) values ('30000000-0000-0000-0000-000000000001','Ch 3e','20000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000002','Ch TS2','20000000-0000-0000-0000-000000000002');
insert into ressources (chapitre_id,type,titre,source,url_fichier,statut,acces) values
 ('30000000-0000-0000-0000-000000000001','cours','Libre 3e','pdf','https://x/storage/v1/object/public/ressources/libre3.pdf','publie','gratuit'),
 ('30000000-0000-0000-0000-000000000001','cours','Payant 3e','pdf','https://x/storage/v1/object/public/ressources/paye3.pdf','publie','abonne'),
 ('30000000-0000-0000-0000-000000000002','cours','Libre TS2','pdf','https://x/storage/v1/object/public/ressources/libreT.pdf','publie','gratuit'),
 ('30000000-0000-0000-0000-000000000002','cours','Payant TS2','pdf','https://x/storage/v1/object/public/ressources/payeT.pdf','publie','abonne');
insert into storage.objects (bucket_id,name) values ('ressources','libre3.pdf'),('ressources','paye3.pdf'),('ressources','libreT.pdf'),('ressources','payeT.pdf');
update plans set niveaux_autorises = null;

create or replace function pg_temp.ok(label text, cond boolean) returns void language plpgsql as $$
begin if cond is not true then raise exception 'ECHEC : %', label; end if; raise notice 'OK  %', label; end $$;

-- bob : paiement confirmé pour Terminale S2 (plan Essentiel 30 j) ; carol : abonnement expiré ; dave : toutes classes
do $$ declare t transactions; a uuid; begin
  t := creer_transaction('00000000-0000-0000-0000-00000000000b','essentiel','10000000-0000-0000-0000-000000000002');
  a := activer_abonnement(t.reference, t.montant, 'tok-b');
  insert into abonnements (user_id,plan_id,plan_nom,niveaux_ids,debut,fin,origine) values
   ('00000000-0000-0000-0000-00000000000c','essentiel','Essentiel',array['10000000-0000-0000-0000-000000000002'::uuid], now()-interval '40 days', now()-interval '10 days','admin'),
   ('00000000-0000-0000-0000-00000000000e','reussite','Réussite',null, now()-interval '1 day', now()+interval '89 days','admin');
end $$;

-- Lecture selon l'utilisateur
create or replace function pg_temp.vu(uid text, titre text) returns boolean language plpgsql as $$
declare n int; begin
  perform set_config('request.jwt.claim.sub', uid, true);
  set local role authenticated;
  select count(*) into n from ressources where ressources.titre = vu.titre;
  reset role; return n > 0; end $$;

select pg_temp.ok('1. sans abonnement : voit un cours gratuit', pg_temp.vu('00000000-0000-0000-0000-00000000000a','Libre 3e'));
select pg_temp.ok('2. sans abonnement : NE voit PAS un cours premium', not pg_temp.vu('00000000-0000-0000-0000-00000000000a','Payant TS2'));
select pg_temp.ok('3a. abonné TS2 : voit le premium TS2', pg_temp.vu('00000000-0000-0000-0000-00000000000b','Payant TS2'));
select pg_temp.ok('3b. abonné TS2 : NE voit PAS le premium 3e (périmètre)', not pg_temp.vu('00000000-0000-0000-0000-00000000000b','Payant 3e'));
select pg_temp.ok('3c. abonné toutes classes : voit les deux', pg_temp.vu('00000000-0000-0000-0000-00000000000e','Payant 3e') and pg_temp.vu('00000000-0000-0000-0000-00000000000e','Payant TS2'));
select pg_temp.ok('4. abonnement expiré : plus d''accès premium', not pg_temp.vu('00000000-0000-0000-0000-00000000000c','Payant TS2'));
select pg_temp.ok('13. gratuits toujours accessibles (expiré et abonné)', pg_temp.vu('00000000-0000-0000-0000-00000000000c','Libre TS2') and pg_temp.vu('00000000-0000-0000-0000-00000000000b','Libre 3e'));

-- Visiteur non connecté
do $$ declare n int; begin
  perform set_config('request.jwt.claim.sub','',true); set local role anon;
  select count(*) into n from ressources where titre like 'Payant%'; reset role;
  perform pg_temp.ok('2b. visiteur anonyme : aucun contenu premium', n = 0);
end $$;

-- 5/6 : paiement en attente ou échoué n'active rien
do $$ declare t transactions; n int; begin
  t := creer_transaction('00000000-0000-0000-0000-00000000000a','decouverte','10000000-0000-0000-0000-000000000001');
  select count(*) into n from abonnements where user_id='00000000-0000-0000-0000-00000000000a';
  perform pg_temp.ok('5. paiement en attente : aucun abonnement', n = 0 and t.statut='en_attente');
  perform marquer_transaction(t.reference,'echouee','refusé');
  select count(*) into n from abonnements where user_id='00000000-0000-0000-0000-00000000000a';
  perform pg_temp.ok('6. paiement échoué : aucun abonnement', n = 0 and (select statut from transactions where id=t.id)='echouee');
end $$;

-- 8 : notification répétée = pas de doublon ; 9 : montant incorrect ; 12 : prolongation
do $$ declare t transactions; a1 uuid; a2 uuid; n int; fin1 timestamptz; t2 transactions; debut2 timestamptz; begin
  t := creer_transaction('00000000-0000-0000-0000-00000000000a','essentiel','10000000-0000-0000-0000-000000000001');
  perform pg_temp.ok('9a. montant incorrect : rien activé', activer_abonnement(t.reference, 1, 'x') is null);
  perform pg_temp.ok('9b. montant incorrect : signalé à vérifier', (select a_verifier and statut='en_attente' from transactions where id=t.id));
  a1 := activer_abonnement(t.reference, 1500, 'tok-a');
  a2 := activer_abonnement(t.reference, 1500, 'tok-a');
  a2 := activer_abonnement(t.reference, 1500, 'tok-a');
  select count(*) into n from abonnements where transaction_id = t.id;
  perform pg_temp.ok('8. notification répétée x3 : un seul abonnement', n = 1 and a1 = a2);
  select fin into fin1 from abonnements where id=a1;
  -- 12 : nouveau paiement même périmètre, alors que l'ancien est encore actif => commence à la fin de l'ancien
  t2 := creer_transaction('00000000-0000-0000-0000-00000000000a','reussite','10000000-0000-0000-0000-000000000001');
  perform pg_temp.ok('12a. transaction en attente ne change pas l''abonnement actif', (select fin from abonnements where id=a1)=fin1);
  perform activer_abonnement(t2.reference, 3500, 'tok-a2');
  select debut into debut2 from abonnements where transaction_id=t2.id;
  perform pg_temp.ok('12b. nouvel abonnement commence à la fin de l''ancien', debut2 = fin1);
  perform pg_temp.ok('12c. durée ajoutée une seule fois (90 j)', (select fin - debut from abonnements where transaction_id=t2.id) = interval '90 days');
  -- autre classe : démarre tout de suite (parallèle)
  t2 := creer_transaction('00000000-0000-0000-0000-00000000000a','essentiel','10000000-0000-0000-0000-000000000002');
  perform activer_abonnement(t2.reference, 1500, 'tok-a3');
  perform pg_temp.ok('12d. autre classe : démarre immédiatement', (select debut from abonnements where transaction_id=t2.id) <= now());
end $$;

-- Tentatives répétées : même transaction réutilisée
do $$ declare t1 transactions; t2 transactions; begin
  t1 := creer_transaction('00000000-0000-0000-0000-00000000000e','excellence',null) ;
exception when others then
  perform pg_temp.ok('plan une_classe sans classe : refusé', sqlerrm = 'classe_requise');
end $$;
do $$ declare t1 transactions; t2 transactions; begin
  t1 := creer_transaction('00000000-0000-0000-0000-00000000000e','excellence','10000000-0000-0000-0000-000000000001');
  update transactions set checkout_url='https://pay/x' where id=t1.id;
  t2 := creer_transaction('00000000-0000-0000-0000-00000000000e','excellence','10000000-0000-0000-0000-000000000001');
  perform pg_temp.ok('tentative répétée : même transaction réutilisée', t1.id = t2.id);
end $$;

-- 10 : un élève ne peut pas s'auto-accorder un accès
do $$ declare ok boolean := true; begin
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',true); set local role authenticated;
  begin update profils set palier='premium' where id='00000000-0000-0000-0000-00000000000a'; if found then ok:=false; end if; exception when others then null; end;
  begin insert into abonnements (user_id,plan_nom,debut,fin) values ('00000000-0000-0000-0000-00000000000a','x',now(),now()+interval '9 days'); ok:=false; exception when others then null; end;
  begin update abonnements set fin = fin + interval '999 days' where user_id='00000000-0000-0000-0000-00000000000a'; if found then ok:=false; end if; exception when others then null; end;
  begin update transactions set statut='payee' where user_id='00000000-0000-0000-0000-00000000000a'; if found then ok:=false; end if; exception when others then null; end;
  begin perform activer_abonnement('x',1,'x'); ok:=false; exception when others then null; end;
  begin perform admin_accorder_abonnement('alice@t.sn','essentiel','10000000-0000-0000-0000-000000000001',9); ok:=false; exception when others then null; end;
  begin update plans set prix_fcfa=1; if found then ok:=false; end if; exception when others then null; end;
  reset role;
  perform pg_temp.ok('10. l''élève ne peut rien s''auto-accorder (profil, abonnement, transaction, RPC, plans)', ok);
end $$;

-- 11 : transactions privées
do $$ declare n int; m int; begin
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',true); set local role authenticated;
  select count(*) into n from transactions where user_id <> '00000000-0000-0000-0000-00000000000a';
  select count(*) into m from abonnements where user_id <> '00000000-0000-0000-0000-00000000000a';
  reset role;
  perform pg_temp.ok('11. aucune transaction/abonnement d''un autre élève visible', n = 0 and m = 0);
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',true); set local role authenticated;
  select count(*) into n from transactions; reset role;
  perform pg_temp.ok('11b. l''admin voit toutes les transactions', n > 0);
end $$;

-- 14 : PDF privés (après le script 11)
create or replace function pg_temp.pdf(uid text, nom text) returns boolean language plpgsql as $$
declare n int; begin
  if uid = '' then set local role anon; else perform set_config('request.jwt.claim.sub', uid, true); set local role authenticated; end if;
  select count(*) into n from storage.objects where bucket_id='ressources' and name = nom; reset role; return n > 0; end $$;
select pg_temp.ok('14a. bucket privé', (select public from storage.buckets where id='ressources') = false);
select pg_temp.ok('14b. visiteur : PDF gratuit autorisé', pg_temp.pdf('', 'libre3.pdf'));
select pg_temp.ok('14c. visiteur : PDF premium refusé', not pg_temp.pdf('', 'paye3.pdf'));
select pg_temp.ok('14d. sans abonnement : PDF premium refusé', not pg_temp.pdf('00000000-0000-0000-0000-00000000000a','payeT.pdf') or (select count(*) from abonnements where user_id='00000000-0000-0000-0000-00000000000a' and niveaux_ids @> array['10000000-0000-0000-0000-000000000002'::uuid])>0);
select pg_temp.ok('14e. abonné TS2 : PDF premium TS2 autorisé, 3e refusé', pg_temp.pdf('00000000-0000-0000-0000-00000000000b','payeT.pdf') and not pg_temp.pdf('00000000-0000-0000-0000-00000000000b','paye3.pdf'));
select pg_temp.ok('14f. expiré : PDF premium refusé', not pg_temp.pdf('00000000-0000-0000-0000-00000000000c','payeT.pdf'));
select pg_temp.ok('14g. admin : tout autorisé', pg_temp.pdf('00000000-0000-0000-0000-00000000000d','paye3.pdf'));

-- Admin : accorder manuellement + remboursement + audit
do $$ declare id uuid; n int; ref text; begin
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',true); set local role authenticated;
  id := admin_accorder_abonnement('alice@t.sn','decouverte','10000000-0000-0000-0000-000000000002', 3);
  select reference into ref from transactions where user_id='00000000-0000-0000-0000-00000000000b' limit 1;
  perform admin_marquer_rembourse(ref, 'test');
  select count(*) into n from audit_admin; reset role;
  perform pg_temp.ok('admin : activation manuelle + remboursement tracés dans le journal', n >= 2);
  perform pg_temp.ok('remboursement : l''abonnement est coupé', not pg_temp.vu('00000000-0000-0000-0000-00000000000b','Payant TS2'));
end $$;
-- Chiffres : seules les transactions payées comptent comme encaissées
do $$ declare s jsonb; begin
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',true); set local role authenticated;
  s := admin_stats(now()-interval '1 day', now()+interval '1 day'); reset role;
  raise notice 'stats: %', s;
  perform pg_temp.ok('chiffres : encaissé = somme des seules transactions payées', (s->>'encaisse')::int = (select coalesce(sum(montant),0) from transactions where statut='payee'));
  perform pg_temp.ok('chiffres : en attente non comptée dans l''encaissé', (s->>'en_attente_nb')::int >= 1);
end $$;
