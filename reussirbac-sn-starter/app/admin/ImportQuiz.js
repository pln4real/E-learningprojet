'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { cleChapitre } from '../../lib/texte';
import { lireJson, analyser, chapitreCorrespondant } from '../../lib/importQuiz';

const NOUVEAU = '__nouveau__';
const IGNORER = '__ignorer__';

export default function ImportQuiz({ niveaux, onFini }) {
  const [niveauId, setNiveauId] = useState('');
  const [matieres, setMatieres] = useState([]);
  const [matiereId, setMatiereId] = useState('');
  const [chapitres, setChapitres] = useState([]);
  const [existants, setExistants] = useState([]);
  const [texte, setTexte] = useState('');
  const [lignes, setLignes] = useState([]);
  const [erreur, setErreur] = useState('');
  const [acces, setAcces] = useState('gratuit');
  const [publie, setPublie] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [bilan, setBilan] = useState('');

  useEffect(() => {
    setMatiereId(''); setLignes([]);
    if (!niveauId) { setMatieres([]); return; }
    supabase.from('matieres').select('*').eq('niveau_id', niveauId).order('ordre').then(({ data }) => setMatieres(data || []));
  }, [niveauId]);

  useEffect(() => {
    setLignes([]); setChapitres([]); setExistants([]);
    if (!matiereId) return;
    supabase.from('chapitres').select('id, nom, ordre').eq('matiere_id', matiereId).order('ordre').then(async ({ data }) => {
      const chs = data || [];
      setChapitres(chs);
      if (chs.length) {
        const { data: qs } = await supabase.from('quiz').select('chapitre_id, titre').in('chapitre_id', chs.map((c) => c.id));
        setExistants(qs || []);
      }
    });
  }, [matiereId]);

  function preparer(t) {
    setErreur(''); setBilan('');
    try {
      const { quiz, erreur: e } = analyser(lireJson(t));
      if (e) { setErreur(e); setLignes([]); return; }
      setLignes(quiz.map((q) => {
        const m = chapitreCorrespondant(q.chapitre, chapitres);
        const chap = m.chapitre ? m.chapitre.id : NOUVEAU;
        const doublon = !!m.chapitre && existants.some((x) => x.chapitre_id === m.chapitre.id && (x.titre || '').trim().toLowerCase() === q.titre.toLowerCase());
        return { ...q, chap: q.questions.length ? chap : IGNORER, niveau: m.niveau, doublon, etat: 'attente', msg: '' };
      }));
    } catch (e) {
      setErreur("Ce texte n'est pas un JSON valide. Redemande à l'IA le fichier complet, sans texte autour. (" + e.message + ')');
      setLignes([]);
    }
  }

  async function chargerFichiers(e) {
    const fs = Array.from(e.target.files || []);
    const parts = await Promise.all(fs.map((f) => f.text()));
    try {
      const tous = parts.flatMap((p) => { const d = lireJson(p); return Array.isArray(d) ? d : (d.quiz || []); });
      const t = JSON.stringify({ quiz: tous });
      setTexte(''); preparer(t);
    } catch (err) { setErreur("Un des fichiers n'est pas un JSON valide. (" + err.message + ')'); setLignes([]); }
  }

  function maj(i, patch) { setLignes((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l))); }
  const aFaire = lignes.filter((l) => l.chap !== IGNORER && l.etat !== 'ok');

  async function importer() {
    if (!matiereId || !aFaire.length) return;
    setEnCours(true); setBilan('');
    let liste = [...chapitres];
    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i];
      if (l.chap === IGNORER || l.etat === 'ok') continue;
      maj(i, { etat: 'envoi', msg: '' });
      try {
        let chapitreId = l.chap;
        if (chapitreId === NOUVEAU) {
          const nom = l.chapitre || l.titre;
          if (!nom) throw new Error('Nom de chapitre vide.');
          const ex = liste.find((c) => cleChapitre(c.nom) === cleChapitre(nom));
          if (ex) chapitreId = ex.id;
          else {
            const ordre = liste.reduce((m, c) => Math.max(m, c.ordre || 0), 0) + 1;
            const { data, error } = await supabase.from('chapitres').insert({ nom, matiere_id: matiereId, ordre }).select().single();
            if (error) throw new Error('Chapitre : ' + error.message);
            liste = [...liste, data]; chapitreId = data.id;
          }
        }
        const { data: qz, error } = await supabase.from('quiz').insert({
          chapitre_id: chapitreId, titre: l.titre || 'Quiz', description: '', acces, statut: publie ? 'publie' : 'brouillon',
        }).select().single();
        if (error) throw new Error(error.message);
        const rows = l.questions.map((q, k) => ({ quiz_id: qz.id, ordre: k, enonce: q.enonce, options: q.options, bonne_reponse: q.bonne, explication: q.explication || null }));
        const { error: eq } = await supabase.from('quiz_questions').insert(rows);
        if (eq) { await supabase.from('quiz').delete().eq('id', qz.id); throw new Error(eq.message); }
        maj(i, { etat: 'ok', chap: chapitreId });
      } catch (e) { maj(i, { etat: 'erreur', msg: e.message }); }
    }
    setChapitres(liste); setEnCours(false);
    setBilan('fini');
  }

  const nOk = lignes.filter((l) => l.etat === 'ok').length;
  const nErr = lignes.filter((l) => l.etat === 'erreur').length;

  return (
    <div className="card imp-wrap" style={{ padding: 20 }}>
      <h2 className="brand-font" style={{ fontSize: 20, margin: '0 0 4px' }}>Importer des quiz (fichier JSON)</h2>
      <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 16px' }}>
        Dépose le fichier produit par l'IA : chaque quiz est rattaché à son chapitre d'après son nom. Tu relis, puis tu enregistres. Par défaut, tout reste en brouillon.
      </p>
      <div className="admin-field-row">
        <label className="field"><span>Classe</span>
          <select value={niveauId} onChange={(e) => setNiveauId(e.target.value)} disabled={enCours}>
            <option value="">Choisir…</option>
            {niveaux.map((n) => <option key={n.id} value={n.id}>{n.nom}</option>)}
          </select></label>
        <label className="field"><span>Matière</span>
          <select value={matiereId} onChange={(e) => setMatiereId(e.target.value)} disabled={!niveauId || enCours}>
            <option value="">Choisir…</option>
            {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
          </select></label>
      </div>
      <div className="admin-field-row">
        <label className="field"><span>Accès</span>
          <select value={acces} onChange={(e) => setAcces(e.target.value)} disabled={enCours}>
            <option value="gratuit">Gratuit</option><option value="abonne">Abonnés</option>
          </select></label>
      </div>
      <label className="imp-check"><input type="checkbox" checked={publie} onChange={(e) => setPublie(e.target.checked)} disabled={enCours} />
        <span>Publier tout de suite (sinon brouillon)</span></label>

      {matiereId && (
        <>
          <label className="field" style={{ marginTop: 14 }}><span>Fichier(s) JSON</span>
            <input type="file" accept=".json,application/json,text/plain" multiple onChange={chargerFichiers} disabled={enCours} /></label>
          <label className="field"><span>… ou colle le texte JSON ici</span>
            <textarea rows={5} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder='{"quiz":[ ... ]}' disabled={enCours} /></label>
          <button type="button" className="btn-dark" onClick={() => preparer(texte)} disabled={!texte.trim() || enCours}>Analyser le texte</button>
        </>
      )}
      {erreur && <p className="error-text" role="alert" style={{ marginTop: 12 }}>{erreur}</p>}

      {lignes.length > 0 && (
        <div className="imp-liste">
          {lignes.map((l, i) => (
            <div key={i} className={`imp-row etat-${l.etat}${l.chap === IGNORER ? ' ignore' : ''}`}>
              <div className="imp-nom"><span>{l.titre || '(sans titre)'}</span><small>{l.questions.length} question{l.questions.length > 1 ? 's' : ''}</small></div>
              <div className="imp-etat">
                {l.etat === 'ok' ? <span className="imp-b ok">Importé</span>
                  : l.etat === 'envoi' ? <span className="imp-b">Envoi…</span>
                  : l.etat === 'erreur' ? <span className="imp-b err">Échec</span>
                  : l.chap === IGNORER ? <span className="imp-b">Ignoré</span>
                  : l.chap === NOUVEAU ? <span className="imp-b warn">Nouveau chapitre</span>
                  : l.niveau === 'verifier' ? <span className="imp-b warn">À vérifier</span>
                  : <span className="imp-b ok">Sûr</span>}
                {l.doublon && l.etat === 'attente' && <span className="imp-b warn">Doublon ?</span>}
              </div>
              <div className="imp-champs">
                <select value={l.chap} onChange={(e) => maj(i, { chap: e.target.value, niveau: 'sur' })} disabled={enCours || l.etat === 'ok'} aria-label="Chapitre">
                  {chapitres.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  <option value={NOUVEAU}>+ Nouveau chapitre : {l.chapitre || l.titre}</option>
                  <option value={IGNORER}>Ne pas importer</option>
                </select>
                <input className="imp-wide" value={l.titre} onChange={(e) => maj(i, { titre: e.target.value })} disabled={enCours || l.etat === 'ok'} aria-label="Titre du quiz" />
              </div>
              {(l.problemes.length > 0 || l.msg) && <div className="imp-msg">{[...l.problemes, l.msg].filter(Boolean).join(' ')}</div>}
            </div>
          ))}
        </div>
      )}

      {lignes.length > 0 && (
        <div className="imp-pied">
          <button type="button" className="btn-primary" onClick={importer} disabled={enCours || !aFaire.length}>
            {enCours ? 'Import en cours…' : `Enregistrer ${aFaire.length} quiz`}
          </button>
          {bilan && (
            <div className="imp-bilan" role="status">
              {nOk} quiz enregistré{nOk > 1 ? 's' : ''}{nErr ? `, ${nErr} échec${nErr > 1 ? 's' : ''}` : ''}.{' '}
              <button type="button" className="btn-lien" onClick={onFini}>Voir les quiz</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
