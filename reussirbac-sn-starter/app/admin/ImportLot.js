'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { TYPES, safeFileName } from '../../lib/media';
import { cleChapitre } from '../../lib/texte';
import { chargerPdfjs } from '../../lib/pdfjs';
import { extraireSommaire } from '../../lib/sommaire';
import { trouverChapitre, typeDepuisNom, titreDepuisNom, estAnnexe } from '../../lib/import';
import Icon from '../components/Icon';

const MAX_MO = 50;
const NOUVEAU = '__nouveau__';
const IGNORER = '__ignorer__';
const libType = (k) => TYPES.find((t) => t.key === k)?.label || k;

export default function ImportLot({ niveaux, onTermine }) {
  const [niveauId, setNiveauId] = useState('');
  const [matieres, setMatieres] = useState([]);
  const [matiereId, setMatiereId] = useState('');
  const [chapitres, setChapitres] = useState([]);
  const [existants, setExistants] = useState([]);
  const [typeDefaut, setTypeDefaut] = useState('cours');
  const [acces, setAcces] = useState('gratuit');
  const [publie, setPublie] = useState(false);
  const [lignes, setLignes] = useState([]);
  const [enCours, setEnCours] = useState(false);
  const [fini, setFini] = useState(false);
  const [champ, setChamp] = useState(0);

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
        const { data: rs } = await supabase.from('ressources').select('chapitre_id, type, titre').in('chapitre_id', chs.map((c) => c.id));
        setExistants(rs || []);
      }
    });
  }, [matiereId]);

  function majLigne(i, patch) { setLignes((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l))); }

  function choisirFichiers(e) {
    const fichiers = Array.from(e.target.files || []);
    const nouvelles = fichiers.map((f) => {
      const type = typeDepuisNom(f.name, typeDefaut);
      const m = trouverChapitre(f.name, chapitres);
      const annexe = estAnnexe(f.name);
      const trop = f.size > MAX_MO * 1024 * 1024;
      const image = /^image\//.test(f.type);
      let chap = m.chapitre ? m.chapitre.id : (annexe ? IGNORER : NOUVEAU);
      if (trop) chap = IGNORER;
      const titre = titreDepuisNom(f.name, type, libType(type));
      const doublon = m.chapitre && existants.some((x) => x.chapitre_id === m.chapitre.id && x.type === type
        && (x.titre || '').trim().toLowerCase() === titre.toLowerCase());
      return {
        fichier: f, type: image ? 'fiche' : type, titre, chap,
        niveau: m.niveau, doublon: !!doublon, trop,
        nomNouveau: titreDepuisNom(f.name, type, libType(type)).replace(/\s+(cours complet|cours|exercices?|r[ée]sum[ée]|r[ée]visions?|fiche|annales?|corrig[ée]s?)\s*$/i, '').trim() || titre,
        etat: 'attente', msg: '',
      };
    });
    nouvelles.sort((a, b) => a.fichier.name.localeCompare(b.fichier.name, 'fr', { numeric: true }));
    setLignes(nouvelles); setFini(false);
  }

  const aImporter = useMemo(() => lignes.filter((l) => l.chap !== IGNORER && l.etat !== 'ok'), [lignes]);

  async function importer() {
    if (!matiereId || !aImporter.length) return;
    setEnCours(true); setFini(false);
    let liste = [...chapitres];
    let pdfjs = null;
    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i];
      if (l.chap === IGNORER || l.etat === 'ok') continue;
      majLigne(i, { etat: 'envoi', msg: '' });
      try {
        let chapitreId = l.chap;
        if (chapitreId === NOUVEAU) {
          const nom = (l.nomNouveau || '').trim();
          if (!nom) throw new Error('Nom du nouveau chapitre vide.');
          const ex = liste.find((c) => cleChapitre(c.nom) === cleChapitre(nom));
          if (ex) chapitreId = ex.id;
          else {
            const ordre = liste.reduce((m, c) => Math.max(m, c.ordre || 0), 0) + 1;
            const { data, error } = await supabase.from('chapitres').insert({ nom, matiere_id: matiereId, ordre }).select().single();
            if (error) throw new Error('Chapitre : ' + error.message);
            liste = [...liste, data]; chapitreId = data.id;
            majLigne(i, { chap: data.id });
          }
        }
        const f = l.fichier;
        const path = `${chapitreId}/${l.type}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeFileName(f.name)}`;
        const { error: eUp } = await supabase.storage.from('ressources').upload(path, f, { upsert: false });
        if (eUp) throw new Error('Envoi du fichier : ' + eUp.message);
        const url = supabase.storage.from('ressources').getPublicUrl(path).data.publicUrl;
        const row = {
          chapitre_id: chapitreId, type: l.type, titre: (l.titre || '').trim() || libType(l.type),
          description: '', source: 'pdf', url_fichier: url, url_video: null,
          statut: publie ? 'publie' : 'brouillon', acces,
        };
        if (l.type === 'cours' && /pdf/i.test(f.type || f.name)) {
          try {
            pdfjs = pdfjs || await chargerPdfjs();
            const som = await extraireSommaire(pdfjs, await f.arrayBuffer());
            if (som.length) row.sommaire = som;
          } catch (e) { /* sommaire facultatif */ }
        }
        const { error } = await supabase.from('ressources').insert(row);
        if (error) {
          await supabase.storage.from('ressources').remove([path]);
          if (/ressources_type_check/.test(error.message)) throw new Error("Type non activé dans la base : lance le script SQL 12 dans Supabase.");
          throw new Error(error.message);
        }
        majLigne(i, { etat: 'ok' });
      } catch (e) {
        majLigne(i, { etat: 'erreur', msg: e.message });
      }
    }
    setEnCours(false); setFini(true);
    setChapitres(liste);
  }

  const nOk = lignes.filter((l) => l.etat === 'ok').length;
  const nErr = lignes.filter((l) => l.etat === 'erreur').length;

  return (
    <div className="card imp-wrap" style={{ padding: 20 }}>
      <h2 className="brand-font" style={{ fontSize: 20, margin: '0 0 4px' }}>Importer plusieurs fichiers d'un coup</h2>
      <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 16px' }}>
        Choisis la classe et la matière, puis sélectionne tous tes PDF. Chaque fichier est rattaché automatiquement au bon chapitre d'après son nom. Tu vérifies, tu corriges si besoin, puis tu lances.
      </p>

      <div className="admin-field-row">
        <label className="field"><span>Classe</span>
          <select value={niveauId} onChange={(e) => setNiveauId(e.target.value)} disabled={enCours}>
            <option value="">Choisir…</option>
            {niveaux.map((n) => <option key={n.id} value={n.id}>{n.nom}</option>)}
          </select>
        </label>
        <label className="field"><span>Matière</span>
          <select value={matiereId} onChange={(e) => setMatiereId(e.target.value)} disabled={!niveauId || enCours}>
            <option value="">Choisir…</option>
            {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
          </select>
        </label>
      </div>
      <div className="admin-field-row">
        <label className="field"><span>Type par défaut</span>
          <select value={typeDefaut} onChange={(e) => setTypeDefaut(e.target.value)} disabled={enCours}>
            {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>
        <label className="field"><span>Accès</span>
          <select value={acces} onChange={(e) => setAcces(e.target.value)} disabled={enCours}>
            <option value="gratuit">Gratuit</option>
            <option value="abonne">Abonnés</option>
          </select>
        </label>
      </div>
      <label className="imp-check"><input type="checkbox" checked={publie} onChange={(e) => setPublie(e.target.checked)} disabled={enCours} />
        <span>Publier tout de suite (sinon les contenus restent en brouillon)</span></label>

      {matiereId && (
        <label className="field" style={{ marginTop: 14 }}><span>Fichiers (PDF, ou images pour les fiches) — {chapitres.length} chapitre{chapitres.length > 1 ? 's' : ''} dans cette matière</span>
          <input key={champ} type="file" accept="application/pdf,image/*" multiple onChange={choisirFichiers} disabled={enCours} />
        </label>
      )}

      {lignes.length > 0 && (
        <div className="imp-liste">
          {lignes.map((l, i) => (
            <div key={i} className={`imp-row etat-${l.etat}${l.chap === IGNORER ? ' ignore' : ''}`}>
              <div className="imp-nom" title={l.fichier.name}>
                <Icon name="file" size={16} /> <span>{l.fichier.name}</span>
                <small>{(l.fichier.size / 1048576).toFixed(1)} Mo</small>
              </div>
              <div className="imp-champs">
                <select value={l.chap} onChange={(e) => majLigne(i, { chap: e.target.value, niveau: 'sur' })} disabled={enCours || l.etat === 'ok'} aria-label="Chapitre">
                  {chapitres.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  <option value={NOUVEAU}>+ Nouveau chapitre…</option>
                  <option value={IGNORER}>Ne pas importer</option>
                </select>
                <select value={l.type} onChange={(e) => majLigne(i, { type: e.target.value })} disabled={enCours || l.etat === 'ok'} aria-label="Type">
                  {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                {l.chap === NOUVEAU && (
                  <input className="imp-wide" value={l.nomNouveau} onChange={(e) => majLigne(i, { nomNouveau: e.target.value })} placeholder="Nom du nouveau chapitre" disabled={enCours} />
                )}
                <input className="imp-wide" value={l.titre} onChange={(e) => majLigne(i, { titre: e.target.value })} placeholder="Titre affiché" disabled={enCours || l.etat === 'ok'} />
              </div>
              <div className="imp-etat">
                {l.etat === 'ok' ? <span className="imp-b ok">Importé</span>
                  : l.etat === 'envoi' ? <span className="imp-b">Envoi…</span>
                  : l.etat === 'erreur' ? <span className="imp-b err" title={l.msg}>Échec</span>
                  : l.trop ? <span className="imp-b err">Plus de {MAX_MO} Mo</span>
                  : l.chap === IGNORER ? <span className="imp-b">Ignoré</span>
                  : l.chap === NOUVEAU ? <span className="imp-b warn">Nouveau</span>
                  : l.niveau === 'verifier' ? <span className="imp-b warn">À vérifier</span>
                  : <span className="imp-b ok">Sûr</span>}
                {l.doublon && l.etat === 'attente' && <span className="imp-b warn" title="Un contenu du même titre et du même type existe déjà">Doublon ?</span>}
              </div>
              {l.msg && <div className="imp-msg">{l.msg}</div>}
            </div>
          ))}
        </div>
      )}

      {lignes.length > 0 && (
        <div className="imp-pied">
          <button type="button" className="btn-primary" onClick={importer} disabled={enCours || !aImporter.length}>
            {enCours ? 'Import en cours…' : `Importer ${aImporter.length} fichier${aImporter.length > 1 ? 's' : ''}`}
          </button>
          {fini && (
            <div className="imp-bilan" role="status">
              {nOk} importé{nOk > 1 ? 's' : ''}{nErr ? `, ${nErr} échec${nErr > 1 ? 's' : ''} (relance pour réessayer ceux-là)` : ''}.{' '}
              <button type="button" className="btn-lien" onClick={onTermine}>Voir Mes contenus</button>
              {' · '}
              <button type="button" className="btn-lien" onClick={() => { setLignes([]); setChamp((n) => n + 1); setFini(false); }}>Nouvel import</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
