'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { fcfa, dateFr, STATUTS_TX, libellePortee } from '../../lib/abonnement';

const SECTIONS = [
  ['chiffres', 'Chiffres'], ['transactions', 'Transactions'], ['abonnements', 'Abonnements'], ['plans', 'Plans'], ['journal', 'Journal'],
];

function heure(d) {
  try { return new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return d; }
}
function messageErreur(e) {
  const m = e?.message || '';
  if (m.includes('does not exist') || m.includes('Could not find')) return "Le système d'abonnement n'est pas encore activé : lance le script SQL 10 dans Supabase.";
  if (m.includes('eleve_introuvable')) return "Aucun élève avec cet e-mail.";
  if (m.includes('classe_requise')) return 'Choisis une classe pour cette formule.';
  if (m.includes('reserve_aux_admins')) return 'Action réservée aux administrateurs.';
  return m;
}

export default function AbonnementsAdmin() {
  const [section, setSection] = useState('chiffres');
  const [niveaux, setNiveaux] = useState([]);
  const [plans, setPlans] = useState([]);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');

  const chargerBase = useCallback(async () => {
    const [{ data: n }, { data: p, error }] = await Promise.all([
      supabase.from('niveaux').select('id, nom, ordre').order('ordre'),
      supabase.from('plans').select('*').order('ordre'),
    ]);
    setNiveaux(n || []); setPlans(p || []);
    if (error) setErreur(messageErreur(error));
  }, []);
  useEffect(() => { chargerBase(); }, [chargerBase]);

  const ctx = { niveaux, plans, setErreur, setInfo, chargerBase };
  return (
    <>
      <div className="ab-sub" role="tablist">
        {SECTIONS.map(([k, l]) => (
          <button key={k} type="button" className={section === k ? 'on' : ''} onClick={() => { setSection(k); setErreur(''); setInfo(''); }}>{l}</button>
        ))}
      </div>
      {erreur && <p className="error-text">{erreur}</p>}
      {info && <p className="ab-info">{info}</p>}
      {section === 'chiffres' && <Chiffres {...ctx} />}
      {section === 'transactions' && <Transactions {...ctx} />}
      {section === 'abonnements' && <Abonnements {...ctx} />}
      {section === 'plans' && <Plans {...ctx} />}
      {section === 'journal' && <Journal {...ctx} />}
    </>
  );
}

/* ---------------- Chiffres ---------------- */
function Chiffres({ setErreur }) {
  const [jours, setJours] = useState(30);
  const [s, setS] = useState(null);
  useEffect(() => {
    let actif = true;
    (async () => {
      const fin = new Date(Date.now() + 60000); const debut = new Date(Date.now() - jours * 86400000);
      const { data, error } = await supabase.rpc('admin_stats', { p_debut: debut.toISOString(), p_fin: fin.toISOString() });
      if (!actif) return;
      if (error) setErreur(messageErreur(error)); else { setErreur(''); setS(data); }
    })();
    return () => { actif = false; };
  }, [jours, setErreur]);
  if (!s) return <p style={{ color: 'var(--ink-soft)' }}>Chargement...</p>;
  const cartes = [
    ['Encaissé', fcfa(s.encaisse), `${s.nb_payees} paiement${s.nb_payees > 1 ? 's' : ''} confirmé${s.nb_payees > 1 ? 's' : ''}`, 'ok'],
    ['Abonnements actifs', s.actifs, 'en ce moment', ''],
    ['Nouveaux abonnements', s.nouveaux, `sur ${jours} jours`, ''],
    ['Abonnements expirés', s.expires, `sur ${jours} jours`, ''],
    ['En attente', s.en_attente_nb, `${fcfa(s.en_attente_montant)} non encaissés`, 'wait'],
    ['Échoués ou annulés', s.echouees, `sur ${jours} jours`, 'bad'],
    ['Remboursé', fcfa(s.rembourse_montant), `sur ${jours} jours`, ''],
    ['À vérifier', s.a_verifier, 'transactions signalées', s.a_verifier ? 'bad' : ''],
  ];
  return (
    <>
      <div className="admin-filters">
        <select value={jours} onChange={(e) => setJours(Number(e.target.value))} aria-label="Période">
          <option value={7}>7 derniers jours</option><option value={30}>30 derniers jours</option>
          <option value={90}>90 derniers jours</option><option value={365}>12 derniers mois</option>
        </select>
      </div>
      <div className="ab-kpis">
        {cartes.map(([t, v, sous, cls]) => (
          <div key={t} className={`ab-kpi ${cls}`}><span>{t}</span><b className="brand-font">{v}</b><em>{sous}</em></div>
        ))}
      </div>
      <p className="ab-note">L'argent « encaissé » ne compte que les paiements confirmés par le prestataire. Les montants sont bruts : les frais du prestataire ne sont pas déduits.</p>
      <h3 className="ab-h3">Ventes par formule</h3>
      {s.par_plan.length === 0 ? <div className="empty-box">Aucune vente sur la période.</div> : (
        <div className="ab-table">
          {s.par_plan.map((p) => (<div key={p.plan_nom} className="ab-row"><b>{p.plan_nom}</b><span>{p.ventes} vente{p.ventes > 1 ? 's' : ''}</span><b>{fcfa(p.montant)}</b></div>))}
        </div>
      )}
    </>
  );
}

