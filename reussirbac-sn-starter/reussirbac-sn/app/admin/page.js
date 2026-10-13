'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { TYPES, aPdf, aVideo, safeFileName, storagePathFromUrl } from '../../lib/media';
import Topbar from '../components/Topbar';
import Icon from '../components/Icon';

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
      </main>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Formulaire : sert à AJOUTER (initial = null) et à MODIFIER           */
/* ------------------------------------------------------------------ */
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
  const [videoUrl, setVideoUrl] = useState(initial?.url_video || '');
  const [acces, setAcces] = useState(initial?.acces || 'gratuit');
  const [publie, setPublie] = useState(initial ? initial.statut === 'publie' : false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!niveauId) { setMatieres([]); return; }
    supabase.from('matieres').select('*').eq('niveau_id', niveauId).order('ordre')
      .then(({ data }) => setMatieres(data || []));
  }, [niveauId]);

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

    setSaving(true);
    const nomChapitre = chapitreNom.trim();

    // 1. Trouve le chapitre (même nom, même matière) ou le crée
    const { data: existant } = await supabase
      .from('chapitres').select('id').eq('matiere_id', matiereId).eq('nom', nomChapitre).maybeSingle();
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
      const path = `${Date.now()}-${safeFileName(file.name)}`;
      const { error: errUpload } = await supabase.storage.from('ressources').upload(path, file);
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

    // 3. Enregistre
    const { error } = isEdit
      ? await supabase.from('ressources').update(row).eq('id', initial.id)
      : await supabase.from('ressources').insert(row);
    if (error) { fail('Erreur : ' + error.message); return; }

    // 4. Nettoie l'ancien fichier une fois la modification réussie
    const ancienChemin = storagePathFromUrl(ancienFichier);
    if (ancienChemin) await supabase.storage.from('ressources').remove([ancienChemin]);

    setSaving(false);
    if (isEdit) {
      onSaved();
    } else {
      setIsError(false);
      setMessage('Contenu ajouté avec succès.');
      setTitre(''); setDescription(''); setChapitreNom(''); setVideoUrl(''); setFile(null); setRetirerPdf(false);
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
          <input value={chapitreNom} onChange={(e) => setChapitreNom(e.target.value)} placeholder="Ex. Fonctions numériques" />
        </div>

        <div className="field">
          <label>Type de contenu</label>
          <div className="segmented">
            {TYPES.map((t) => (
              <button key={t.key} type="button" className={type === t.key ? 'active' : ''} onClick={() => setType(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Titre</label>
          <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex. Étude d'une fonction rationnelle" />
        </div>

        <div className="field">
          <label>Description courte</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="field">
          <label><Icon name="file" size={14} /> Support PDF (facultatif)</label>
          <input type="file" accept="application/pdf" onChange={(e) => { setFile(e.target.files[0] || null); setRetirerPdf(false); }} />
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

        <label className="checkbox-row">
          <input type="checkbox" checked={publie} onChange={(e) => setPublie(e.target.checked)} />
          Publier (visible par les élèves)
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
