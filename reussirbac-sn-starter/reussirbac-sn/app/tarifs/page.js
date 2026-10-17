'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import SiteShell from '../components/SiteShell';
import Icon from '../components/Icon';
import { fcfa, dateFr, joursRestants, libellePortee, memoriserSuite, chargerMonAbonnement, verifierPaiement } from '../../lib/abonnement';

export default function Tarifs() {
  const [plans, setPlans] = useState([]);
  const [niveaux, setNiveaux] = useState([]);
  const [user, setUser] = useState(null);
  const [etat, setEtat] = useState(null);       // abonnements/transactions de l'élève
  const [pret, setPret] = useState(false);
  const [niveau, setNiveau] = useState('');
  const [accepte, setAccepte] = useState(false);
  const [busy, setBusy] = useState('');          // id du plan en cours
  const [erreur, setErreur] = useState('');
  const [verif, setVerif] = useState(false);
  const [info, setInfo] = useState('');

  async function charger() {
    const [{ data: p }, { data: n }, { data: { session } }] = await Promise.all([
      supabase.from('plans').select('*').eq('actif', true).order('ordre'),
      supabase.from('niveaux').select('id, nom, ordre').order('ordre'),
      supabase.auth.getSession(),
    ]);
    setPlans(p || []);
    setNiveaux(n || []);
    const u = session?.user || null;
    setUser(u);
    if (u) setEtat(await chargerMonAbonnement(u.id));
    setPret(true);
  }

  useEffect(() => {
    charger();
    // Choix conservé : lien /tarifs?niveau=...&plan=... ou mémoire de la session
    try {
      const q = new URLSearchParams(window.location.search);
      const memo = sessionStorage.getItem('rb_niveau');
      if (q.get('niveau')) setNiveau(q.get('niveau'));
      else if (memo) setNiveau(memo);
    } catch (e) {}
  }, []);

  function choisirNiveau(id) {
    setNiveau(id);
    try { sessionStorage.setItem('rb_niveau', id); } catch (e) {}
  }

  const besoinClasse = plans.some((p) => p.portee === 'une_classe');
  const niveauxProposes = useMemo(() => niveaux, [niveaux]);

  function porteeDe(plan) {
    if (plan.portee === 'toutes') return 'Toutes les classes';
    if (plan.portee === 'selection') return libellePortee(plan.niveaux_autorises, niveaux);
    const nom = niveaux.find((n) => n.id === niveau)?.nom;
    return nom ? nom : null;
  }

  async function souscrire(plan) {
    setErreur(''); setInfo('');
    if (!user) {
      memoriserSuite(`/tarifs${niveau ? `?niveau=${niveau}` : ''}`);
      window.location.href = '/login';
      return;
    }
    if (plan.portee === 'une_classe' && !niveau) { setErreur('Choisis d’abord ta classe.'); return; }
    if (!accepte) { setErreur('Coche la case pour confirmer que tu as lu les conditions.'); return; }
    setBusy(plan.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const rep = await fetch('/api/paiement/initier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ plan: plan.id, niveau: plan.portee === 'une_classe' ? niveau : null }),
      });
      const json = await rep.json().catch(() => ({}));
      if (!rep.ok || !json.url) { setErreur(json.erreur || 'Le paiement n’a pas pu démarrer. Réessaie.'); setBusy(''); return; }
      window.location.href = json.url;    // page de paiement sécurisée du prestataire
    } catch (e) {
      setErreur('Problème de connexion. Vérifie ton réseau et réessaie.');
      setBusy('');
    }
  }

  async function reverifier() {
    if (!etat?.enAttente) return;
    setVerif(true); setInfo(''); setErreur('');
    const r = await verifierPaiement(etat.enAttente.reference);
    if (r.etat === 'payee') { await charger(); setInfo('Paiement confirmé. Ton abonnement est actif.'); }
    else if (r.etat === 'reseau') setErreur('Problème de connexion. Réessaie dans un instant.');
    else { await charger(); setInfo('Le paiement n’est pas encore confirmé.'); }
    setVerif(false);
  }

  const actif = etat?.actifs?.[0];
  const bientot = actif && joursRestants(actif.fin) <= 7;
  const expire = !actif && etat?.expires?.[0];

  return (
    <SiteShell>
      <main className="lp-wrap ab">
        <header className="ab-head">
          <h1 className="lp-big">Choisis ta formule</h1>
          <p className="lp-sub">Paiement unique, sans renouvellement automatique. Tu règles par Wave, Orange Money, Free Money ou carte, sur la page sécurisée de notre prestataire.</p>
        </header>

        {pret && user && actif && (
          <div className={`ab-banner ${bientot ? 'warn' : 'ok'}`} role="status">
            <Icon name={bientot ? 'refresh' : 'checkCircle'} size={20} />
            <p>
              {bientot
                ? <>Ton abonnement <b>{actif.plan_nom}</b> expire bientôt (le {dateFr(actif.fin)}). Renouvelle-le pour continuer à accéder aux cours Premium.</>
                : <>Ton abonnement <b>{actif.plan_nom}</b> est actif jusqu’au {dateFr(actif.fin)}. Un renouvellement s’ajoute à la suite, sans rien perdre.</>}
            </p>
          </div>
        )}
        {pret && user && expire && (
          <div className="ab-banner warn" role="status">
            <Icon name="refresh" size={20} />
            <p>Ton abonnement <b>{expire.plan_nom}</b> a expiré le {dateFr(expire.fin)}. Choisis une formule pour retrouver les cours Premium.</p>
          </div>
        )}
        {pret && user && etat?.enAttente && (
          <div className="ab-banner wait" role="status">
            <Icon name="refresh" size={20} />
            <div>
              <p>Ton paiement <b>{etat.enAttente.plan_nom}</b> est en attente de confirmation. Ne paie pas une deuxième fois.</p>
              <div className="ab-banner-actions">
                <button className="btn-dark" onClick={reverifier} disabled={verif}>{verif ? 'Vérification...' : 'Vérifier mon paiement'}</button>
                <a className="btn-light" href={etat.enAttente.checkout_url}>Reprendre le paiement</a>
              </div>
            </div>
          </div>
        )}
        {pret && user && !etat?.enAttente && etat?.echec && (
          <div className="ab-banner bad" role="alert">
            <Icon name="x" size={20} />
            <p>Le paiement n’a pas été confirmé. Si tu as été débité, <Link href="/contact">contacte le support</Link> avant de recommencer.</p>
          </div>
        )}
        {info && <p className="ab-info" role="status">{info}</p>}
        {pret && !user && (
          <div className="ab-banner ok" role="status">
            <Icon name="lock" size={20} />
            <p>Pour souscrire, connecte-toi ou crée un compte gratuit. Ton choix de formule sera conservé.</p>
          </div>
        )}

        {besoinClasse && (
          <fieldset className="ab-classes">
            <legend>Pour quelle classe ?</legend>
            <div>
              {niveauxProposes.map((n) => (
                <label key={n.id} className={niveau === n.id ? 'on' : ''}>
                  <input type="radio" name="classe" value={n.id} checked={niveau === n.id} onChange={() => choisirNiveau(n.id)} />
                  {n.nom}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {!pret && <p className="ab-chargement">Chargement des formules...</p>}
        {pret && plans.length === 0 && <div className="empty-box">Les formules ne sont pas encore disponibles.</div>}

        <div className="ab-grid">
          {plans.map((p) => {
            const portee = porteeDe(p);
            const parMois = p.duree_jours > 30 ? Math.round(p.prix_fcfa / (p.duree_jours / 30)) : null;
            return (
              <article key={p.id} className={`ab-card${p.mis_en_avant ? ' star' : ''}`}>
                {p.mis_en_avant && <span className="ab-flag">Recommandée</span>}
                <h2 className="brand-font">{p.nom}</h2>
                <p className="ab-desc">{p.description}</p>
                <p className="ab-prix"><b className="brand-font">{Number(p.prix_fcfa).toLocaleString('fr-FR')}</b> FCFA</p>
                <p className="ab-duree">
                  {p.duree_jours} jours
                  {parMois ? <span> · soit {fcfa(parMois)} par mois</span> : null}
                </p>
                <ul className="ab-avantages">
                  {(p.avantages || []).map((a) => (<li key={a}><Icon name="check" size={16} />{a}</li>))}
                </ul>
                <div className="ab-portee">
                  <span>Accès</span>
                  <b>{portee || 'Choisis ta classe ci-dessus'}</b>
                </div>
                <button
                  type="button"
                  className={p.mis_en_avant ? 'btn-primary' : 'btn-dark'}
                  onClick={() => souscrire(p)}
                  disabled={!!busy}
                >
                  {busy === p.id ? 'Redirection...' : !user ? 'Se connecter pour souscrire' : actif ? 'Renouveler avec cette formule' : 'Souscrire'}
                </button>
              </article>
            );
          })}
        </div>

        {erreur && <p className="error-text ab-erreur" role="alert">{erreur}</p>}

        <div className="ab-conditions">
          <h2 className="brand-font">Avant de payer</h2>
          <ul>
            <li>Le paiement se fait à l’avance, une seule fois. Aucun prélèvement automatique : pour renouveler, tu fais un nouveau paiement.</li>
            <li>L’accès commence dès que le paiement est confirmé, et dure le nombre de jours indiqué. Si tu as déjà un abonnement actif pour la même classe, le nouveau commence à sa date de fin.</li>
            <li>L’abonnement ouvre les cours, exercices, annales et quiz de la classe indiquée. Les contenus gratuits restent accessibles à tous.</li>
            <li>Un souci de paiement ? <Link href="/contact">Écris-nous</Link> avant de recommencer : nous vérifions chaque transaction.</li>
          </ul>
          <label className="checkbox-row">
            <input type="checkbox" checked={accepte} onChange={(e) => setAccepte(e.target.checked)} />
            <span>J’ai lu ces conditions et les <Link href="/conditions" style={{ textDecoration: 'underline' }}>conditions d’utilisation</Link>.</span>
          </label>
        </div>
      </main>
    </SiteShell>
  );
}