/* ---------------- Transactions ---------------- */
function Transactions({ setErreur, setInfo }) {
  const [lignes, setLignes] = useState([]);
  const [filtre, setFiltre] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const charger = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_transactions', { p_limite: 300 });
    if (error) setErreur(messageErreur(error)); else setLignes(data || []);
  }, [setErreur]);
  useEffect(() => { charger(); }, [charger]);

  async function reconcilier() {
    setBusy('rec'); setErreur(''); setInfo('');
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const rep = await fetch('/api/paiement/reconcilier', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } });
      const j = await rep.json();
      if (!rep.ok) setErreur(j.erreur || 'La vérification a échoué.');
      else setInfo(`${j.verifiees} vérifiée(s) : ${j.payees} payée(s), ${j.echouees} échouée(s), ${j.anomalies} anomalie(s), ${j.incertaines} incertaine(s).`);
    } catch (e) { setErreur('Problème de connexion.'); }
    await charger(); setBusy('');
  }
  async function rembourser(t) {
    const motif = window.prompt(`Rembourse d'abord ${t.nom || t.email} chez le prestataire, puis note ici le motif. Cela coupera son accès.`);
    if (!motif) return;
    setBusy(t.reference);
    const { error } = await supabase.rpc('admin_marquer_rembourse', { p_reference: t.reference, p_motif: motif });
    if (error) setErreur(messageErreur(error)); else await charger();
    setBusy('');
  }

  const visibles = lignes.filter((t) => {
    if (filtre === 'verifier' && !(t.a_verifier && t.statut !== 'payee')) return false;
    if (filtre && filtre !== 'verifier' && t.statut !== filtre) return false;
    const needle = q.trim().toLowerCase();
    return !needle || [t.email, t.nom, t.reference].some((x) => (x || '').toLowerCase().includes(needle));
  });
  return (
    <>
      <div className="admin-filters">
        <input placeholder="Rechercher (e-mail, nom, référence)" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={filtre} onChange={(e) => setFiltre(e.target.value)} aria-label="Filtrer par statut">
          <option value="">Tous les statuts</option><option value="verifier">À vérifier</option>
          {Object.entries(STATUTS_TX).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="btn-dark" onClick={reconcilier} disabled={busy === 'rec'}>{busy === 'rec' ? 'Vérification...' : 'Vérifier les paiements douteux'}</button>
      </div>
      {visibles.length === 0 && <div className="empty-box">Aucune transaction.</div>}
      {visibles.map((t) => (
        <div className="item-card" key={t.reference}>
          <div className="item-top">
            <div style={{ minWidth: 0 }}>
              <p className="item-title">{t.nom || t.email || 'Élève'} · {t.plan_nom}</p>
              <div className="item-meta" style={{ overflowWrap: 'anywhere' }}>{t.email} · {heure(t.cree_le)} · {t.reference}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <b>{fcfa(t.montant)}</b>
              <div><span className={`mab-st ${t.statut}`}>{STATUTS_TX[t.statut]}</span>{t.a_verifier && t.statut !== 'payee' && <span className="mab-st echouee" style={{ marginLeft: 6 }}>À vérifier</span>}</div>
            </div>
          </div>
          {t.motif && <p className="ab-note" style={{ margin: '8px 0 0' }}>{t.motif}</p>}
          {t.statut === 'payee' && (
            <div className="item-actions"><button className="btn-light btn-danger" disabled={busy === t.reference} onClick={() => rembourser(t)}>Marquer comme remboursé</button></div>
          )}
        </div>
      ))}
    </>
  );
}

