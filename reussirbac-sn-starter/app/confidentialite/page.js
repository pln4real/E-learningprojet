import LegalLayout from '../components/LegalLayout';
import { SITE } from '../../lib/site';

export const metadata = { title: `Politique de confidentialité | ${SITE.nom}` };

export default function Confidentialite() {
  return (
    <LegalLayout titre="Politique de confidentialité">
      <p>Cette page explique quelles informations {SITE.nom} collecte, pourquoi, et comment tu peux les contrôler.</p>

      <h2>Les informations que nous collectons</h2>
      <ul>
        <li>Ton nom, ton adresse e-mail et ton mot de passe quand tu crées un compte. Le mot de passe est stocké sous forme chiffrée : nous ne pouvons pas le lire.</li>
        <li>Ta formule d'abonnement (gratuite, abonnée, premium) et, plus tard, l'état de ta progression dans les cours.</li>
        <li>Quand les paiements seront ouverts : la confirmation de paiement transmise par notre prestataire. Nous ne voyons ni ne conservons ton code secret Mobile Money.</li>
      </ul>

      <h2>Pourquoi nous les utilisons</h2>
      <p>Uniquement pour faire fonctionner ton compte : te connecter, te donner accès aux bons contenus, te permettre de récupérer ton mot de passe et, plus tard, suivre ta progression. Nous ne vendons pas tes données et nous ne les utilisons pas pour de la publicité.</p>

      <h2>Où elles sont conservées</h2>
      <p>Le site s'appuie sur des services d'hébergement spécialisés (base de données et hébergement du site), dont les serveurs peuvent se trouver hors du Sénégal. Ces prestataires nous aident à faire fonctionner le service et n'ont pas le droit d'utiliser tes données pour leurs propres besoins.</p>

      <h2>Vidéos et cookies</h2>
      <p>Les vidéos YouTube sont intégrées dans le mode qui limite le suivi, et ne se chargent que quand tu lances la lecture. Le site utilise uniquement ce qui est nécessaire à la connexion (pour te garder connecté). Nous n'utilisons pas de cookies publicitaires.</p>

      <h2>Les mineurs</h2>
      <p>Beaucoup d'élèves qui utilisent le site ont moins de 18 ans. Nous ne demandons que les informations nécessaires. Un parent ou responsable peut nous écrire pour consulter ou supprimer le compte de son enfant.</p>

      <h2>Combien de temps nous les gardons</h2>
      <p>Tant que ton compte existe. Si tu le fais supprimer, tes informations personnelles sont effacées, sauf celles que la loi nous oblige à conserver (par exemple, plus tard, les justificatifs de paiement).</p>

      <h2>Tes droits</h2>
      <p>Tu peux demander à consulter, corriger ou supprimer tes informations, ou t'opposer à leur utilisation. Écris-nous à <a href={`mailto:${SITE.email}`}>{SITE.email}</a> depuis l'adresse de ton compte. Tu peux aussi t'adresser à l'autorité sénégalaise de protection des données personnelles.</p>

      {SITE.editeur && <p>Responsable du traitement : {SITE.editeur}{SITE.adresse ? `, ${SITE.adresse}` : ''}.</p>}
    </LegalLayout>
  );
}
