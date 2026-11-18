'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { appeler, SQL_MANQUANT, lienInvitation, lienWhatsApp, tempsRelatif, resteAvantExpiration, CLE_CODE } from '../../lib/cercle';
import Topbar from '../components/Topbar';
import Icon from '../components/Icon';

const ONGLETS = [['amis', 'Amis', 'users'], ['defis', 'Défis', 'trophy'], ['classement', 'Classement', 'flame'], ['objectifs', 'Objectifs', 'check'], ['badges', 'Badges', 'shield']];

// Badges : libellé, règle et pictogramme (les conditions sont vérifiées par la base)
const BADGES = {
  regulier: { nom: 'Régulier', regle: '5 jours d’étude d’affilée', icone: 'flame' },
  genie: { nom: 'Génie', regle: '10 quiz réussis (70 % ou plus)', icone: 'quiz' },
  travailleur: { nom: 'Travailleur', regle: '20 cours ou exercices terminés', icone: 'bookOpen' },
  champion: { nom: 'Champion', regle: '5 défis gagnés', icone: 'trophy' },
  esprit_equipe: { nom: 'Esprit d’équipe', regle: 'Atteindre un objectif collectif', icone: 'users' },
  perseverant: { nom: 'Persévérant', regle: '30 jours d’activité', icone: 'shield' },
};