/* ---------------- Abonnements ---------------- */
function Abonnements({ niveaux, plans, setErreur, setInfo }) {
  const [lignes, setLignes] = useState([]);
  const [q, setQ] = useState('');
  const [filtre, setFiltre] = useState('actifs');
  const [form, setForm] = useState({ email: '', plan: '', niveau: '', jours: '' });
  const [busy, setBusy] = useState('');
  const charger = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_abonnements');
    if (error) setErreur(messageErreur(error)); else setLignes(data || []);
  }, [setErreur]);
  useEffect(() => { charger(); }, [charger]);

  const etat = (a) => (a.statut === 'annule' ? 'annule' : new Date(a.fin) <= new Date() ? 'expire' : 'actif');
  const visibles = lignes.filter((a) => {
    const e = etat(a);
    if (filtre === 'actifs' && e !== 'actif') return false;
    if (filtre === 'expires' && e !== 'expire') return false;
    const needle = q.trim().toLowerCase();
    return !needle || [a.email, a.nom].some((x) => (x || '').toLowerCase().includes(needle));
  });
  const planChoisi = plans.find((p) => p.id === form.plan);

  async function accorder(e) {
    e.preventDefault(); setErreur(''); setInfo('');
    if (!form.email || !form.plan) { setErreur('Indique l\'e-mail et la formule.'); return; }
    setBusy('add');
    const { error } = await supabase.rpc('admin_accorder_abonnement', {
      p_email: form.email, p_plan: form.plan, p_niveau: form.niveau || null, p_jours: form.jours ? Number(form.jours) : null,
    });
    if (error) setErreur(messageErreur(error)); else { setInfo('Abonnement accordé (inscrit dans le journal).'); setForm({ email: '', plan: '', niveau: '', jours: '' }); await charger(); }
    setBusy('');
  }
  async function annuler(a) {
    const motif = window.prompt(`Annuler l'abonnement de ${a.nom || a.email} ? Motif :`);
    if (!motif) return;
    setBusy(a.id);
    const { error } = await supabase.rpc('admin_annuler_abonnement', { p_abonnement: a.id, p_motif: motif });
    if (error) setErreur(messageErreur(error)); else await charger();
    setBusy('');
  }

  return (
    <>
      <form className="card ab-grant" onSubmit={accorder}>
        <h3 className="ab-h3" style={{ marginTop: 0 }}>Accorder un abonnement manuellement</h3>
        <p className="ab-note">Pour un paiement reçu hors du site (Wave direct, espèces). L'action est enregistrée dans le journal.</p>
        <div className="ab-grant-row">
          <input type="email" placeholder="E-mail de l'élève" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
            <option value="">Formule...</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.nom} ({p.duree_jours} j)</option>)}
          </select>
          {planChoisi?.portee === 'une_classe' && (
            <select value={form.niveau} onChange={(e) => setForm({ ...form, niveau: e.target.value })}>
              <option value="">Classe...</option>{niveaux.map((n) => <option key={n.id} value={n.id}>{n.nom}</option>)}
            </select>
          )}
          <input type="number" min="1" placeholder="Jours (option)" value={form.jours} onChange={(e) => setForm({ ...form, jours: e.target.value })} />
          <button className="btn-dark" disabled={busy === 'add'}>{busy === 'add' ? '...' : 'Accorder'}</button>
        </div>
      </form>
      <div className="admin-filters">
        <input placeholder="Rechercher un élève (e-mail, nom)" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={filtre} onChange={(e) => setFiltre(e.target.value)} aria-label="Filtrer">
          <option value="actifs">Actifs</option><option value="expires">Expirés</option><option value="tous">Tous</option>
        </select>
      </div>
      {visibles.length === 0 && <div className="empty-box">Aucun abonnement.</div>}
      {visibles.map((a) => {
        const e = etat(a);
        return (
          <div className="item-card" key={a.id}>
            <div className="item-top">
              <div style={{ minWidth: 0 }}>
                <p className="item-title">{a.nom || a.email} · {a.plan_nom}</p>
                <div className="item-meta" style={{ overflowWrap: 'anywhere' }}>{a.email} · {libellePortee(a.niveaux_ids, niveaux)} · {dateFr(a.debut)} → {dateFr(a.fin)} · {a.origine === 'admin' ? 'manuel' : 'paiement'}</div>
              </div>
              <span className={`badge ${e === 'actif' ? 'publie' : 'brouillon'}`}>{e === 'actif' ? 'Actif' : e === 'expire' ? 'Expiré' : 'Annulé'}</span>
            </div>
            {e === 'actif' && <div className="item-actions"><button className="btn-light btn-danger" disabled={busy === a.id} onClick={() => annuler(a)}>Annuler l'abonnement</button></div>}
          </div>
        );
      })}
    </>
  );
}

