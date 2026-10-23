'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { TYPES, aPdf, aVideo, safeFileName, storagePathFromUrl } from '../../lib/media';
import Topbar from '../components/Topbar';
import Icon from '../components/Icon';
import QuizAdmin from './QuizAdmin';
import MessagesAdmin from './MessagesAdmin';
import AbonnementsAdmin from './AbonnementsAdmin';
import SommaireEditor from './SommaireEditor';
import { cleChapitre } from '../../lib/texte';
import ChapitreHint from './ChapitreHint';

export default function AdminPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState('liste'); // 'ajouter' | 'liste'
  const [editing, setEditing] = useState(null); // ressource en cours de modification
  const [niveaux, setNiveaux] = useState([]);

  // Contrôle d'accès côté interface. La vraie protection est dans la base
  // (policies RLS) : même en contournant cette page, un non-admin ne peut rien écrire.
  useEffect(() => {
    async function checkAccess() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data } = await supabase
        .from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
      setIsAdmin(!!data);
      setCheckingAccess(false);
    }
    checkAccess();
  }, [router]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from('niveaux').select('*').order('ordre').then(({ data }) => setNiveaux(data || []));
  }, [isAdmin]);

  if (checkingAccess) {
    return (
      <main className="page">
        <p style={{ color: 'var(--ink-soft)' }}>Vérification des droits d'accès...</p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="page">
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: 10, color: 'var(--green)' }}><Icon name="lock" size={32} /></div>
          <h2 className="brand-font" style={{ fontSize: 20, margin: '0 0 8px' }}>Accès réservé</h2>
          <p style={{ color: 'var(--ink-soft)', fontSize: 14 }}>
            Cette page est réservée aux administrateurs de la plateforme.
          </p>
          <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => router.push('/')}>
            Retour au catalogue
          </button>
        </div>
      </main>
    );
  }

  function startEdit(ressource) {
    setEditing(ressource);
    setTab('ajouter');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function stopEdit() {
    setEditing(null);
    setTab('liste');
  }

  return (
    <>
      <Topbar
        crumbs={[{ label: 'Espace admin' }]}
        action={<a className="btn-dark" href="/">Voir le site</a>}
      />
      <main className="admin-wrap">
        <div className="eyebrow">Espace Admin</div>
        <h1 className="brand-font" style={{ fontSize: 26, margin: '6px 0 18px' }}>
          Gère tes cours, exercices et annales
        </h1>

        <div className="segmented" style={{ marginBottom: 18 }}>
          <button
            type="button"
            className={tab === 'liste' ? 'active' : ''}
            onClick={() => { setEditing(null); setTab('liste'); }}
          >
            Mes contenus
          </button>
          <button
            type="button"
            className={tab === 'ajouter' ? 'active' : ''}
            onClick={() => { setEditing(null); setTab('ajouter'); }}
          >
            {editing ? 'Modifier' : 'Ajouter'}
          </button>
          <button
            type="button"
            className={tab === 'eleves' ? 'active' : ''}
            onClick={() => { setEditing(null); setTab('eleves'); }}
          >
            Élèves
          </button>
          <button
            type="button"
            className={tab === 'quiz' ? 'active' : ''}
            onClick={() => { setEditing(null); setTab('quiz'); }}
          >
            Quiz
          </button>
          <button
            type="button"
            className={tab === 'messages' ? 'active' : ''}
            onClick={() => { setEditing(null); setTab('messages'); }}
          >
            Messages
          </button>
          <button
            type="button"
            className={tab === 'abonnements' ? 'active' : ''}
            onClick={() => { setEditing(null); setTab('abonnements'); }}
          >
            Abonnements
          </button>
        </div>

        {tab === 'ajouter' && (
          <ResourceForm
            key={editing ? editing.id : 'new'}
            niveaux={niveaux}
            initial={editing}
            onSaved={() => { setEditing(null); setTab('liste'); }}
            onCancel={editing ? stopEdit : null}
          />
        )}

        {tab === 'liste' && <ResourceList niveaux={niveaux} onEdit={startEdit} />}

        {tab === 'eleves' && <StudentList />}

        {tab === 'quiz' && <QuizAdmin niveaux={niveaux} />}

        {tab === 'messages' && <MessagesAdmin />}

        {tab === 'abonnements' && <AbonnementsAdmin />}
      </main>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Formulaire : sert à AJOUTER (initial = null) et à MODIFIER           */
/* ------------------------------------------------------------------ */
// Nom d'origine du fichier, pour que tu voies que chaque contenu a bien son propre PDF
function nomFichier(url) {
  try { return decodeURIComponent(String(url).split('?')[0].split('/').pop()).replace(/^\d+-(?:[a-z0-9]{1,6}-)?/, ''); } catch (e) { return ''; }
}

const TYPE_AIDE = {
  cours: 'Le cours principal : un PDF, un lien YouTube, ou les deux. Un cours avec lien YouTube apparaît aussi dans l\'onglet Vidéo.',
  revision: 'Un résumé ou une fiche de révision (PDF).',
  fiche: 'Une image ou un PDF visuel : schéma, carte mentale, frise.',
  exercice: 'Des exercices, corrigés ou non (PDF).',
  annale: 'Des sujets d\'examen (PDF).',
};

// Ce qui existe déjà dans le chapitre choisi : on voit d'un coup d'oeil ce qui est fait et ce qui manque
function ChapitreContenus({ existants }) {
  const compte = {
    cours: existants.filter((r) => r.type === 'cours' && (r.url_fichier || !r.url_video)).length,
    video: existants.filter((r) => r.type === 'cours' && r.url_video).length,
    revision: existants.filter((r) => r.type === 'revision').length,
    fiche: existants.filter((r) => r.type === 'fiche').length,
    exercice: existants.filter((r) => r.type === 'exercice').length,
    annale: existants.filter((r) => r.type === 'annale').length,
  };
  const cases = [['cours', 'Cours'], ['video', 'Vidéo'], ['revision', 'Révision'], ['fiche', 'Fiche visuelle'], ['exercice', 'Exercices'], ['annale', 'Annales']];
  return (
    <div className="adm-deja">
      <div className="adm-deja-titre">Déjà dans ce chapitre</div>
      <div className="adm-slots">
        {cases.map(([k, l]) => (
          <span key={k} className={`adm-slot ${compte[k] > 0 ? 'ok' : ''}`}>
            {compte[k] > 0 ? <Icon name="checkCircle" size={14} /> : <Icon name="circle" size={14} />}
            {l}{compte[k] > 0 ? ` (${compte[k]})` : ''}
          </span>
        ))}
      </div>
      {existants.length > 0 && (
        <ul className="adm-deja-liste">
          {existants.map((r) => (
            <li key={r.id}>{(TYPES.find((t) => t.key === r.type)?.label) || r.type} · {r.titre}{r.statut === 'publie' ? '' : ' (brouillon)'}{r.url_fichier ? <span className="adm-fichier"> — {nomFichier(r.url_fichier)}</span> : null}</li>
          ))}
        </ul>
      )}
      <p className="adm-help">Ce que tu ajoutes ici vient s'ajouter à côté de l'existant, il ne remplace jamais rien. Pour changer un contenu qui existe déjà, va dans « Mes contenus » puis « Modifier ».</p>
    </div>
  );
}

function ResourceForm({ niveaux, initial, onSaved, onCancel }) {
  const isEdit = !!initial;
  const init = initial?.chapitres;

  const [matieres, setMatieres] = useState([]);
  const [niveauId, setNiveauId] = useState(init?.matieres?.niveaux?.id || '');
  const [matiereId, setMatiereId] = useState(init?.matieres?.id || '');
  const [chapitreNom, setChapitreNom] = useState(init?.nom || '');
  const [type, setType] = useState(initial?.type || 'cours');
  const [titre, setTitre] = useState(initial?.titre || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [file, setFile] = useState(null);
  const [retirerPdf, setRetirerPdf] = useState(false);
  const [sommaire, setSommaire] = useState(Array.isArray(initial?.sommaire) ? initial.sommaire : []);
  const [videoUrl, setVideoUrl] = useState(initial?.url_video || '');
  const [acces, setAcces] = useState(initial?.acces || 'gratuit');
  const [publie, setPublie] = useState(initial ? initial.statut === 'publie' : false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [champFichier, setChampFichier] = useState(0); // change après un ajout : vide le champ fichier

  useEffect(() => {
    if (!niveauId) { setMatieres([]); return; }
    supabase.from('matieres').select('*').eq('niveau_id', niveauId).order('ordre')
      .then(({ data }) => setMatieres(data || []));
  }, [niveauId]);

  const [chapitres, setChapitres] = useState([]);
  useEffect(() => {
    if (!matiereId) { setChapitres([]); return; }
    supabase.from('chapitres').select('id, nom, ordre').eq('matiere_id', matiereId).order('ordre')
      .then(({ data }) => setChapitres(data || []));
  }, [matiereId]);

  const [refresh, setRefresh] = useState(0);
  const [existants, setExistants] = useState([]);
  const chapitreTrouve = !isEdit ? chapitres.find((c) => cleChapitre(c.nom) === cleChapitre(chapitreNom)) : null;
  useEffect(() => {
    if (!chapitreTrouve?.id) { setExistants([]); return; }
    let vivant = true;
    supabase.from('ressources').select('id, type, titre, statut, url_fichier, url_video').eq('chapitre_id', chapitreTrouve.id).order('cree_le')
      .then(({ data }) => { if (vivant) setExistants(data || []); });
    return () => { vivant = false; };
  }, [chapitreTrouve?.id, refresh]);

  function fail(text) {
    setIsError(true);
    setMessage(text);
    setSaving(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(''); setIsError(false);

    if (!matiereId || !chapitreNom.trim() || !titre.trim()) {
      fail('Merci de renseigner au moins la matière, le chapitre et le titre.');
      return;
    }
    const pdfExistant = isEdit && initial.url_fichier && !retirerPdf;
    if (!file && !pdfExistant && !videoUrl.trim()) {
      fail('Ajoute au moins un support : un fichier PDF, un lien YouTube, ou les deux.');
      return;
    }
    if (videoUrl.trim() && !/youtu\.?be/i.test(videoUrl)) {
      fail("Le lien vidéo doit être un lien YouTube (youtube.com ou youtu.be).");
      return;
    }

    if (!isEdit) {
      const doublon = existants.find((e) => e.type === type && (e.titre || '').trim().toLowerCase() === titre.trim().toLowerCase());
      if (doublon && !window.confirm(`Un contenu « ${doublon.titre} » de ce type existe déjà dans ce chapitre. L'ajouter quand même en double ?`)) return;
    }
    setSaving(true);
    const nomChapitre = chapitreNom.trim();

    // 1. Trouve le chapitre (même nom, même matière) ou le crée
    const { data: liste } = await supabase.from('chapitres').select('id, nom').eq('matiere_id', matiereId);
    const existant = (liste || []).find((c) => cleChapitre(c.nom) === cleChapitre(nomChapitre));
    let chapitreId = existant?.id;
    if (!chapitreId) {
      const { data: nouveau, error: errChap } = await supabase
        .from('chapitres').insert({ nom: nomChapitre, matiere_id: matiereId }).select().single();
      if (errChap) { fail('Erreur chapitre : ' + errChap.message); return; }
      chapitreId = nouveau.id;
    }

    // 2. Upload du PDF (nom nettoyé : pas d'accents ni d'espaces)
    let urlFichier = pdfExistant ? initial.url_fichier : null;
    let ancienFichier = null;
    if (file) {
      // Un dossier par chapitre et par type, un nom toujours unique : deux fichiers ne peuvent jamais se remplacer
      const path = `${chapitreId}/${type}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeFileName(file.name)}`;
      const { error: errUpload } = await supabase.storage.from('ressources').upload(path, file, { upsert: false });
      if (errUpload) { fail('Erreur upload : ' + errUpload.message); return; }
      urlFichier = supabase.storage.from('ressources').getPublicUrl(path).data.publicUrl;
      if (isEdit) ancienFichier = initial.url_fichier;
    }
    // PDF retiré sans être remplacé : l'ancien fichier devient inutile
    if (isEdit && retirerPdf && !file && initial.url_fichier) ancienFichier = initial.url_fichier;

    const row = {
      chapitre_id: chapitreId,
      type,
      titre: titre.trim(),
      description: description.trim(),
      source: urlFichier ? 'pdf' : 'video',
      url_fichier: urlFichier,
      url_video: videoUrl.trim() || null,
      statut: publie ? 'publie' : 'brouillon',
      acces,
    };
    // Sommaire : seulement pour les cours. La colonne n'est écrite que si nécessaire.
    const sommaireNet = type === 'cours' && urlFichier
      ? sommaire.map((x) => ({ titre: String(x.titre || '').trim(), page: Number(x.page) || 1, niveau: x.niveau === 1 ? 1 : 0 })).filter((x) => x.titre)
      : [];
    if (sommaireNet.length > 0) row.sommaire = sommaireNet;
    else if (isEdit && initial.sommaire) row.sommaire = null;

    // 3. Enregistre
    const { error } = isEdit
      ? await supabase.from('ressources').update(row).eq('id', initial.id)
      : await supabase.from('ressources').insert(row);
    if (error) {
      if (/ressources_type_check/.test(error.message)) {
        fail("Ce type de contenu (Révision ou Fiche visuelle) n'est pas encore activé dans la base. Lance d'abord le script SQL 12 dans Supabase (SQL Editor), puis réessaie.");
      } else fail('Erreur : ' + error.message);
      return;
    }

    // 4. Nettoie l'ancien fichier une fois la modification réussie
    const ancienChemin = storagePathFromUrl(ancienFichier);
    if (ancienChemin) await supabase.storage.from('ressources').remove([ancienChemin]);

    setSaving(false);
    if (isEdit) {
      onSaved();
    } else {
      setIsError(false);
      const libelleType = (TYPES.find((t) => t.key === type)?.label || type).toLowerCase();
      setMessage(`Ajouté : « ${titre.trim()} » (${libelleType}) dans le chapitre « ${nomChapitre} ». Les contenus déjà présents n'ont pas été touchés. Pour ajouter autre chose au même chapitre, change le type et envoie un nouveau fichier.`);
      // On garde classe, matière, chapitre et type pour enchaîner ; tout le reste repart à zéro
      setTitre(''); setDescription(''); setVideoUrl(''); setFile(null); setRetirerPdf(false); setSommaire([]);
      setChampFichier((n) => n + 1);
      setRefresh((n) => n + 1);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  return (
    <div className="card">
      {isEdit && (
        <div className="edit-banner">
          <span>Modification de « {initial.titre} »</span>
          <button type="button" className="btn-light" onClick={onCancel}>Annuler</button>
        </div>
      )}
      {message && <p className={isError ? 'error-text' : 'success-text'}>{message}</p>}

      <form onSubmit={handleSubmit}>
        <h3 className="adm-step"><span>1</span> Où ranger ce contenu ?</h3>
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
          <input value={chapitreNom} onChange={(e) => setChapitreNom(e.target.value)} placeholder="Choisis dans la liste ou écris un nouveau chapitre" list="liste-chapitres" autoComplete="off" />
          <datalist id="liste-chapitres">{chapitres.map((c) => <option key={c.id} value={c.nom} />)}</datalist>
          <ChapitreHint nom={chapitreNom} chapitres={chapitres} matiereId={matiereId} />
        </div>
        {!isEdit && chapitreTrouve && <ChapitreContenus existants={existants} />}

        <h3 className="adm-step"><span>2</span> Que veux-tu ajouter ?</h3>
        <div className="field">
          <label>Type de contenu</label>
          <div className="segmented">
            {TYPES.map((t) => (
              <button key={t.key} type="button" className={type === t.key ? 'active' : ''} disabled={isEdit && type !== t.key} onClick={() => setType(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          <p className="adm-help"><b>{TYPES.find((t) => t.key === type)?.label} : </b>{TYPE_AIDE[type]}</p>
          {!isEdit && existants.some((e) => e.type === type) && (
            <p className="adm-help adm-note">Ce chapitre a déjà {existants.filter((e) => e.type === type).length} contenu(s) de ce type. Le nouveau s'ajoutera à côté, il ne remplacera rien.</p>
          )}
          {isEdit && (
            <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '8px 0 0' }}>
              Le type d'un contenu existant ne peut pas être changé. Pour une fiche visuelle ou une révision, utilise l'onglet « Ajouter ».
            </p>
          )}
        </div>

        <h3 className="adm-step"><span>3</span> Le contenu</h3>
        <div className="field">
          <label>Titre affiché aux élèves</label>
          <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex. Étude d'une fonction rationnelle" />
        </div>

        <div className="field">
          <label>Description courte (facultatif)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="field">
          <label><Icon name="file" size={14} /> {type === 'fiche' ? 'Image ou PDF de la fiche (PNG, JPG, WebP)' : 'Support PDF (facultatif)'}</label>
          <input key={champFichier} type="file" accept={type === 'fiche' ? 'image/png,image/jpeg,image/webp,application/pdf' : 'application/pdf'} onChange={(e) => { setFile(e.target.files[0] || null); setRetirerPdf(false); }} />
          {isEdit && initial.url_fichier && (
            <>
              <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '8px 0 0' }}>
                {retirerPdf
                  ? 'Le PDF actuel sera supprimé à l\'enregistrement.'
                  : 'Un PDF est déjà enregistré. Choisis un nouveau fichier seulement pour le remplacer.'}
              </p>
              {!file && (
                <label className="checkbox-row" style={{ margin: '8px 0 0' }}>
                  <input type="checkbox" checked={retirerPdf} onChange={(e) => setRetirerPdf(e.target.checked)} />
                  Retirer le PDF actuel
                </label>
              )}
            </>
          )}
        </div>

        {type === 'cours' && (file ? file.type === 'application/pdf' : !!(isEdit && initial.url_fichier && !retirerPdf)) && (
          <SommaireEditor file={file} urlExistante={isEdit && !retirerPdf ? initial.url_fichier : null} value={sommaire} onChange={setSommaire} />
        )}

        <div className="field">
          <label><Icon name="play" size={14} /> Vidéo YouTube (facultatif)</label>
          <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." />
          <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '8px 0 0' }}>
            Tu peux ajouter le PDF, la vidéo, ou les deux pour le même contenu. Vider le champ retire la vidéo.
          </p>
        </div>

        <div className="field">
          <label>Qui peut ouvrir ce contenu ?</label>
          <div className="segmented">
            <button type="button" className={acces === 'gratuit' ? 'active' : ''} onClick={() => setAcces('gratuit')}>Gratuit pour tous</button>
            <button type="button" className={acces === 'abonne' ? 'active' : ''} onClick={() => setAcces('abonne')}>Abonnés seulement</button>
          </div>
        </div>

        <h3 className="adm-step"><span>4</span> Publication</h3>
        <label className="checkbox-row">
          <input type="checkbox" checked={publie} onChange={(e) => setPublie(e.target.checked)} />
          Publier maintenant (sinon le contenu reste en brouillon, invisible pour les élèves)
        </label>

        <button className="btn-primary" type="submit" disabled={saving}>
          {saving ? 'Enregistrement...' : isEdit ? 'Enregistrer les modifications' : 'Ajouter le contenu'}
        </button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Liste : voir, publier / dépublier, modifier, supprimer              */
/* ------------------------------------------------------------------ */
function ResourceList({ niveaux, onEdit }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtreNiveau, setFiltreNiveau] = useState('');
  const [filtreStatut, setFiltreStatut] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ressources')
      .select('*, chapitres(id, nom, matieres(id, nom, niveaux(id, nom)))')
      .order('cree_le', { ascending: false });
    if (error) setError(error.message);
    setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleStatut(r) {
    setBusyId(r.id);
    const statut = r.statut === 'publie' ? 'brouillon' : 'publie';
    const { error } = await supabase.from('ressources').update({ statut }).eq('id', r.id);
    if (error) setError(error.message);
    else setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, statut } : x)));
    setBusyId(null);
  }

  async function remove(r) {
    if (!window.confirm(`Supprimer « ${r.titre} » ? Cette action est définitive.`)) return;
    setBusyId(r.id);
    const { error } = await supabase.from('ressources').delete().eq('id', r.id);
    if (error) { setError(error.message); setBusyId(null); return; }
    const chemin = storagePathFromUrl(r.url_fichier);
    if (chemin) await supabase.storage.from('ressources').remove([chemin]);
    setItems((prev) => prev.filter((x) => x.id !== r.id));
    setBusyId(null);
  }

  const visibles = items.filter((r) => {
    const niv = r.chapitres?.matieres?.niveaux?.id;
    if (filtreNiveau && niv !== filtreNiveau) return false;
    if (filtreStatut && r.statut !== filtreStatut) return false;
    return true;
  });

  const nbPublies = items.filter((r) => r.statut === 'publie').length;

  return (
    <>
      <div className="admin-filters">
        <select value={filtreNiveau} onChange={(e) => setFiltreNiveau(e.target.value)} aria-label="Filtrer par niveau">
          <option value="">Tous les niveaux</option>
          {niveaux.map((n) => <option key={n.id} value={n.id}>{n.nom}</option>)}
        </select>
        <select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)} aria-label="Filtrer par statut">
          <option value="">Tous les statuts</option>
          <option value="publie">Publiés</option>
          <option value="brouillon">Brouillons</option>
        </select>
      </div>

      {!loading && (
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 12px' }}>
          {items.length} contenu{items.length > 1 ? 's' : ''} · {nbPublies} publié{nbPublies > 1 ? 's' : ''} ·{' '}
          {items.length - nbPublies} brouillon{items.length - nbPublies > 1 ? 's' : ''}
        </p>
      )}

      {error && <p className="error-text">Erreur : {error}</p>}
      {loading && <p style={{ color: 'var(--ink-soft)' }}>Chargement...</p>}
      {!loading && visibles.length === 0 && (
        <div className="empty-box">
          {items.length === 0
            ? "Tu n'as encore rien ajouté. Passe à l'onglet « Ajouter » pour créer ton premier contenu."
            : 'Aucun contenu ne correspond à ce filtre.'}
        </div>
      )}

      {visibles.map((r) => {
        const chap = r.chapitres;
        const typeInfo = TYPES.find((t) => t.key === r.type);
        const publie = r.statut === 'publie';
        return (
          <div className="item-card" key={r.id}>
            <div className="item-top">
              <div>
                <p className="item-title">{aPdf(r) && <Icon name="file" size={15} />}{aVideo(r) && <Icon name="play" size={15} />} {r.titre}</p>
                <div className="item-meta">
                  {chap?.matieres?.niveaux?.nom} · {chap?.matieres?.nom} · {chap?.nom}
                  <br />
                  {typeInfo?.label || r.type}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {r.acces === 'abonne' && <span className="badge abonne"><Icon name="lock" size={11} /> Abonnés</span>}
                <span className={`badge ${publie ? 'publie' : 'brouillon'}`}>{publie ? 'Publié' : 'Brouillon'}</span>
              </div>
            </div>
            <div className="item-actions">
              <button className="btn-light" disabled={busyId === r.id} onClick={() => toggleStatut(r)}>
                {publie ? 'Dépublier' : 'Publier'}
              </button>
              <button className="btn-light" disabled={busyId === r.id} onClick={() => onEdit(r)}>Modifier</button>
              <button className="btn-light btn-danger" disabled={busyId === r.id} onClick={() => remove(r)}>Supprimer</button>
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Élèves : voir les comptes, changer le palier, fixer une date de fin  */
/* ------------------------------------------------------------------ */
const PALIERS = [
  { key: 'gratuit', label: 'Gratuit' },
  { key: 'abonne', label: 'Abonné' },
  { key: 'premium', label: 'Premium' },
];

function dansJours(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function StudentList() {
  const [eleves, setEleves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState('');
  const [brouillons, setBrouillons] = useState({}); // modifications non enregistrées, par élève
  const [busyId, setBusyId] = useState(null);
  const [okId, setOkId] = useState(null);

  useEffect(() => {
    supabase.from('profils').select('*').order('cree_le', { ascending: false }).limit(1000)
      .then(({ data, error }) => {
        if (error) setError(error.message);
        setEleves(data || []);
        setLoading(false);
      });
  }, []);

  function valeur(e, champ) {
    const b = brouillons[e.id];
    if (b && champ in b) return b[champ];
    return champ === 'palier_jusqu_au' ? (e.palier_jusqu_au || '') : e[champ];
  }

  function modifier(id, champ, v) {
    setOkId(null);
    setBrouillons((prev) => ({ ...prev, [id]: { ...prev[id], [champ]: v } }));
  }

  async function enregistrer(e) {
    const palier = valeur(e, 'palier');
    const jusqu = valeur(e, 'palier_jusqu_au') || null;
    setBusyId(e.id); setError('');
    const { error } = await supabase
      .from('profils').update({ palier, palier_jusqu_au: palier === 'gratuit' ? null : jusqu }).eq('id', e.id);
    setBusyId(null);
    if (error) { setError(error.message); return; }
    setEleves((prev) => prev.map((x) => (x.id === e.id ? { ...x, palier, palier_jusqu_au: palier === 'gratuit' ? null : jusqu } : x)));
    setBrouillons((prev) => { const n = { ...prev }; delete n[e.id]; return n; });
    setOkId(e.id);
  }

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const q = recherche.trim().toLowerCase();
  const visibles = eleves.filter((e) => {
    if (filtre && e.palier !== filtre) return false;
    if (!q) return true;
    return (e.nom_complet || '').toLowerCase().includes(q) || (e.email || '').toLowerCase().includes(q);
  });
  const nb = (p) => eleves.filter((e) => e.palier === p).length;

  return (
    <>
      <div className="admin-filters">
        <input
          type="text" value={recherche} onChange={(e) => setRecherche(e.target.value)}
          placeholder="Nom ou e-mail" aria-label="Chercher un élève"
        />
        <select value={filtre} onChange={(e) => setFiltre(e.target.value)} aria-label="Filtrer par palier">
          <option value="">Tous les paliers</option>
          {PALIERS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>

      {!loading && (
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 12px' }}>
          {eleves.length} élève{eleves.length > 1 ? 's' : ''} : {nb('gratuit')} gratuit, {nb('abonne')} abonné{nb('abonne') > 1 ? 's' : ''}, {nb('premium')} premium
        </p>
      )}

      {error && <p className="error-text">Erreur : {error}</p>}
      {loading && <p style={{ color: 'var(--ink-soft)' }}>Chargement...</p>}
      {!loading && visibles.length === 0 && (
        <div className="empty-box">
          {eleves.length === 0
            ? "Aucun élève pour l'instant. Les comptes apparaissent ici dès qu'un élève s'inscrit."
            : 'Aucun élève ne correspond à cette recherche.'}
        </div>
      )}

      {visibles.map((e) => {
        const palier = valeur(e, 'palier');
        const jusqu = valeur(e, 'palier_jusqu_au');
        const expire = e.palier !== 'gratuit' && e.palier_jusqu_au && e.palier_jusqu_au < aujourdhui;
        const modifie = !!brouillons[e.id];
        return (
          <div className="item-card" key={e.id}>
            <div className="item-top">
              <div>
                <p className="item-title">{e.nom_complet || 'Sans nom'}</p>
                <div className="item-meta">
                  {e.email || 'E-mail inconnu'}
                  <br />
                  Inscrit le {new Date(e.cree_le).toLocaleDateString('fr-FR')}
                </div>
              </div>
              {expire ? (
                <span className="badge brouillon">Expiré</span>
              ) : (
                <span className={`badge ${e.palier === 'gratuit' ? 'brouillon' : 'publie'}`}>
                  {PALIERS.find((p) => p.key === e.palier)?.label}
                </span>
              )}
            </div>

            <div className="student-edit">
              <div className="field">
                <label>Palier</label>
                <select value={palier} onChange={(ev) => modifier(e.id, 'palier', ev.target.value)}>
                  {PALIERS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Valable jusqu'au (facultatif)</label>
                <input type="date" value={jusqu} disabled={palier === 'gratuit'} onChange={(ev) => modifier(e.id, 'palier_jusqu_au', ev.target.value)} />
              </div>
            </div>

            <div className="item-actions">
              <button className="btn-light" disabled={palier === 'gratuit'} onClick={() => modifier(e.id, 'palier_jusqu_au', dansJours(30))}>+ 30 jours</button>
              <button className="btn-light" disabled={palier === 'gratuit'} onClick={() => modifier(e.id, 'palier_jusqu_au', dansJours(365))}>+ 1 an</button>
              <button className="btn-dark" disabled={!modifie || busyId === e.id} onClick={() => enregistrer(e)}>
                {busyId === e.id ? 'Enregistrement...' : 'Enregistrer'}
              </button>
              {okId === e.id && <span className="success-text" style={{ margin: 0, alignSelf: 'center' }}>Enregistré</span>}
            </div>
          </div>
        );
      })}
    </>
  );
}
