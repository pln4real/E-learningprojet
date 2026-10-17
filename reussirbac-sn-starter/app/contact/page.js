import SiteShell from '../components/SiteShell';
import ContactForm from './ContactForm';
import Icon from '../components/Icon';
import { SITE } from '../../lib/site';

export const metadata = { title: `Contact | ${SITE.nom}`, description: 'Une question, une erreur dans un cours, un souci de compte ? Écris-nous.' };

export default function Contact() {
  return (
    <SiteShell>
      <main className="lp-wrap ct">
        <div className="ct-left">
          <h1 className="lp-big">Une question&nbsp;? Écris-nous.</h1>
          <p className="lp-sub">Un cours à corriger, un souci de compte, une idée pour améliorer le site : chaque message est lu.</p>

          <ul className="ct-channels">
            <li>
              <span className="ct-ic"><Icon name="mail" size={20} /></span>
              <div><b>Par e-mail</b><a href={`mailto:${SITE.email}`}>{SITE.email}</a></div>
            </li>
            {SITE.whatsapp && (
              <li>
                <span className="ct-ic"><Icon name="phone" size={20} /></span>
                <div><b>Sur WhatsApp</b><a href={`https://wa.me/${SITE.whatsapp}`} target="_blank" rel="noreferrer">Ouvrir la discussion</a></div>
              </li>
            )}
          </ul>

          <div className="ct-tips">
            <b>Pour une réponse plus rapide</b>
            <ul>
              <li>Indique la classe, la matière et le chapitre concernés.</li>
              <li>Donne l'adresse e-mail de ton compte si le sujet le concerne.</li>
              <li>Pour une erreur, recopie la phrase ou l'exercice en cause.</li>
            </ul>
          </div>
          {SITE.editeur && <p className="ct-ed">{SITE.editeur}{SITE.adresse ? `, ${SITE.adresse}` : ''}</p>}
        </div>

        <ContactForm />
      </main>
    </SiteShell>
  );
}