/* ---------------- Plans ---------------- */
function Plans({ plans, niveaux, setErreur, setInfo, chargerBase }) {
  return (
    <>
      <p className="ab-note">Une modification de prix ou de durée s'applique aux NOUVEAUX achats seulement : les transactions déjà créées gardent leur montant.</p>
      {plans.map((p) => <PlanEditeur key={p.id} plan={p} niveaux={niveaux} setErreur={setErreur} setInfo={setInfo} chargerBase={chargerBase} />)}
    </>
  );
}

function PlanEditeur({ plan, niveaux, setErreur, setInfo, chargerBase }) {
  const [f, setF] = useState(() => ({ ...plan, avantagesTexte: (plan.avantages || []).join('\n') }));
  const [busy, setBusy] = useState(false);
  const modifie = useMemo(() => JSON.stringify({ ...plan, avantagesTexte: (plan.avantages || []).join('\n') }) !== JSON.stringify(f), [plan, f]);

  async function enregistrer() {
    setErreur(''); setInfo('');
    const prix = Number(f.prix_fcfa), duree = Number(f.duree_jours);
    if (!(prix > 0) || !Number.isInteger(prix)) { setErreur('Le prix doit être un nombre entier de FCFA supérieur à 0.'); return; }
    if (!(duree > 0) || !Number.isInteger(duree)) { setErreur('La durée doit être un nombre entier de jours supérieur à 0.'); return; }
    if (f.portee === 'selection' && !(f.niveaux_autorises || []).length) { setErreur('Choisis au moins une classe pour ce périmètre.'); return; }
    setBusy(true);
    const { error } = await supabase.from('plans').update({
      nom: f.nom, description: f.description, prix_fcfa: prix, duree_jours: duree, portee: f.portee,
      niveaux_autorises: f.portee === 'toutes' ? null : (f.niveaux_autorises && f.niveaux_autorises.length ? f.niveaux_autorises : null),
      avantages: f.avantagesTexte.split('\n').map((x) => x.trim()).filter(Boolean),
      mis_en_avant: f.mis_en_avant, actif: f.actif,
    }).eq('id', plan.id);
    if (error) setErreur(messageErreur(error)); else { setInfo(`Formule « ${f.nom} » enregistrée.`); await chargerBase(); }
    setBusy(false);
  }
  const basculerNiveau = (id) => setF((x) => {
    const cur = x.niveaux_autorises || [];
    return { ...x, niveaux_autorises: cur.includes(id) ? cur.filter((n) => n !== id) : [...cur, id] };
  });

  return (
    <div className="item-card ab-plan-ed">
      <div className="ab-plan-grid">
        <div className="field"><label>Nom</label><input value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /></div>
        <div className="field"><label>Prix (FCFA)</label><input type="number" min="1" value={f.prix_fcfa} onChange={(e) => setF({ ...f, prix_fcfa: e.target.value })} /></div>
        <div className="field"><label>Durée (jours)</label><input type="number" min="1" value={f.duree_jours} onChange={(e) => setF({ ...f, duree_jours: e.target.value })} /></div>
        <div className="field"><label>Périmètre</label>
          <select value={f.portee} onChange={(e) => setF({ ...f, portee: e.target.value })}>
            <option value="une_classe">Une classe, au choix de l'élève</option>
            <option value="selection">Des classes fixes</option>
            <option value="toutes">Toutes les classes</option>
          </select>
        </div>
      </div>
      {f.portee !== 'toutes' && (
        <div className="ab-niv">
          <span>{f.portee === 'selection' ? 'Classes incluses :' : 'Classes proposées (aucune cochée = toutes) :'}</span>
          {niveaux.map((n) => (
            <label key={n.id} className="checkbox-row"><input type="checkbox" checked={(f.niveaux_autorises || []).includes(n.id)} onChange={() => basculerNiveau(n.id)} />{n.nom}</label>
          ))}
        </div>
      )}
      <div className="field"><label>Description</label><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      <div className="field"><label>Avantages (un par ligne)</label><textarea rows={4} value={f.avantagesTexte} onChange={(e) => setF({ ...f, avantagesTexte: e.target.value })} /></div>
      <div className="ab-plan-foot">
        <label className="checkbox-row"><input type="checkbox" checked={f.actif} onChange={(e) => setF({ ...f, actif: e.target.checked })} />Visible et en vente</label>
        <label className="checkbox-row"><input type="checkbox" checked={f.mis_en_avant} onChange={(e) => setF({ ...f, mis_en_avant: e.target.checked })} />Mettre en avant (« Recommandée »)</label>
        <button className="btn-dark" disabled={!modifie || busy} onClick={enregistrer}>{busy ? 'Enregistrement...' : 'Enregistrer'}</button>
      </div>
    </div>
  );
}

/* ---------------- Journal ---------------- */
function Journal({ setErreur }) {
  const [lignes, setLignes] = useState([]);
  useEffect(() => {
    supabase.from('audit_admin').select('*').order('cree_le', { ascending: false }).limit(100)
      .then(({ data, error }) => { if (error) setErreur(messageErreur(error)); else setLignes(data || []); });
  }, [setErreur]);
  const noms = { plan_modifie: 'Formule modifiée', abonnement_accorde: 'Abonnement accordé', abonnement_annule: 'Abonnement annulé', transaction_remboursee: 'Transaction remboursée' };
  if (!lignes.length) return <div className="empty-box">Le journal est vide.</div>;
  return (
    <div className="ab-table">
      {lignes.map((l) => (
        <div key={l.id} className="ab-row ab-journal">
          <b>{noms[l.action] || l.action}</b>
          <span>{heure(l.cree_le)}</span>
          <em>{l.cible}{l.detail?.motif ? ` · ${l.detail.motif}` : ''}</em>
        </div>
      ))}
    </div>
  );
}
