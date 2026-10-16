'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Icon from '../components/Icon';
import { cleChapitre } from '../../lib/texte';
import ChapitreHint from './ChapitreHint';

const LETTRES = ['A', 'B', 'C', 'D'];
const vide = () => ({ enonce: '', options: ['', ''], bonne: 0, explication: '' });

export default function QuizAdmin({ niveaux }) {
  const [editing, setEditing] = useState(null); // quiz en cours de modification, ou 'new'
  return editing
    ? <QuizForm niveaux={niveaux} initial={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
    : <QuizList onNew={() => setEditing('new')} onEdit={setEditing} />;
}

function QuizList({ onNew, onEdit }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('quiz')
      .select('*, quiz_questions(id), chapitres(id, nom, matieres(id, nom, niveaux(id, nom)))')
      .order('cree_le', { ascending: false });
    if (error) setError(error.message.includes('quiz') ? "Les quiz ne sont pas encore activés : lance le script SQL 06 dans Supabase." : error.message);
    setItems(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle(q) {
    setBusyId(q.id);
    const statut = q.statut === 'publie' ? 'brouillon' : 'publie';
    const { error } = await supabase.from('quiz').update({ statut }).eq('id', q.id);
    if (error) setError(error.message);
    else setItems((p) => p.map((x) => (x.id === q.id ? { ...x, statut } : x)));
    setBusyId(null);
  }

  async function remove(q) {
    if (!window.confirm(`Supprimer le quiz « ${q.titre} » et ses questions ?`)) return;
    setBusyId(q.id);
    const { error } = await supabase.from('quiz').delete().eq('id', q.id);
    if (error) setError(error.message);
    else setItems((p) => p.filter((x) => x.id !== q.id));
    setBusyId(null);
  }

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <button className="btn-dark" onClick={onNew}><Icon name="plus" size={16} /> Nouveau quiz</button>
      </div>
      {error && <p className="error-text">{error}</p>}
      {loading && <p style={{ color: 'var(--ink-soft)' }}>Chargement...</p>}
      {!loading && !error && items.length === 0 && (
        <div className="empty-box">Aucun quiz pour l'instant. Crée le premier : chaque chapitre peut en avoir plusieurs.</div>
      )}
      {items.map((q) => {
        const chap = q.chapitres;
        const publie = q.statut === 'publie';
        const n = q.quiz_questions?.length || 0;
        return (
          <div className="item-card" key={q.id}>
            <div className="item-top">
              <div>
                <p className="item-title"><Icon name="quiz" size={15} /> {q.titre}</p>
                <div className="item-meta">
                  {chap?.matieres?.niveaux?.nom} · {chap?.matieres?.nom} · {chap?.nom}
                  <br />{n} question{n > 1 ? 's' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {q.acces === 'abonne' && <span className="badge abonne"><Icon name="lock" size={11} /> Abonnés</span>}
                <span className={`badge ${publie ? 'publie' : 'brouillon'}`}>{publie ? 'Publié' : 'Brouillon'}</span>
              </div>
            </div>
            <div className="item-actions">
              <button className="btn-light" disabled={busyId === q.id} onClick={() => toggle(q)}>{publie ? 'Dépublier' : 'Publier'}</button>
              <button className="btn-light" disabled={busyId === q.id} onClick={() => onEdit(q)}>Modifier</button>
              <button className="btn-light btn-danger" disabled={busyId === q.id} onClick={() => remove(q)}>Supprimer</button>
            </div>
          </div>
        );
      })}
    </>
  );
}

function QuizForm({ niveaux, initial, onDone }) {
  const isEdit = !!initial;
  const init = initial?.chapitres;
  const [matieres, setMatieres] = useState([]);
  const [niveauId, setNiveauId] = useState(init?.matieres?.niveaux?.id || '');
  const [matiereId, setMatiereId] = useState(init?.matieres?.id || '');
  const [chapitreNom, setChapitreNom] = useState(init?.nom || '');
  const [titre, setTitre] = useState(initial?.titre || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [acces, setAcces] = useState(initial?.acces || 'gratuit');
  const [publie, setPublie] = useState(initial ? initial.statut === 'publie' : false);
  const [questions, setQuestions] = useState([vide()]);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!niveauId) { setMatieres([]); return; }
    supabase.from('matieres').select('*').eq('niveau_id', niveauId).order('ordre').then(({ data }) => setMatieres(data || []));
  }, [niveauId]);

  const [chapitres, setChapitres] = useState([]);
  useEffect(() => {
    if (!matiereId) { setChapitres([]); return; }
    supabase.from('chapitres').select('id, nom, ordre').eq('matiere_id', matiereId).order('ordre').then(({ data }) => setChapitres(data || []));
  }, [matiereId]);

  // En modification : charge les questions existantes
  useEffect(() => {
    if (!isEdit) return;
    supabase.from('quiz_questions').select('*').eq('quiz_id', initial.id).order('ordre').then(({ data }) => {
      if (data && data.length) {
        setQuestions(data.map((q) => ({ enonce: q.enonce, options: Array.isArray(q.options) ? q.options : ['', ''], bonne: q.bonne_reponse, explication: q.explication || '' })));
      }
    });
  }, [isEdit, initial]);

  function fail(t) { setIsError(true); setMessage(t); setSaving(false); }
  const majQ = (i, patch) => setQuestions((p) => p.map((q, k) => (k === i ? { ...q, ...patch } : q)));
  const majOpt = (i, j, v) => setQuestions((p) => p.map((q, k) => (k === i ? { ...q, options: q.options.map((o, m) => (m === j ? v : o)) } : q)));
  const ajouterOpt = (i) => setQuestions((p) => p.map((q, k) => (k === i && q.options.length < 4 ? { ...q, options: [...q.options, ''] } : q)));
  const retirerOpt = (i, j) => setQuestions((p) => p.map((q, k) => {
    if (k !== i || q.options.length <= 2) return q;
    const options = q.options.filter((_, m) => m !== j);
    let bonne = q.bonne;
    if (j === bonne) bonne = 0; else if (j < bonne) bonne -= 1;
    return { ...q, options, bonne };
  }));

  async function submit(e) {
    e.preventDefault();
    setMessage(''); setIsError(false);
    if (!matiereId || !chapitreNom.trim() || !titre.trim()) { fail('Renseigne la matière, le chapitre et le titre du quiz.'); return; }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.enonce.trim()) { fail(`Question ${i + 1} : l'énoncé est vide.`); return; }
      if (q.options.some((o) => !o.trim())) { fail(`Question ${i + 1} : toutes les réponses doivent être remplies (ou retirées).`); return; }
    }
    setSaving(true);

    const nomChapitre = chapitreNom.trim();
    const { data: liste } = await supabase.from('chapitres').select('id, nom').eq('matiere_id', matiereId);
    const existant = (liste || []).find((c) => cleChapitre(c.nom) === cleChapitre(nomChapitre));
    let chapitreId = existant?.id;
    if (!chapitreId) {
      const { data: nouveau, error: errChap } = await supabase.from('chapitres').insert({ nom: nomChapitre, matiere_id: matiereId }).select().single();
      if (errChap) { fail('Erreur chapitre : ' + errChap.message); return; }
      chapitreId = nouveau.id;
    }

    const row = { chapitre_id: chapitreId, titre: titre.trim(), description: description.trim(), acces, statut: publie ? 'publie' : 'brouillon' };
    let quizId = initial?.id;
    if (isEdit) {
      const { error } = await supabase.from('quiz').update(row).eq('id', quizId);
      if (error) { fail('Erreur : ' + error.message); return; }
      const { error: errDel } = await supabase.from('quiz_questions').delete().eq('quiz_id', quizId);
      if (errDel) { fail('Erreur : ' + errDel.message); return; }
    } else {
      const { data, error } = await supabase.from('quiz').insert(row).select().single();
      if (error) { fail('Erreur : ' + error.message); return; }
      quizId = data.id;
    }

    const lignes = questions.map((q, i) => ({
      quiz_id: quizId, ordre: i, enonce: q.enonce.trim(), options: q.options.map((o) => o.trim()),
      bonne_reponse: q.bonne, explication: q.explication.trim() || null,
    }));
    const { error: errQ } = await supabase.from('quiz_questions').insert(lignes);
    if (errQ) { fail('Erreur questions : ' + errQ.message); return; }
    setSaving(false);
    onDone();
  }

  return (
    <div className="card">
      <div className="edit-banner">
        <span>{isEdit ? `Modification de « ${initial.titre} »` : 'Nouveau quiz'}</span>
        <button type="button" className="btn-light" onClick={onDone}>Annuler</button>
      </div>
      {message && <p className={isError ? 'error-text' : 'success-text'}>{message}</p>}
      <form onSubmit={submit}>
        <div className="admin-field-row">
          <div className="field">
            <label>Niveau</label>
            <select value={niveauId} onChange={(e) => { setNiveauId(e.target.value); setMatiereId(''); }}>
              <option value="">— Choisir —</option>
              {niveaux.map((n) => <option key={n.id} value={n.id}>{n.nom}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Matière</label>
            <select value={matiereId} onChange={(e) => setMatiereId(e.target.value)}>
              <option value="">— Choisir —</option>
              {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Chapitre</label>
          <input value={chapitreNom} onChange={(e) => setChapitreNom(e.target.value)} placeholder="Choisis dans la liste ou écris un nouveau chapitre" list="liste-chapitres-quiz" autoComplete="off" />
          <datalist id="liste-chapitres-quiz">{chapitres.map((c) => <option key={c.id} value={c.nom} />)}</datalist>
          <ChapitreHint nom={chapitreNom} chapitres={chapitres} matiereId={matiereId} />
        </div>
        <div className="field">
          <label>Titre du quiz</label>
          <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex. Vérifie tes connaissances" />
        </div>
        <div className="field">
          <label>Description courte (facultatif)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <label style={{ fontWeight: 600, fontSize: 14 }}>Questions</label>
        <div style={{ marginTop: 8 }}>
          {questions.map((q, i) => (
            <div className="qa-question" key={i}>
              <div className="qa-head">
                <span>Question {i + 1}</span>
                {questions.length > 1 && (
                  <button type="button" className="btn-light btn-danger" onClick={() => setQuestions((p) => p.filter((_, k) => k !== i))}>Retirer</button>
                )}
              </div>
              <div className="field">
                <textarea value={q.enonce} onChange={(e) => majQ(i, { enonce: e.target.value })} placeholder="Énoncé de la question" />
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '0 0 8px' }}>Coche la bonne réponse.</p>
              {q.options.map((o, j) => (
                <div className="qa-opt" key={j}>
                  <input type="radio" name={`bonne-${i}`} checked={q.bonne === j} onChange={() => majQ(i, { bonne: j })} aria-label={`Bonne réponse ${LETTRES[j]}`} />
                  <input type="text" value={o} onChange={(e) => majOpt(i, j, e.target.value)} placeholder={`Réponse ${LETTRES[j]}`} />
                  {q.options.length > 2 && (
                    <button type="button" className="rm" onClick={() => retirerOpt(i, j)} aria-label="Retirer cette réponse"><Icon name="x" size={16} /></button>
                  )}
                </div>
              ))}
              {q.options.length < 4 && (
                <button type="button" className="btn-light" onClick={() => ajouterOpt(i)} style={{ marginBottom: 10 }}><Icon name="plus" size={14} /> Ajouter une réponse</button>
              )}
              <div className="field" style={{ marginBottom: 0 }}>
                <input value={q.explication} onChange={(e) => majQ(i, { explication: e.target.value })} placeholder="Explication affichée après la réponse (facultatif)" />
              </div>
            </div>
          ))}
          <button type="button" className="btn-light" onClick={() => setQuestions((p) => [...p, vide()])} style={{ marginBottom: 18 }}>
            <Icon name="plus" size={14} /> Ajouter une question
          </button>
        </div>

        <div className="field">
          <label>Qui peut ouvrir ce quiz ?</label>
          <div className="segmented">
            <button type="button" className={acces === 'gratuit' ? 'active' : ''} onClick={() => setAcces('gratuit')}>Gratuit pour tous</button>
            <button type="button" className={acces === 'abonne' ? 'active' : ''} onClick={() => setAcces('abonne')}>Abonnés seulement</button>
          </div>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={publie} onChange={(e) => setPublie(e.target.checked)} />
          Publier (visible par les élèves)
        </label>
        <button className="btn-primary" type="submit" disabled={saving}>
          {saving ? 'Enregistrement...' : isEdit ? 'Enregistrer les modifications' : 'Créer le quiz'}
        </button>
      </form>
    </div>
  );
}
