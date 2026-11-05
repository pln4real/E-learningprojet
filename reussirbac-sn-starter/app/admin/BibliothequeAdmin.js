'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { safeFileName } from '../../lib/media';
import { CATEGORIES, libelleCategorie, chargerPdfjs } from '../../lib/biblio';
import Icon from '../components/Icon';

const MAX_MO = 50; // limite d'envoi de Supabase (formule gratuite)

async function lireInfosPdf(file) {
  const pdfjs = await chargerPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const page = await pdf.getPage(1);
  const v1 = page.getViewport({ scale: 1 });
  const echelle = 520 / v1.width;
  const vp = page.getViewport({ scale: echelle });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
  return { pages: pdf.numPages, couverture: blob };
}

const VIDE = { titre: '', auteur: '', description: '', categorie: 'fascicule', niveau_id: '', acces: 'abonne', publie: false };

export default function BibliothequeAdmin({ niveaux }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(VIDE);
  const [editing, setEditing] = useState(null);
  const [fichier, setFichier] = useState(null);
  const [image, setImage] = useState(null);
  const [droits, setDroits] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ texte: '', erreur: false });
  const [cleFichier, setCleFichier] = useState(0);
  const [ouvert, setOuvert] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const charger = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('documents').select('*, favoris_documents(count)').order('cree_le', { ascending: false });
    if (error) setMsg({ texte: /relation .*documents/.test(error.message) || /does not exist/.test(error.message) ? "La bibliothèque n'est pas encore activée : lance d'abord le script SQL 14 dans Supabase." : error.message, erreur: true });
    setDocs(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const maj = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function nouveau() { setEditing(null); setForm(VIDE); setFichier(null); setImage(null); setDroits(false); setCleFichier((n) => n + 1); setOuvert(true); setMsg({ texte: '', erreur: false }); }
  function modifier(d) {
    setEditing(d); setOuvert(true); setFichier(null); setImage(null); setMsg({ texte: '', erreur: false });
    setForm({ titre: d.titre, auteur: d.auteur || '', description: d.description || '', categorie: d.categorie, niveau_id: d.niveau_id || '', acces: d.acces, publie: d.statut === 'publie' });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const fermer = () => { setOuvert(false); setEditing(null); };

  async function envoyer(e) {
    e.preventDefault();
    setMsg({ texte: '', erreur: false });
    const echec = (t) => { setMsg({ texte: t, erreur: true }); setSaving(false); };
    if (!form.titre.trim()) return echec('Écris le titre du document.');

    if (editing) {
      setSaving(true);
      const { error } = await supabase.from('documents').update({
        titre: form.titre.trim(), auteur: form.auteur.trim() || null, description: form.description.trim() || null,
        categorie: form.categorie, niveau_id: form.niveau_id || null, acces: form.acces, statut: form.publie ? 'publie' : 'brouillon',
      }).eq('id', editing.id);
      if (error) return echec('Erreur : ' + error.message);
      setSaving(false); setMsg({ texte: 'Modifications enregistrées.', erreur: false }); fermer(); charger();
      return;
    }

    if (!fichier) return echec('Choisis le fichier PDF du document.');
    if (fichier.type !== 'application/pdf') return echec('Le fichier doit être un PDF.');
    if (fichier.size > MAX_MO * 1048576) return echec(`Ce PDF fait plus de ${MAX_MO} Mo : compresse-le avant de l'envoyer.`);
    if (!droits) return echec('Coche la case qui confirme que tu as le droit de diffuser ce document.');

    setSaving(true);
    let infos;
    try { infos = await lireInfosPdf(fichier); } catch (err) { return echec("Ce PDF n'a pas pu être lu : vérifie qu'il n'est pas protégé par un mot de passe."); }
    const base = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const cheminPdf = `docs/${base}-${safeFileName(fichier.name)}`;
    const stock = supabase.storage.from('bibliotheque');
    const up = await stock.upload(cheminPdf, fichier, { upsert: false, contentType: 'application/pdf' });
    if (up.error) return echec('Erreur envoi du PDF : ' + up.error.message);

    let cheminCouv = null;
    const blobCouv = image || infos.couverture;
    if (blobCouv) {
      cheminCouv = `couvertures/${base}.jpg`;
      const uc = await stock.upload(cheminCouv, blobCouv, { upsert: false, contentType: image?.type || 'image/jpeg' });
      if (uc.error) cheminCouv = null; // la couverture est facultative
    }

    const { error } = await supabase.from('documents').insert({
      titre: form.titre.trim(), auteur: form.auteur.trim() || null, description: form.description.trim() || null,
      categorie: form.categorie, niveau_id: form.niveau_id || null, chemin_fichier: cheminPdf, chemin_couverture: cheminCouv,
      pages: infos.pages, acces: form.acces, statut: form.publie ? 'publie' : 'brouillon', droits_confirmes: true,
    });
    if (error) {
      await stock.remove([cheminPdf, ...(cheminCouv ? [cheminCouv] : [])]);
      return echec(/documents/.test(error.message) && /exist/.test(error.message) ? "La bibliothèque n'est pas encore activée : lance d'abord le script SQL 14." : 'Erreur : ' + error.message);
    }
    setSaving(false);
    setMsg({ texte: `Ajouté : « ${form.titre.trim()} » (${infos.pages} pages). Il est ${form.publie ? 'visible' : 'en brouillon, invisible'} pour les élèves.`, erreur: false });
    setForm(VIDE); setFichier(null); setImage(null); setDroits(false); setCleFichier((n) => n + 1); setOuvert(false);
    charger();
  }

  async function basculer(d) {
    setBusyId(d.id);
    const statut = d.statut === 'publie' ? 'brouillon' : 'publie';
    const { error } = await supabase.from('documents').update({ statut }).eq('id', d.id);
    if (error) setMsg({ texte: error.message, erreur: true });
    else setDocs((p) => p.map((x) => (x.id === d.id ? { ...x, statut } : x)));
    setBusyId(null);
  }

  async function supprimer(d) {
    if (!window.confirm(`Supprimer « ${d.titre} » ? Les favoris des élèves sont supprimés aussi. Cette action est définitive.`)) return;
    setBusyId(d.id);
    const { error } = await supabase.from('documents').delete().eq('id', d.id);
    if (error) { setMsg({ texte: error.message, erreur: true }); setBusyId(null); return; }
    await supabase.storage.from('bibliotheque').remove([d.chemin_fichier, ...(d.chemin_couverture ? [d.chemin_couverture] : [])]);
    setDocs((p) => p.filter((x) => x.id !== d.id));
    setBusyId(null);
  }

  return (
    <div>
      <div className="lc-resume" style={{ marginBottom: 12 }}>
        <span>{docs.length} document{docs.length > 1 ? 's' : ''} · {docs.filter((d) => d.statut === 'publie').length} publié{docs.filter((d) => d.statut === 'publie').length > 1 ? 's' : ''}</span>
        {!ouvert && <button type="button" className="btn-dark" onClick={nouveau}><Icon name="plus" size={15} /> Ajouter un document</button>}
      </div>
      {msg.texte && <p className={msg.erreur ? 'error-text' : 'success-text'} role="status">{msg.texte}</p>}

      {ouvert && (
        <form onSubmit={envoyer} className="adm-bib-form">
          <h3 className="adm-step"><span>{editing ? <Icon name="pencil" size={13} /> : '+'}</span> {editing ? 'Modifier le document' : 'Nouveau document'}</h3>
          <div className="field">
            <label>Titre</label>
            <input value={form.titre} onChange={(e) => maj('titre', e.target.value)} placeholder="Ex. Fascicule de révision : Suites numériques" />
          </div>
          <div className="field">
            <label>Auteur (facultatif)</label>
            <input value={form.auteur} onChange={(e) => maj('auteur', e.target.value)} placeholder="Ex. Équipe RéussirBac" />
          </div>
          <div className="field">
            <label>Description courte (facultatif)</label>
            <textarea rows={3} value={form.description} onChange={(e) => maj('description', e.target.value)} />
          </div>
          <div className="field">
            <label>Catégorie</label>
            <div className="segmented">
              {CATEGORIES.map((c) => (
                <button type="button" key={c.key} className={form.categorie === c.key ? 'active' : ''} onClick={() => maj('categorie', c.key)}>{c.un}</button>
              ))}
            </div>
          </div>
          <div className="admin-field-row">
            <div className="field">
              <label>Pour quelle classe ?</label>
              <select value={form.niveau_id} onChange={(e) => maj('niveau_id', e.target.value)}>
                <option value="">Toutes les classes</option>
                {niveaux.map((n) => <option key={n.id} value={n.id}>{n.nom}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Qui peut le lire ?</label>
              <div className="segmented">
                <button type="button" className={form.acces === 'gratuit' ? 'active' : ''} onClick={() => maj('acces', 'gratuit')}>Tous</button>
                <button type="button" className={form.acces === 'abonne' ? 'active' : ''} onClick={() => maj('acces', 'abonne')}>Abonnés</button>
              </div>
            </div>
          </div>

          {!editing && (
            <>
              <div className="field">
                <label>Fichier PDF (maximum {MAX_MO} Mo)</label>
                <input key={`f${cleFichier}`} type="file" accept="application/pdf" onChange={(e) => setFichier(e.target.files?.[0] || null)} />
              </div>
              <div className="field">
                <label>Image de couverture (facultatif : sinon la 1re page est utilisée)</label>
                <input key={`i${cleFichier}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setImage(e.target.files?.[0] || null)} />
              </div>
              <label className="checkbox-row">
                <input type="checkbox" checked={droits} onChange={(e) => setDroits(e.target.checked)} />
                Je confirme que j'ai le droit de diffuser ce document (œuvre libre de droits, ou autorisation de l'auteur / de l'éditeur).
              </label>
            </>
          )}

          <label className="checkbox-row">
            <input type="checkbox" checked={form.publie} onChange={(e) => maj('publie', e.target.checked)} />
            Publier maintenant (sinon le document reste en brouillon, invisible pour les élèves)
          </label>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Enregistrement...' : editing ? 'Enregistrer' : 'Ajouter le document'}</button>
            <button type="button" className="btn-light" onClick={fermer} disabled={saving}>Annuler</button>
          </div>
        </form>
      )}

      {loading && <p style={{ color: 'var(--ink-soft)' }}>Chargement...</p>}
      {!loading && docs.length === 0 && !ouvert && <div className="empty-box">Aucun document pour l'instant. Clique sur « Ajouter un document ».</div>}

      {docs.map((d) => {
        const publie = d.statut === 'publie';
        const nbFav = d.favoris_documents?.[0]?.count ?? 0;
        return (
          <div className="item-card" key={d.id}>
            <div className="item-top">
              <div>
                <p className="item-title"><Icon name="library" size={15} /> {d.titre}</p>
                <div className="item-meta">
                  {libelleCategorie(d.categorie)}{d.auteur ? ` · ${d.auteur}` : ''}{d.pages ? ` · ${d.pages} pages` : ''}
                  <br />
                  {niveaux.find((n) => n.id === d.niveau_id)?.nom || 'Toutes les classes'} · <Icon name="heart" size={12} /> {nbFav} favori{nbFav > 1 ? 's' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {d.acces === 'abonne' && <span className="badge abonne"><Icon name="lock" size={11} /> Abonnés</span>}
                <span className={`badge ${publie ? 'publie' : 'brouillon'}`}>{publie ? 'Publié' : 'Brouillon'}</span>
              </div>
            </div>
            <div className="item-actions">
              <button className="btn-light" disabled={busyId === d.id} onClick={() => basculer(d)}>{publie ? 'Dépublier' : 'Publier'}</button>
              <button className="btn-light" disabled={busyId === d.id} onClick={() => modifier(d)}>Modifier</button>
              <button className="btn-light btn-danger" disabled={busyId === d.id} onClick={() => supprimer(d)}>Supprimer</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
