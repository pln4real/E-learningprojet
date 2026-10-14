import LegalLayout from '../components/LegalLayout';
import { SITE } from '../../lib/site';

export const metadata = { title: `Contact | ${SITE.nom}` };

export default function Contact() {
  return (
    <LegalLayout titre="Nous contacter">
      <p>Une question sur un cours, une erreur à signaler, un problème de compte ou une demande de suppression de données ? Écris-nous :</p>
      <p className="legal-mail"><a href={`mailto:${SITE.email}`}>{SITE.email}</a></p>
      <p>Pour aller plus vite, indique la classe, la matière et le chapitre concernés, et l'adresse e-mail de ton compte. Nous répondons dès que possible.</p>
      {SITE.editeur && <p>{SITE.editeur}{SITE.adresse ? `, ${SITE.adresse}` : ''}</p>}
    </LegalLayout>
  );
}
