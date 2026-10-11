'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

export default function AdminPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [niveaux, setNiveaux] = useState([]);
  const [matieres, setMatieres] = useState([]);

  const [niveauId, setNiveauId] = useState('');
  const [matiereId, setMatiereId] = useState('');
  const [chapitreNom, setChapitreNom] = useState('');
  const [type, setType] = useState('cours');
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState('pdf');
  const [file, setFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [publie, setPublie] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  // Vérifie, au chargement de la page, si l'utilisateur connecté est admin.
  // Ce contrôle est côté interface (pour rediriger proprement) — la vraie
  // protection est au niveau de la base de données (policies RLS), donc
  // même en contournant cette page, personne d'autre ne peut écrire.
  useEffect(() => {
    async function checkAccess() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      const { data, error } = await supabase
        .from('admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error || !data) {
        setIsAdmin(false);
      } else {
        setIsAdmin(true);
      }
      setCheckingAccess(false);
    }
    checkAccess();
  }, [router]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from('niveaux').select('*').order('ordre').then(({ data }) => setNiveaux(data || []));
  }, [isAdmin]);

  useEffect(() => {
    if (!niveauId) { setMatieres([]); return; }
    supabase.from('matieres').select('*').eq('niveau_id', niveauId).order('ordre')
      .then(({ data }) => setMatieres(data || []));
  }, [niveauId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(''); setIsError(false);

    if (!matiereId || !chapitreNom || !titre) {
      setIsError(true);
      setMessage("Merci de renseigner au moins la matière, le chapitre et le titre.");
      return;
    }

    let { data: chapitreExistant } = await supabase
      .from('chapitres').select('id').eq('matiere_id', matiereId).eq('nom', chapitreNom).maybeSingle();

    let chapitreId = chapitreExistant?.id;
    if (!chapitreId) {
      const { data: nouveauChapitre, error: errChap } = await supabase
        .from('chapitres').insert({ nom: chapitreNom, matiere_id: matiereId }).select().single();
      if (errChap) { setIsError(true); setMessage('Erreur chapitre : ' + errChap.message); return; }
      chapitreId = nouveauChapitre.id;
    }

    let urlFichier = null;
    if (source === 'pdf' && file) {
      const path = `${Date.now()}-${file.name}`;
      const { error: errUpload } = await supabase.storage.from('ressources').upload(path, file);
      if (errUpload) { setIsError(true); setMessage('Erreur upload : ' + errUpload.message); return; }
      const { data: urlData } = supabase.storage.from('ressources').getPublicUrl(path);
      urlFichier = urlData.publicUrl;
    }

    const { error: errRes } = await supabase.from('ressources').insert({
      chapitre_id: chapitreId, type, titre, description, source,
      url_fichier: urlFichier,
      url_video: source === 'video' ? videoUrl : null,
      statut: publie ? 'publie' : 'brouillon',
    });

    if (errRes) { setIsError(true); setMessage('Erreur : ' + errRes.message); return; }

    setIsError(false);
    setMessage('✅ Contenu ajouté avec succès.');
    setTitre(''); setDescription(''); setChapitreNom(''); setVideoUrl(''); setFile(null);
  }

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
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔒</div>
          <h2 className="brand-font" style={{ fontSize: 20, margin: '0 0 8px' }}>Accès réservé</h2>
          <p style={{ color: 'var(--ink-soft)', fontSize: 14 }}>
            Cette page est réservée aux administrateurs de la plateforme.
          </p>
          <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => router.push('/catalogue')}>
            Retour au catalogue
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="eyebrow">Espace Admin</div>
      <h1 className="brand-font" style={{ fontSize: 26, margin: '6px 0 20px' }}>Ajoute un cours, un exercice ou une annale</h1>

      <div className="card">
        {message && <p className={isError ? 'error-text' : 'success-text'}>{message}</p>}

        <form onSubmit={handleSubmit}>
          <div className="admin-field-row">
            <div className="field">
              <label>Niveau</label>
              <select value={niveauId} onChange={(e) => setNiveauId(e.target.value)}>
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
              <button type="button" className={type === 'cours' ? 'active' : ''} onClick={() => setType('cours')}>Cours</button>
              <button type="button" className={type === 'exercice' ? 'active' : ''} onClick={() => setType('exercice')}>Exercice</button>
              <button type="button" className={type === 'annale' ? 'active' : ''} onClick={() => setType('annale')}>Annale</button>
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
            <label>Support</label>
            <div className="pill-toggle" style={{ marginBottom: 12 }}>
              <button type="button" className={source === 'pdf' ? 'active' : ''} onClick={() => setSource('pdf')}>📎 PDF</button>
              <button type="button" className={source === 'video' ? 'active' : ''} onClick={() => setSource('video')}>🔗 Vidéo YouTube</button>
            </div>
            {source === 'pdf' ? (
              <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files[0])} />
            ) : (
              <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." />
            )}
          </div>

          <label className="checkbox-row">
            <input type="checkbox" checked={publie} onChange={(e) => setPublie(e.target.checked)} />
            Publier immédiatement
          </label>

          <button className="btn-primary" type="submit">Ajouter le contenu</button>
        </form>
      </div>
    </main>
  );
}
