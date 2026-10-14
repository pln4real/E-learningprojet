import LegalLayout from '../components/LegalLayout';
import { SITE } from '../../lib/site';

export const metadata = { title: `Conditions d'utilisation | ${SITE.nom}` };

export default function Conditions() {
  return (
    <LegalLayout titre="Conditions d'utilisation">
      <h2>1. Objet</h2>
      <p>{SITE.nom} est une plateforme de cours, d'exercices et d'annales destinée aux élèves du Sénégal (BFEM et Baccalauréat). Utiliser le site signifie accepter les présentes conditions.</p>

      <h2>2. Compte</h2>
      <p>Pour accéder à certains contenus, tu crées un compte avec ton nom, ton adresse e-mail et un mot de passe. Tu es responsable de la confidentialité de ton mot de passe. Les informations données doivent être exactes.</p>
      <p>Si tu as moins de 18 ans, tu dois avoir l'accord d'un parent ou d'un responsable légal pour créer un compte et, plus tard, pour souscrire un abonnement.</p>

      <h2>3. Contenus et accès</h2>
      <p>Une partie des contenus est gratuite. D'autres sont réservés aux abonnés, et certaines fonctions, comme le téléchargement des fichiers, peuvent dépendre de la formule choisie. Les formules et les prix sont indiqués sur le site au moment de la souscription.</p>
      <p>Les cours, exercices, vidéos et documents du site sont protégés. Tu peux les utiliser pour tes révisions personnelles. Tu ne peux pas les revendre, les republier ou les partager à grande échelle sans autorisation écrite.</p>

      <h2>4. Paiement</h2>
      <p>Lorsque les abonnements seront ouverts, le paiement se fera par les moyens indiqués sur le site (par exemple Mobile Money). Les conditions de durée, de renouvellement et de remboursement seront précisées avant tout paiement.</p>

      <h2>5. Qualité des contenus</h2>
      <p>Nous soignons les contenus et les alignons sur les programmes officiels, mais nous ne pouvons pas garantir l'absence d'erreur ni un résultat à un examen. Si tu repères une erreur, écris-nous : nous la corrigeons.</p>

      <h2>6. Disponibilité</h2>
      <p>Le site peut être interrompu pour maintenance ou en cas de panne. Nous faisons le nécessaire pour limiter ces interruptions.</p>

      <h2>7. Comportement</h2>
      <p>Il est interdit de tenter d'accéder à des contenus réservés sans y avoir droit, de perturber le fonctionnement du site, ou de se faire passer pour quelqu'un d'autre. Nous pouvons suspendre un compte qui ne respecte pas ces règles.</p>

      <h2>8. Modifications</h2>
      <p>Nous pouvons modifier ces conditions. La date de dernière mise à jour figure en haut de la page. En cas de changement important, nous le signalerons sur le site.</p>

      <h2>9. Contact et droit applicable</h2>
      <p>Pour toute question : <a href={`mailto:${SITE.email}`}>{SITE.email}</a>. Ces conditions sont soumises au droit sénégalais.</p>
      {SITE.editeur && <p>Éditeur du site : {SITE.editeur}{SITE.adresse ? `, ${SITE.adresse}` : ''}.</p>}
    </LegalLayout>
  );
}
