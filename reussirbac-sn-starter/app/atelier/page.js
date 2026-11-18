'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { tirerSujet, NB_MAX, TYPES_ATELIER } from '../../lib/atelier';
import AtelierShell from '../components/AtelierShell';
import Icon from '../components/Icon';

const CLE = 'atelier-choix-v1';

function lire() { try { return JSON.parse(localStorage.getItem(CLE) || 'null'); } catch (e) { return null; } }
function ecrire(v) { try { localStorage.setItem(CLE, JSON.stringify(v)); } catch (e) { /* facultatif */ } }

function Contenu() {
  const router = useRouter();
  const params = useSearchParams();
  const chapitreParam = params.get('chapitre');

  const [etat, setEtat] = useState('chargement'); // chargement | deconnecte | pret
  const [niveaux, setNiveaux] = useState([]);
  const [matieres, setMatieres] = useState([]);
  const [chapitres, setChapitres] = useState([]);
  const [comptes, setComptes] = useState({}); // chapitre_id -> { exercice, annale }
  const [niveauId, setNiveauId] = useState('');
  const [matiereId, setMatiereId] = useState('');
  const [choisis, setChoisis] = useState(() => new Set());
  const [types, setTypes] = useState(['exercice', 'annale']);
  const [nb, setNb] = useState(3);
  const [verrouilles, setVerrouilles] = useState(0);
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [suivi, setSuivi] = useState({ favoris: [], arevoir: [] });
  const [restaure, setRestaure] = useState(false);

  // 1. Connexion + classes
  useEffect(() => {
    let actif = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!actif) return;
      if (!user) { setEtat('deconnecte'); return; }
      const { data } = await supabase.from('niveaux').select('id, nom').order('ordre');
      if (!actif) return;
      setNiveaux(data || []);
      setEtat('pret');
      // Suivi : favoris et « à revoir »
      const sel = 'ressource_id, ressources(id, titre, type, chapitres(nom, matieres(nom)))';
      const [fav, ev] = await Promise.all([
        supabase.from('atelier_favoris').select(sel).order('cree_le', { ascending: false }).limit(20),
        supabase.from('atelier_evaluations').select(sel + ', etat').in('etat', ['a_revoir', 'rate']).order('maj', { ascending: false }).limit(20),
      ]);
      if (!actif) return;
      setSuivi({
        favoris: (fav.data || []).map((x) => x.ressources).filter(Boolean),
        arevoir: (ev.data || []).map((x) => ({ ...x.ressources, etat: x.etat })).filter((x) => x && x.id),
      });
    })();
    return () => { actif = false; };
  }, []);

  // 2. Arrivée depuis un chapitre, sinon dernier choix
  useEffect(() => {
    if (etat !== 'pret' || restaure) return;
    (async () => {
      if (chapitreParam) {
        const { data } = await supabase.from('chapitres').select('id, matiere_id, matieres(id, niveau_id)').eq('id', chapitreParam).maybeSingle();
        if (data?.matieres) {
          setNiveauId(data.matieres.niveau_id); setMatiereId(data.matiere_id);
          setChoisis(new Set([data.id]));
          setRestaure(true);
          return;
        }
      }
      const d = lire();
      if (d) {
        setNiveauId(d.niveauId || ''); setMatiereId(d.matiereId || '');
        setChoisis(new Set(d.chapitres || []));
        if (Array.isArray(d.types) && d.types.length) setTypes(d.types);
        if (d.nb) setNb(Math.min(NB_MAX, Math.max(1, d.nb)));
      }
      setRestaure(true);
    })();
  }, [etat, restaure, chapitreParam]);

  // 3. Matières
  useEffect(() => {
    setMatieres([]);
    if (!niveauId) return;
    supabase.from('matieres').select('id, nom').eq('niveau_id', niveauId).order('ordre').then(({ data }) => setMatieres(data || []));
  }, [niveauId]);

  // 4. Chapitres + nombre de sujets disponibles par chapitre (selon l'accès de l'élève)
  useEffect(() => {
    setChapitres([]); setComptes({});
    if (!matiereId) return;
    let actif = true;
    (async () => {
      const { data } = await supabase.from('chapitres').select('id, nom, ordre').eq('matiere_id', matiereId).order('ordre');
      const chs = data || [];
      if (!actif) return;
      setChapitres(chs);
      if (!chs.length) return;
      const { data: rs } = await supabase.from('ressources').select('id, chapitre_id, type').in('chapitre_id', chs.map((c) => c.id)).in('type', ['exercice', 'annale']).not('url_fichier', 'is', null);
      if (!actif) return;
      const c = {};
      (rs || []).forEach((r) => { c[r.chapitre_id] = c[r.chapitre_id] || { exercice: 0, annale: 0 }; c[r.chapitre_id][r.type]++; });
      setComptes(c);
    })();
    return () => { actif = false; };
  }, [matiereId]);

  const nbDispo = (c) => types.reduce((s, t) => s + ((comptes[c.id] || {})[t] || 0), 0);
  const chapitresActifs = useMemo(() => chapitres.filter((c) => choisis.has(c.id)), [chapitres, choisis]);
  const totalDispo = chapitresActifs.reduce((s, c) => s + nbDispo(c), 0);

  // 5. Sujets réservés aux abonnés dans la sélection
  useEffect(() => {
    setVerrouilles(0);
    if (!chapitresActifs.length) return;
    let actif = true;
    supabase.rpc('atelier_verrouilles', { p_chapitres: chapitresActifs.map((c) => c.id), p_types: types })
      .then(({ data, error }) => { if (actif && !error && typeof data === 'number') setVerrouilles(data); });
    return () => { actif = false; };
  }, [chapitresActifs, types]);

  const basculer = (id) => setChoisis((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toutChoisir = () => setChoisis(new Set(chapitres.filter((c) => nbDispo(c) > 0).map((c) => c.id)));
  const toutVider = () => setChoisis(new Set());
  const toutEstChoisi = chapitres.length > 0 && chapitres.filter((c) => nbDispo(c) > 0).every((c) => choisis.has(c.id));
  const basculerType = (t) => setTypes((p) => (p.includes(t) ? (p.length > 1 ? p.filter((x) => x !== t) : p) : [...p, t]));

  const generer = useCallback(async () => {
    setErreur('');
    if (!matiereId) { setErreur('Choisis d\'abord une classe et une matière.'); return; }
    if (!chapitresActifs.length) { setErreur('Choisis au moins un chapitre, ou touche « Tout le programme ».'); return; }
    setOccupe(true);
    const { data, error } = await supabase.from('ressources')
      .select('id, chapitre_id, type, duree_min, bareme')
      .in('chapitre_id', chapitresActifs.map((c) => c.id)).in('type', types).not('url_fichier', 'is', null);
    if (error) { setErreur('Impossible de lire les sujets pour le moment. Réessaie dans un instant.'); setOccupe(false); return; }
    if (!data || !data.length) {
      setErreur(verrouilles > 0
        ? 'Les sujets de cette sélection sont réservés aux abonnés.'
        : 'Il n\'y a pas encore de sujet dans cette sélection. Essaie d\'autres chapitres.');
      setOccupe(false); return;
    }
    const { data: ev } = await supabase.from('atelier_evaluations').select('ressource_id').eq('etat', 'reussi');
    const deja = new Set((ev || []).map((x) => x.ressource_id));
    const tirage = tirerSujet(data, Math.min(nb, data.length), deja);
    ecrire({ niveauId, matiereId, chapitres: [...choisis], types, nb });
    router.push(`/atelier/sujet?r=${tirage.map((r) => r.id).join(',')}`);
  }, [matiereId, chapitresActifs, types, nb, niveauId, choisis, router, verrouilles]);

  if (etat === 'chargement') return <AtelierShell><p className="at-muted">Chargement...</p></AtelierShell>;

  if (etat === 'deconnecte') {
    return (
      <AtelierShell retour={{ href: '/', label: 'Accueil' }}>
        <section className="at-carte at-bloque">
          <span className="at-pastille"><Icon name="lock" size={22} /></span>
          <h1 className="at-titre">Atelier d'entraînement</h1>
          <p className="at-muted">Génère ton propre sujet à partir des exercices et des annales du programme, travaille avec un chrono comme le jour J, puis consulte le corrigé. Cet espace est réservé aux élèves qui ont un compte.</p>
          <div className="at-actions">
            <Link href="/inscription" className="at-btn at-btn-hib">Créer mon compte gratuit</Link>
            <Link href="/login" className="at-btn">J'ai déjà un compte</Link>
          </div>
        </section>
      </AtelierShell>
    );
  }

  const nbMaxReel = Math.max(1, Math.min(NB_MAX, totalDispo || NB_MAX));
  const nbAffiche = Math.min(nb, nbMaxReel);

  return (
    <AtelierShell retour={{ href: '/', label: 'Quitter' }}>
      <h1 className="at-titre">Génère ton sujet d'entraînement</h1>
      <p className="at-muted at-intro">Choisis la matière et les chapitres. L'Atelier tire des exercices et des annales au hasard, les assemble en un seul sujet et lance le chrono.</p>

      <section className="at-carte">
        <h2 className="at-etape"><span>1</span> Classe et matière</h2>
        <div className="at-grille2">
          <label className="at-champ"><span>Classe</span>
            <select value={niveauId} onChange={(e) => { setNiveauId(e.target.value); setMatiereId(''); setChoisis(new Set()); }}>
              <option value="">Choisir…</option>
              {niveaux.map((n) => <option key={n.id} value={n.id}>{n.nom}</option>)}
            </select>
          </label>
          <label className="at-champ"><span>Matière</span>
            <select value={matiereId} disabled={!niveauId} onChange={(e) => { setMatiereId(e.target.value); setChoisis(new Set()); }}>
              <option value="">Choisir…</option>
              {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
          </label>
        </div>
      </section>

      {matiereId && (
        <section className="at-carte">
          <div className="at-ligne-titre">
            <h2 className="at-etape"><span>2</span> Chapitres</h2>
            <button type="button" className="at-lien" onClick={toutEstChoisi ? toutVider : toutChoisir}>
              {toutEstChoisi ? 'Tout désélectionner' : 'Tout le programme'}
            </button>
          </div>
          {chapitres.length === 0 && <p className="at-muted">Aucun chapitre pour cette matière.</p>}
          <div className="at-chapitres">
            {chapitres.map((c) => {
              const n = nbDispo(c);
              const coche = choisis.has(c.id);
              return (
                <label key={c.id} className={`at-chap${coche ? ' on' : ''}${n === 0 ? ' vide' : ''}`}>
                  <input type="checkbox" checked={coche} disabled={n === 0} onChange={() => basculer(c.id)} />
                  <span className="at-chap-nom">{c.nom}</span>
                  <small>{n === 0 ? 'Bientôt' : `${n} sujet${n > 1 ? 's' : ''}`}</small>
                </label>
              );
            })}
          </div>
        </section>
      )}

      {matiereId && (
        <section className="at-carte">
          <h2 className="at-etape"><span>3</span> Contenu et taille du sujet</h2>
          <div className="at-types" role="group" aria-label="Type de contenu">
            {TYPES_ATELIER.map((t) => (
              <button key={t.key} type="button" aria-pressed={types.includes(t.key)} className={`at-chip${types.includes(t.key) ? ' on' : ''}`} onClick={() => basculerType(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="at-nb">
            <span>Nombre d'exercices</span>
            <div className="at-stepper">
              <button type="button" onClick={() => setNb((n) => Math.max(1, Math.min(n, nbMaxReel) - 1))} aria-label="Moins" disabled={nbAffiche <= 1}>−</button>
              <b aria-live="polite">{nbAffiche}</b>
              <button type="button" onClick={() => setNb((n) => Math.min(nbMaxReel, Math.min(n, nbMaxReel) + 1))} aria-label="Plus" disabled={nbAffiche >= nbMaxReel}>+</button>
            </div>
          </div>
          {chapitresActifs.length > 0 && (
            <p className="at-muted at-petit">{chapitresActifs.length} chapitre{chapitresActifs.length > 1 ? 's' : ''} · {totalDispo} sujet{totalDispo > 1 ? 's' : ''} disponible{totalDispo > 1 ? 's' : ''}.</p>
          )}
          {verrouilles > 0 && (
            <p className="at-note">
              <Icon name="lock" size={14} /> {verrouilles} autre{verrouilles > 1 ? 's' : ''} sujet{verrouilles > 1 ? 's sont réservés' : ' est réservé'} aux abonnés.{' '}
              <Link href="/tarifs" className="at-lien">Voir les formules</Link>
            </p>
          )}
        </section>
      )}

      {erreur && <p className="at-erreur" role="alert">{erreur}</p>}
      <button type="button" className="at-btn at-btn-hib at-gros" onClick={generer} disabled={occupe || !matiereId}>
        <Icon name="shuffle" size={18} /> {occupe ? 'Tirage en cours...' : 'Générer mon sujet'}
      </button>

      {(suivi.arevoir.length > 0 || suivi.favoris.length > 0) && (
        <div className="at-suivi">
          {suivi.arevoir.length > 0 && (
            <section className="at-carte">
              <h2 className="at-etape"><span><Icon name="refresh" size={14} /></span> À revoir</h2>
              <ul className="at-liste">
                {suivi.arevoir.map((r) => (
                  <li key={r.id}><Link href={`/atelier/sujet?r=${r.id}`}>
                    <b>{r.titre}</b><small>{r.chapitres?.matieres?.nom} · {r.chapitres?.nom}</small>
                    <em className={r.etat === 'rate' ? 'rate' : 'revoir'}>{r.etat === 'rate' ? 'Raté' : 'À revoir'}</em>
                  </Link></li>
                ))}
              </ul>
            </section>
          )}
          {suivi.favoris.length > 0 && (
            <section className="at-carte">
              <h2 className="at-etape"><span><Icon name="star" size={14} /></span> Mes favoris</h2>
              <ul className="at-liste">
                {suivi.favoris.map((r) => (
                  <li key={r.id}><Link href={`/atelier/sujet?r=${r.id}`}>
                    <b>{r.titre}</b><small>{r.chapitres?.matieres?.nom} · {r.chapitres?.nom}</small>
                  </Link></li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </AtelierShell>
  );
}

export default function AtelierPage() {
  return <Suspense fallback={<AtelierShell><p className="at-muted">Chargement...</p></AtelierShell>}><Contenu /></Suspense>;
}