export default function CerclePage() {
  const router = useRouter();
  const [etat, setEtat] = useState('chargement'); // chargement | ok | deconnecte | inactif
  const [onglet, setOnglet] = useState('amis');
  const [cercle, setCercle] = useState(null);
  const [defis, setDefis] = useState([]);
  const [classement, setClassement] = useState([]);
  const [objectifs, setObjectifs] = useState([]);
  const [badges, setBadges] = useState([]);
  const [nouvelObjectif, setNouvelObjectif] = useState(false);
  const [message, setMessage] = useState({ texte: '', ok: false });
  const [codeSaisi, setCodeSaisi] = useState('');
  const [invitation, setInvitation] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [pseudo, setPseudo] = useState('');
  const [discret, setDiscret] = useState(false);
  const [menuOuvert, setMenuOuvert] = useState(null);
  const [nouveauDefi, setNouveauDefi] = useState(false);
  const [copie, setCopie] = useState(false);

  const dire = (texte, ok = false) => setMessage({ texte, ok });

  const charger = useCallback(async () => {
    const [c, d, k, o, b] = await Promise.all([appeler('amis_etat'), appeler('defis_etat'), appeler('amis_classement'), appeler('objectifs_etat'), appeler('badges_etat')]);
    if (c.erreur === SQL_MANQUANT) { setEtat('inactif'); return; }
    if (c.erreur) { dire(c.erreur); setEtat('ok'); return; }
    setCercle(c.data); setPseudo(c.data.moi.pseudo); setDiscret(c.data.moi.discret);
    setDefis(Array.isArray(d.data) ? d.data : []);
    setClassement(Array.isArray(k.data) ? k.data : []);
    setObjectifs(Array.isArray(o.data) ? o.data : []);
    setBadges(Array.isArray(b.data) ? b.data : []);
    setEtat('ok');
  }, []);

  useEffect(() => {
    let actif = true;
    (async () => {
      let code = '';
      try {
        const p = new URLSearchParams(window.location.search).get('code');
        if (p) { localStorage.setItem(CLE_CODE, p); }
        code = localStorage.getItem(CLE_CODE) || '';
      } catch (e) { /* stockage indisponible */ }
      const { data: { user } } = await supabase.auth.getUser();
      if (!actif) return;
      if (!user) { setInvitation(code); setEtat('deconnecte'); return; }
      setInvitation(code);
      await charger();
    })();
    return () => { actif = false; };
  }, [charger]);

  const oublierInvitation = () => { try { localStorage.removeItem(CLE_CODE); } catch (e) {} setInvitation(''); };

  async function ajouter(code) {
    if (!code.trim() || occupe) return;
    setOccupe(true); dire('');
    const r = await appeler('amis_ajouter', { p_code: code });
    setOccupe(false);
    if (r.erreur) { dire(r.erreur); if (invitation) oublierInvitation(); return; }
    dire(r.data === 'accepte' ? 'Vous êtes maintenant amis.' : 'Invitation envoyée. Ton ami doit l’accepter.', true);
    setCodeSaisi(''); oublierInvitation();
    charger();
  }

  async function action(nom, args, ok) {
    setOccupe(true); dire(''); setMenuOuvert(null);
    const r = await appeler(nom, args);
    setOccupe(false);
    if (r.erreur) { dire(r.erreur); return; }
    if (ok) dire(ok, true);
    charger();
  }

  async function enregistrerReglages(e) {
    e.preventDefault();
    await action('amis_modifier_profil', { p_pseudo: pseudo, p_discret: discret }, 'Réglages enregistrés.');
  }

  async function copierLien() {
    try { await navigator.clipboard.writeText(lienInvitation(cercle.moi.code)); setCopie(true); setTimeout(() => setCopie(false), 2000); }
    catch (e) { dire('Copie impossible. Utilise le bouton WhatsApp.'); }
  }

  function signaler(a) {
    if (!window.confirm(`Signaler et bloquer ${a.pseudo} ? Vous ne serez plus amis et il ne pourra plus t’ajouter.`)) return;
    action('amis_signaler', { p_cible: a.user_id, p_motif: 'Signalé depuis Mon cercle', p_bloquer: true }, `${a.pseudo} a été bloqué et signalé.`);
  }

  const aJouer = defis.filter((d) => d.etat === 'a_jouer');
  const enAttente = defis.filter((d) => d.etat === 'attente');
  const termines = defis.filter((d) => d.etat === 'termine');

  return (
    <>
      <Topbar crumbs={[{ label: 'Mon cercle' }]} />
      <main className="wide-page cc-page">
        <div className="page-title-row">
          <div>
            <h1 className="brand-font page-title">Mon cercle</h1>
            <p className="bib-sous">Révise avec tes amis, lance des défis et compare vos progrès.</p>
          </div>
        </div>

        {etat === 'chargement' && <p style={{ color: 'var(--ink-soft)' }}>Chargement...</p>}

        {etat === 'deconnecte' && (
          <div className="empty-box">
            <p style={{ margin: '0 0 12px' }}>{invitation ? 'Un ami t’invite à rejoindre son cercle. ' : ''}Connecte-toi ou crée un compte gratuit pour utiliser « Mon cercle ».</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/inscription" className="btn-dark">Créer un compte</Link>
              <Link href="/login" className="btn-light">Connexion</Link>
            </div>
            {invitation && <p style={{ fontSize: 13, marginTop: 12 }}>Ton invitation est gardée : reviens ici après ta connexion.</p>}
          </div>
        )}

        {etat === 'inactif' && (
          <div className="empty-box">Cette fonction n’est pas encore activée sur le site. (Administrateur : lance le script SQL 18 dans Supabase.)</div>
        )}

        {etat === 'ok' && cercle && (
          <>
            {invitation && (
              <div className="cc-invite" role="status">
                <span>Tu as reçu une invitation (code <b>{invitation}</b>).</span>
                <span className="cc-invite-actions">
                  <button type="button" className="btn-dark" onClick={() => ajouter(invitation)} disabled={occupe}>Ajouter cet ami</button>
                  <button type="button" className="btn-light" onClick={oublierInvitation}>Ignorer</button>
                </span>
              </div>
            )}

            <div className="cc-resume">
              <div><Icon name="flame" size={20} /><b>{cercle.moi.serie}</b><span>jour{cercle.moi.serie > 1 ? 's' : ''} d’affilée</span></div>
              <div><Icon name="trophy" size={20} /><b>{cercle.moi.points_semaine}</b><span>points cette semaine</span></div>
              <div><Icon name="users" size={20} /><b>{cercle.amis.length}</b><span>ami{cercle.amis.length > 1 ? 's' : ''}</span></div>
            </div>

            <div className="segmented" style={{ margin: '16px 0' }}>
              {ONGLETS.map(([k, label, ic]) => (
                <button key={k} type="button" className={onglet === k ? 'active' : ''} onClick={() => { setOnglet(k); dire(''); }}>
                  <Icon name={ic} size={15} /> {label}{k === 'defis' && aJouer.length > 0 ? ` (${aJouer.length})` : ''}
                </button>
              ))}
            </div>

            {message.texte && <p className={message.ok ? 'success-text' : 'error-text'} role="status">{message.texte}</p>}

            {onglet === 'amis' && (
              <div className="cc-colonne">
                <section className="card cc-bloc">
                  <h2 className="brand-font">Inviter un ami</h2>
                  <p className="cc-aide">Envoie ton lien d’invitation. Ton ami n’a qu’à l’ouvrir après s’être connecté.</p>
                  <div className="cc-code" aria-label="Mon code">{cercle.moi.code}</div>
                  <div className="cc-boutons">
                    <a className="btn-dark" href={lienWhatsApp(cercle.moi.code, cercle.moi.pseudo)} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size={16} /> Inviter par WhatsApp</a>
                    <button type="button" className="btn-light" onClick={copierLien}><Icon name={copie ? 'check' : 'copy'} size={16} /> {copie ? 'Lien copié' : 'Copier le lien'}</button>
                  </div>
                  <form className="cc-ajout" onSubmit={(e) => { e.preventDefault(); ajouter(codeSaisi); }}>
                    <input value={codeSaisi} onChange={(e) => setCodeSaisi(e.target.value.toUpperCase())} placeholder="Code d’un ami" maxLength={12} aria-label="Code d’un ami" autoCapitalize="characters" autoComplete="off" />
                    <button type="submit" className="btn-dark" disabled={occupe || !codeSaisi.trim()}><Icon name="plus" size={16} /> Ajouter</button>
                  </form>
                </section>

                {cercle.recues.length > 0 && (
                  <section className="card cc-bloc">
                    <h2 className="brand-font">Invitations reçues</h2>
                    {cercle.recues.map((r) => (
                      <div className="cc-ligne" key={r.id}>
                        <span className="cc-nom">{r.pseudo}</span>
                        <span className="cc-boutons">
                          <button type="button" className="btn-dark" onClick={() => action('amis_repondre', { p_id: r.id, p_accepter: true }, 'Ami ajouté.')} disabled={occupe}>Accepter</button>
                          <button type="button" className="btn-light" onClick={() => action('amis_repondre', { p_id: r.id, p_accepter: false })} disabled={occupe}>Refuser</button>
                        </span>
                      </div>
                    ))}
                  </section>
                )}

                <section className="card cc-bloc">
                  <h2 className="brand-font">Mes amis</h2>
                  {cercle.amis.length === 0 && <p className="cc-aide">Tu n’as pas encore d’ami. Invite quelqu’un avec ton lien WhatsApp.</p>}
                  {cercle.amis.map((a) => (
                    <div className="cc-ligne" key={a.user_id}>
                      <span className="cc-avatar" aria-hidden="true">{a.pseudo.charAt(0).toUpperCase()}</span>
                      <span className="cc-nom">
                        {a.pseudo}
                        <small>{a.discret ? 'Mode discret' : (tempsRelatif(a.vu_le) || 'Pas encore actif')}</small>
                      </span>
                      {(a.badges || []).length > 0 && (
                        <span className="cc-badges-mini">
                          {a.badges.map((k) => BADGES[k] && <span key={k} title={BADGES[k].nom}><Icon name={BADGES[k].icone} size={14} /></span>)}
                        </span>
                      )}
                      {!a.discret && (
                        <span className="cc-stats"><Icon name="flame" size={14} /> {a.serie} · {a.points_semaine} pts</span>
                      )}
                      <span className="cc-boutons">
                        <button type="button" className="btn-light" onClick={() => { setOnglet('defis'); setNouveauDefi(a.user_id); }}>Défier</button>
                        <span className="cc-menu">
                          <button type="button" className="icon-btn" aria-label={`Options pour ${a.pseudo}`} onClick={() => setMenuOuvert(menuOuvert === a.user_id ? null : a.user_id)}><Icon name="more" size={18} /></button>
                          {menuOuvert === a.user_id && (
                            <span className="cc-popover">
                              <button type="button" onClick={() => { if (window.confirm(`Retirer ${a.pseudo} de tes amis ?`)) action('amis_retirer', { p_ami: a.user_id }, 'Ami retiré.'); }}>Retirer</button>
                              <button type="button" onClick={() => signaler(a)}>Signaler et bloquer</button>
                            </span>
                          )}
                        </span>
                      </span>
                    </div>
                  ))}
                  {cercle.envoyees.length > 0 && (
                    <>
                      <h3 className="cc-sous">En attente de réponse</h3>
                      {cercle.envoyees.map((r) => (
                        <div className="cc-ligne" key={r.id}>
                          <span className="cc-nom">{r.pseudo}</span>
                          <button type="button" className="btn-light" onClick={() => action('amis_annuler', { p_id: r.id })} disabled={occupe}>Annuler</button>
                        </div>
                      ))}
                    </>
                  )}
                </section>

                <section className="card cc-bloc">
                  <h2 className="brand-font">Mes réglages</h2>
                  <form onSubmit={enregistrerReglages} className="cc-reglages">
                    <label className="field"><span>Nom affiché à mes amis</span>
                      <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} maxLength={30} />
                    </label>
                    <label className="imp-check"><input type="checkbox" checked={discret} onChange={(e) => setDiscret(e.target.checked)} />
                      <span>Mode discret : mes amis ne voient ni mon activité, ni mes points, ni ma série, et je n’apparais pas dans le classement.</span></label>
                    <button type="submit" className="btn-dark" disabled={occupe}>Enregistrer</button>
                  </form>
                </section>
              </div>
            )}

            {onglet === 'defis' && (
              <div className="cc-colonne">
                {nouveauDefi ? (
                  <NouveauDefi amis={cercle.amis} amiInitial={nouveauDefi === true ? '' : nouveauDefi} onAnnuler={() => setNouveauDefi(false)}
                    onCree={(id) => router.push(`/defi/${id}`)} onErreur={(t) => dire(t)} />
                ) : (
                  <div>
                    <button type="button" className="btn-dark" onClick={() => setNouveauDefi(true)} disabled={cercle.amis.length === 0}><Icon name="plus" size={16} /> Lancer un défi</button>
                    {cercle.amis.length === 0 && <span className="cc-aide" style={{ marginLeft: 10 }}>Ajoute d’abord un ami.</span>}
                  </div>
                )}

                <section className="card cc-bloc">
                  <h2 className="brand-font">À relever</h2>
                  {aJouer.length === 0 && <p className="cc-aide">Aucun défi en attente de ta réponse.</p>}
                  {aJouer.map((d) => (
                    <div className="cc-ligne" key={d.id}>
                      <span className="cc-nom">{d.quiz_titre}<small>{d.role === 'createur' ? 'Tu as lancé ce défi contre ' : 'Défi de '}{d.autre} · {[d.matiere, d.chapitre].filter(Boolean).join(' · ')} · reste {resteAvantExpiration(d.expire_le)}</small></span>
                      <span className="cc-boutons">
                        <Link href={`/defi/${d.id}`} className="btn-dark">Jouer</Link>
                        {d.role === 'adversaire' && <button type="button" className="btn-light" onClick={() => action('defi_refuser', { p_defi: d.id })} disabled={occupe}>Refuser</button>}
                      </span>
                    </div>
                  ))}
                </section>

                {enAttente.length > 0 && (
                  <section className="card cc-bloc">
                    <h2 className="brand-font">En attente de l’adversaire</h2>
                    {enAttente.map((d) => (
                      <div className="cc-ligne" key={d.id}>
                        <span className="cc-nom">{d.quiz_titre}<small>Contre {d.autre} · ton score : {d.mon_score}/{d.mon_total} · reste {resteAvantExpiration(d.expire_le)}</small></span>
                      </div>
                    ))}
                  </section>
                )}

                <section className="card cc-bloc">
                  <h2 className="brand-font">Terminés</h2>
                  {termines.length === 0 && <p className="cc-aide">Aucun défi terminé pour le moment.</p>}
                  {termines.map((d) => (
                    <div className="cc-ligne" key={d.id}>
                      <span className="cc-nom">{d.quiz_titre}<small>Contre {d.autre} · {d.mon_score}/{d.mon_total} contre {d.son_score}/{d.mon_total}</small></span>
                      <span className={`badge ${d.gagnant === 'moi' ? 'publie' : 'brouillon'}`}>{d.gagnant === 'moi' ? 'Gagné' : d.gagnant === 'lui' ? 'Perdu' : 'Égalité'}</span>
                    </div>
                  ))}
                </section>
              </div>
            )}

            {onglet === 'classement' && (
              <section className="card cc-bloc">
                <h2 className="brand-font">Classement de la semaine</h2>
                <p className="cc-aide">Du lundi au dimanche, entre toi et tes amis. Plafond de 100 points par jour.</p>
                {classement.map((c, i) => (
                  <div className={`cc-ligne cc-rang${c.moi ? ' moi' : ''}`} key={c.user_id}>
                    <span className="cc-place">{i + 1}</span>
                    <span className="cc-nom">{c.pseudo}{c.moi ? ' (toi)' : ''}<small>{c.serie} jour{c.serie > 1 ? 's' : ''} d’affilée</small></span>
                    <b>{c.points} pts</b>
                  </div>
                ))}
                {classement.length <= 1 && <p className="cc-aide">Ajoute des amis pour comparer vos points.</p>}
                <h3 className="cc-sous">Comment gagner des points</h3>
                <ul className="cc-liste">
                  <li>Terminer un quiz : 3 points, plus 2 par bonne réponse, plus 5 si tu as 80 % ou plus.</li>
                  <li>Marquer un cours ou un exercice comme terminé : 5 points.</li>
                  <li>Répondre à un défi : 10 points, et 15 de plus si tu le gagnes.</li>
                  <li>Un même quiz ne rapporte des points que 2 fois par jour.</li>
                </ul>
              </section>
            )}
            {onglet === 'objectifs' && (
              <div className="cc-colonne">
                {nouvelObjectif ? (
                  <NouvelObjectif amis={cercle.amis} onAnnuler={() => setNouvelObjectif(false)}
                    onCree={() => { setNouvelObjectif(false); dire('Objectif créé. Tes amis doivent l’accepter.', true); charger(); }} onErreur={(t) => dire(t)} />
                ) : (
                  <div>
                    <button type="button" className="btn-dark" onClick={() => setNouvelObjectif(true)} disabled={cercle.amis.length === 0}><Icon name="plus" size={16} /> Créer un objectif</button>
                    {cercle.amis.length === 0 && <span className="cc-aide" style={{ marginLeft: 10 }}>Ajoute d’abord un ami.</span>}
                  </div>
                )}
                {objectifs.length === 0 && !nouvelObjectif && (
                  <p className="cc-aide">Un objectif collectif, c’est un total de points à atteindre ensemble avant dimanche. Tout le monde y contribue.</p>
                )}
                {objectifs.map((o) => {
                  const pct = Math.min(100, Math.round((o.total / o.cible) * 100));
                  return (
                    <section className="card cc-bloc" key={o.id}>
                      <div className="cc-obj-tete">
                        <h2 className="brand-font">{o.nom}</h2>
                        <span className={`badge ${o.atteint ? 'publie' : 'brouillon'}`}>{o.atteint ? 'Atteint' : o.termine ? 'Terminé' : `${o.jours_restants} j restant${o.jours_restants > 1 ? 's' : ''}`}</span>
                      </div>
                      <div className="cc-progres" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
                      <p className="cc-aide">{o.total} points sur {o.cible} · semaine du {new Date(o.debut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</p>
                      {o.membres.map((m, k) => (
                        <div className="cc-ligne" key={k}>
                          <span className="cc-nom">{m.pseudo}{m.moi ? ' (toi)' : ''}<small>{m.statut === 'invite' ? 'Invitation en attente' : m.points == null ? 'Mode discret' : `${m.points} points`}</small></span>
                        </div>
                      ))}
                      <div className="cc-boutons" style={{ marginTop: 10 }}>
                        {o.mon_statut === 'invite' ? (
                          <>
                            <button type="button" className="btn-dark" onClick={() => action('objectif_repondre', { p_id: o.id, p_accepter: true }, 'Tu participes à cet objectif.')} disabled={occupe}>Rejoindre</button>
                            <button type="button" className="btn-light" onClick={() => action('objectif_repondre', { p_id: o.id, p_accepter: false })} disabled={occupe}>Refuser</button>
                          </>
                        ) : (
                          <button type="button" className="btn-light" onClick={() => { if (window.confirm(o.createur ? 'Supprimer cet objectif pour tout le monde ?' : 'Quitter cet objectif ?')) action('objectif_quitter', { p_id: o.id }); }} disabled={occupe}>{o.createur ? 'Supprimer' : 'Quitter'}</button>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}

            {onglet === 'badges' && (
              <section className="card cc-bloc">
                <h2 className="brand-font">Mes badges</h2>
                <p className="cc-aide">Tes amis voient les badges que tu as obtenus (sauf en mode discret).</p>
                <div className="cc-badges">
                  {badges.map((b) => {
                    const d = BADGES[b.cle]; if (!d) return null;
                    return (
                      <div key={b.cle} className={`cc-badge${b.obtenu ? ' ok' : ''}`}>
                        <span className="cc-badge-ico"><Icon name={b.obtenu ? d.icone : 'lock'} size={22} /></span>
                        <b>{d.nom}</b>
                        <span>{d.regle}</span>
                        {b.obtenu ? <em>Obtenu</em> : <span className="cc-progres petit"><i style={{ width: `${Math.round((b.progres / b.cible) * 100)}%` }} /></span>}
                        {!b.obtenu && <small>{b.progres} / {b.cible}</small>}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}

function NouveauDefi({ amis, amiInitial, onAnnuler, onCree, onErreur }) {
  const [ami, setAmi] = useState(amiInitial || '');
  const [quiz, setQuiz] = useState([]);
  const [q, setQ] = useState('');
  const [quizId, setQuizId] = useState('');
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    supabase.from('quiz').select('id, titre, chapitres(nom, matieres(nom, niveaux(nom)))').eq('statut', 'publie').order('cree_le', { ascending: false }).limit(300)
      .then(({ data }) => setQuiz(data || []));
  }, []);

  const filtres = quiz.filter((x) => {
    const t = `${x.titre} ${x.chapitres?.nom || ''} ${x.chapitres?.matieres?.nom || ''} ${x.chapitres?.matieres?.niveaux?.nom || ''}`.toLowerCase();
    return !q.trim() || t.includes(q.trim().toLowerCase());
  }).slice(0, 40);

  async function lancer(e) {
    e.preventDefault();
    if (!ami || !quizId) return;
    setOccupe(true);
    const r = await appeler('defi_creer', { p_ami: ami, p_quiz: quizId });
    setOccupe(false);
    if (r.erreur) { onErreur(r.erreur); return; }
    onCree(r.data);
  }

  return (
    <form className="card cc-bloc" onSubmit={lancer}>
      <h2 className="brand-font">Lancer un défi</h2>
      <label className="field"><span>Contre quel ami ?</span>
        <select value={ami} onChange={(e) => setAmi(e.target.value)}>
          <option value="">Choisir…</option>
          {amis.map((a) => <option key={a.user_id} value={a.user_id}>{a.pseudo}</option>)}
        </select>
      </label>
      <label className="field"><span>Chercher un quiz (matière, chapitre…)</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex. fonctions" />
      </label>
      <div className="cc-quiz" role="radiogroup" aria-label="Quiz">
        {filtres.length === 0 && <p className="cc-aide">Aucun quiz trouvé.</p>}
        {filtres.map((x) => (
          <label key={x.id} className={`cc-quiz-ligne${quizId === x.id ? ' sel' : ''}`}>
            <input type="radio" name="quiz" value={x.id} checked={quizId === x.id} onChange={() => setQuizId(x.id)} />
            <span>{x.titre}<small>{[x.chapitres?.matieres?.niveaux?.nom, x.chapitres?.matieres?.nom, x.chapitres?.nom].filter(Boolean).join(' · ')}</small></span>
          </label>
        ))}
      </div>
      <p className="cc-aide">Tu réponds d’abord, puis ton ami a 48 heures pour relever le défi.</p>
      <div className="cc-boutons">
        <button type="submit" className="btn-dark" disabled={occupe || !ami || !quizId}>Lancer et jouer</button>
        <button type="button" className="btn-light" onClick={onAnnuler}>Annuler</button>
      </div>
    </form>
  );
}

function NouvelObjectif({ amis, onAnnuler, onCree, onErreur }) {
  const [nom, setNom] = useState('Révisions de la semaine');
  const [cible, setCible] = useState(300);
  const [choisis, setChoisis] = useState([]);
  const [occupe, setOccupe] = useState(false);
  const bascule = (id) => setChoisis((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < 5 ? [...c, id] : c));

  async function creer(e) {
    e.preventDefault();
    setOccupe(true);
    const r = await appeler('objectif_creer', { p_nom: nom, p_cible: Number(cible), p_amis: choisis });
    setOccupe(false);
    if (r.erreur) { onErreur(r.erreur); return; }
    onCree();
  }

  return (
    <form className="card cc-bloc" onSubmit={creer}>
      <h2 className="brand-font">Créer un objectif collectif</h2>
      <label className="field"><span>Nom de l’objectif</span><input value={nom} onChange={(e) => setNom(e.target.value)} maxLength={40} /></label>
      <label className="field"><span>Points à atteindre ensemble cette semaine (100 à 5000)</span>
        <input type="number" min={100} max={5000} step={50} value={cible} onChange={(e) => setCible(e.target.value)} /></label>
      <p className="cc-aide">Repère : un élève régulier gagne 50 à 100 points par jour. À 3 amis, 300 points sont un bon début.</p>
      <p className="cc-aide" style={{ marginBottom: 4 }}>Avec qui ? (5 amis maximum)</p>
      <div className="cc-quiz">
        {amis.map((a) => (
          <label key={a.user_id} className={`cc-quiz-ligne${choisis.includes(a.user_id) ? ' sel' : ''}`}>
            <input type="checkbox" checked={choisis.includes(a.user_id)} onChange={() => bascule(a.user_id)} />
            <span>{a.pseudo}</span>
          </label>
        ))}
      </div>
      <div className="cc-boutons">
        <button type="submit" className="btn-dark" disabled={occupe || choisis.length === 0}>Créer</button>
        <button type="button" className="btn-light" onClick={onAnnuler}>Annuler</button>
      </div>
    </form>
  );
}
