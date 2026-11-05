'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import {
  CATEGORIES, libelleCategorie, estNouveau, peutLireAbonnes, urlsCouvertures, lireOctets,
  garderHorsLigne, supprimerHorsLigne, toutHorsLigne, renouvelerVerification, viderHorsLigne,
  copieValide, horsLigneDisponible, tailleLisible,
} from '../../lib/biblio';
import Topbar from '../components/Topbar';
import Icon from '../components/Icon';

export default function BibliothequePage() {
  const [etat, setEtat] = useState('chargement'); // chargement | ok | deconnecte
  const [user, setUser] = useState(null);
  const [docs, setDocs] = useState([]);
  const [niveaux, setNiveaux] = useState([]);
  const [couv, setCouv] = useState({});
  const [favoris, setFavoris] = useState(new Set());
  const [locaux, setLocaux] = useState(new Map());   // id -> copie hors ligne
  const [couvLocales, setCouvLocales] = useState({});  // id -> adresse locale de la couverture
  const [droit, setDroit] = useState(null);          // true = abonné actif, false = non, null = inconnu
  const [enLigne, setEnLigne] = useState(true);
  const [cat, setCat] = useState('');
  const [niveau, setNiveau] = useState('');
  const [q, setQ] = useState('');
  const [seulFavoris, setSeulFavoris] = useState(false);
  const [occupe, setOccupe] = useState({});
  const [message, setMessage] = useState('');

  const rafraichirLocaux = useCallback(async (uid) => {
    try {
      const liste = await toutHorsLigne(uid);
      setLocaux(new Map(liste.map((e) => [e.id, e])));
      setCouvLocales((ancien) => {
        Object.values(ancien).forEach((u) => URL.revokeObjectURL(u));
        const n = {};
        liste.forEach((e) => { if (e.couverture) n[e.id] = URL.createObjectURL(e.couverture); });
        return n;
      });
      return liste;
    } catch (e) { return []; }
  }, []);

  useEffect(() => {
    let actif = true;
    async function charger() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (actif) setEtat('deconnecte'); return; }
      const u = session.user;
      setUser(u);
      const online = typeof navigator === 'undefined' ? true : navigator.onLine;
      setEnLigne(online);
      const locauxListe = await rafraichirLocaux(u.id);

      if (online) {
        try {
          const [d, f, n] = await Promise.all([
            supabase.from('documents').select('*').eq('statut', 'publie').order('cree_le', { ascending: false }),
            supabase.from('favoris_documents').select('document_id').eq('user_id', u.id),
            supabase.from('niveaux').select('id, nom').order('ordre'),
          ]);
          if (d.error) throw d.error;
          if (!actif) return;
          const liste = d.data || [];
          setDocs(liste);
          setFavoris(new Set((f.data || []).map((x) => x.document_id)));
          setNiveaux(n.data || []);
          setCouv(await urlsCouvertures(liste));
          const ok = await peutLireAbonnes();
          if (!actif) return;
          setDroit(ok);
          if (ok === true) renouvelerVerification(u.id).then(() => rafraichirLocaux(u.id));
          if (ok === false && locauxListe.length) { await viderHorsLigne(u.id); await rafraichirLocaux(u.id); }
          setEtat('ok');
          return;
        } catch (e) { /* bascule sur les copies hors ligne */ }
      }
      // Hors ligne : seulement les livres gardés sur l'appareil
      if (!actif) return;
      setEnLigne(false);
      setDocs(locauxListe.filter(copieValide).map((e) => e.meta));
      setFavoris(new Set(locauxListe.map((e) => e.id)));
      setEtat('ok');
    }
    charger();
    const maj = () => setEnLigne(navigator.onLine);
    window.addEventListener('online', maj); window.addEventListener('offline', maj);
    return () => { actif = false; window.removeEventListener('online', maj); window.removeEventListener('offline', maj); };
  }, [rafraichirLocaux]);

  const abonne = droit === true;

  async function basculerFavori(d) {
    if (!user || !enLigne) return;
    const est = favoris.has(d.id);
    setFavoris((prev) => { const n = new Set(prev); if (est) n.delete(d.id); else n.add(d.id); return n; });
    const { error } = est
      ? await supabase.from('favoris_documents').delete().eq('document_id', d.id).eq('user_id', user.id)
      : await supabase.from('favoris_documents').insert({ document_id: d.id, user_id: user.id });
    if (error) {
      setFavoris((prev) => { const n = new Set(prev); if (est) n.add(d.id); else n.delete(d.id); return n; });
      setMessage('Impossible de modifier les favoris pour le moment.');
      return;
    }
    if (est && locaux.has(d.id)) { await supprimerHorsLigne(d.id); await rafraichirLocaux(user.id); }
  }

  async function basculerHorsLigne(d) {
    if (!user) return;
    setMessage('');
    if (locaux.has(d.id)) { await supprimerHorsLigne(d.id); await rafraichirLocaux(user.id); return; }
    if (!enLigne) return;
    setOccupe((o) => ({ ...o, [d.id]: true }));
    try {
      const octets = await lireOctets(d.chemin_fichier);
      await garderHorsLigne(d, octets, couv[d.chemin_couverture], user.id);
      await rafraichirLocaux(user.id);
      setMessage(`« ${d.titre} » est disponible hors ligne (${tailleLisible(octets.byteLength)}).`);
    } catch (e) {
      setMessage("Le téléchargement hors ligne a échoué. Vérifie ta connexion et réessaie.");
    }
    setOccupe((o) => { const n = { ...o }; delete n[d.id]; return n; });
  }

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return docs.filter((d) => {
      if (cat && d.categorie !== cat) return false;
      if (niveau && d.niveau_id && d.niveau_id !== niveau) return false;
      if (seulFavoris && !favoris.has(d.id)) return false;
      if (t && !`${d.titre} ${d.auteur || ''}`.toLowerCase().includes(t)) return false;
      return true;
    });
  }, [docs, cat, niveau, q, seulFavoris, favoris]);

  const taillePerso = [...locaux.values()].reduce((s, e) => s + (e.taille || 0), 0);

  return (
    <>
      <Topbar crumbs={[{ label: 'Bibliothèque' }]} />
      <main className="wide-page">
        <div className="page-title-row">
          <div>
            <h1 className="brand-font page-title">Bibliothèque</h1>
            <p className="bib-sous">Fascicules, livres et méthodes pour aller plus loin.</p>
          </div>
        </div>

        {etat === 'chargement' && <p style={{ color: 'var(--ink-soft)' }}>Chargement...</p>}

        {etat === 'deconnecte' && (
          <div className="empty-box">
            <p style={{ margin: '0 0 12px' }}>La bibliothèque est réservée aux élèves connectés. Crée un compte gratuit pour la découvrir.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link className="btn-dark" href="/login">Se connecter</Link>
              <Link className="btn-light" href="/inscription">Créer un compte</Link>
            </div>
          </div>
        )}

        {etat === 'ok' && (
          <>
            {!enLigne && (
              <p className="bib-bandeau">
                <Icon name="wifiOff" size={15} /> Hors ligne : seuls les livres gardés sur cet appareil sont disponibles.
              </p>
            )}
            {message && <p className="success-text" role="status">{message}</p>}

            <div className="lc-search" style={{ marginBottom: 10 }}>
              <Icon name="search" size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un titre ou un auteur" aria-label="Rechercher" />
            </div>

            <div className="lc-pills" aria-label="Filtrer par catégorie">
              <button type="button" className={`lc-pill${!cat && !seulFavoris ? ' on' : ''}`} onClick={() => { setCat(''); setSeulFavoris(false); }}>Tout <b>{docs.length}</b></button>
              {CATEGORIES.map((c) => (
                <button type="button" key={c.key} className={`lc-pill${cat === c.key ? ' on' : ''}`} onClick={() => { setCat(cat === c.key ? '' : c.key); setSeulFavoris(false); }}>
                  {c.label} <b>{docs.filter((d) => d.categorie === c.key).length}</b>
                </button>
              ))}
              <button type="button" className={`lc-pill${seulFavoris ? ' on' : ''}`} onClick={() => { setSeulFavoris(!seulFavoris); setCat(''); }}>
                <Icon name="heart" size={13} className="plein" /> Mes favoris <b>{favoris.size}</b>
              </button>
            </div>

            {niveaux.length > 0 && (
              <select className="bib-niveau" value={niveau} onChange={(e) => setNiveau(e.target.value)} aria-label="Filtrer par classe">
                <option value="">Toutes les classes</option>
                {niveaux.map((n) => <option key={n.id} value={n.id}>{n.nom}</option>)}
              </select>
            )}

            {visibles.length === 0 && (
              <div className="empty-box">
                {docs.length === 0
                  ? (enLigne ? 'La bibliothèque se remplit bientôt.' : 'Aucun livre n\'est gardé hors ligne sur cet appareil.')
                  : seulFavoris ? 'Tu n\'as pas encore de favori. Touche le cœur d\'un livre pour le retrouver ici.' : 'Aucun document ne correspond à ta recherche.'}
              </div>
            )}

            <div className="bib-grille">
              {visibles.map((d) => {
                const verrouille = d.acces === 'abonne' && droit === false;
                const fav = favoris.has(d.id);
                const local = locaux.get(d.id);
                const href = verrouille ? '/tarifs' : `/bibliotheque/lire?id=${d.id}`;
                const imgUrl = couv[d.chemin_couverture] || couvLocales[d.id] || null;
                return (
                  <article className="bib-carte" key={d.id}>
                    <Link href={href} className="bib-couv" aria-label={`Ouvrir ${d.titre}`}>
                      {imgUrl
                        ? <img src={imgUrl} alt="" draggable={false} onContextMenu={(e) => e.preventDefault()} loading="lazy" />
                        : <span className="bib-couv-vide"><Icon name="library" size={34} /></span>}
                      {estNouveau(d) && <span className="bib-nouveau">Nouveau</span>}
                      {d.acces === 'abonne' && <span className="bib-badge"><Icon name="lock" size={11} /> Abonnés</span>}
                    </Link>
                    <div className="bib-corps">
                      <span className="bib-cat">{libelleCategorie(d.categorie)}</span>
                      <h3 className="bib-titre">{d.titre}</h3>
                      {d.auteur && <p className="bib-auteur">{d.auteur}</p>}
                      <div className="bib-actions">
                        {enLigne && (
                          <button type="button" className={`bib-ico${fav ? ' on' : ''}`} onClick={() => basculerFavori(d)} aria-pressed={fav}
                            aria-label={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'} title={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
                            <Icon name="heart" size={17} className={fav ? 'plein' : ''} />
                          </button>
                        )}
                        {abonne && fav && horsLigneDisponible() && (
                          <button type="button" className={`bib-ico${local ? ' on' : ''}`} onClick={() => basculerHorsLigne(d)} disabled={!!occupe[d.id] || (!enLigne && !local)}
                            aria-label={local ? 'Supprimer la copie hors ligne' : 'Garder hors ligne'} title={local ? 'Disponible hors ligne (toucher pour retirer)' : 'Garder hors ligne'}>
                            <Icon name={occupe[d.id] ? 'refresh' : local ? 'checkCircle' : 'download'} size={17} />
                          </button>
                        )}
                        {local && <span className="bib-hl">Hors ligne</span>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {enLigne && droit === false && docs.some((d) => d.acces === 'abonne') && (
              <div className="bib-promo">
                <b>Les livres marqués « Abonnés » sont inclus dans l'abonnement.</b>
                <span>Les abonnés peuvent aussi garder leurs favoris hors ligne, sans connexion.</span>
                <Link className="btn-dark" href="/tarifs">Voir les formules</Link>
              </div>
            )}
            {abonne && locaux.size > 0 && (
              <p className="bib-note">{locaux.size} livre{locaux.size > 1 ? 's' : ''} gardé{locaux.size > 1 ? 's' : ''} hors ligne sur cet appareil ({tailleLisible(taillePerso)}). Ils restent lisibles tant que ton abonnement est actif ; ils se renouvellent à chaque connexion.</p>
            )}
          </>
        )}
      </main>
    </>
  );
}
