import Icon from './Icon';

const ITEMS = ['Cours complet', 'Vidéo du cours', 'Exercice 1', 'Quiz du chapitre'];

// Une même fiche de chapitre, vue sur ordinateur et sur téléphone : les cases se cochent en même temps.
function Fiche({ compact = false }) {
  return (
    <div className={`dv-screen ${compact ? 'compact' : ''}`}>
      <div className="dv-top">
        <span>Terminale S2</span>
        <b>Nombres complexes</b>
      </div>
      <div className="dv-bar"><i /></div>
      <ul>
        {ITEMS.map((t, i) => (
          <li key={t}>
            <span className={`dv-ck dv-ck${i + 1}`}><Icon name="check" size={12} /></span>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

const AVATARS = [
  { l: 'A', c: '#CF1F5A' }, { l: 'M', c: '#3A44C8' }, { l: 'F', c: '#FF7AA5', d: true }, { l: 'S', c: '#7C86F0' },
];

export default function Rythme() {
  return (
    <section className="rythme" aria-labelledby="rythme-titre">
      <div className="lp-wrap rythme-in">
        <div className="rythme-text">
          <h2 className="lp-big" id="rythme-titre">Apprends à ton rythme.</h2>
          <p className="rythme-lead">Accès illimité, 24 h sur 24 et 7 jours sur 7, depuis n'importe quel appareil.</p>
          <ul className="rythme-list">
            <li><Icon name="phone" size={20} /><span>Téléphone ou ordinateur : le même compte, partout.</span></li>
            <li><Icon name="refresh" size={20} /><span>Tu commences sur l'un, tu continues sur l'autre. Ta progression te suit.</span></li>
            <li><Icon name="book" size={20} /><span>Les cours sont là à toute heure, la veille d'un devoir comme un dimanche soir.</span></li>
          </ul>
          <div className="avatars-row">
            <div className="avatars" aria-hidden="true">
              {AVATARS.map((a) => <span key={a.l} style={{ background: a.c, color: a.d ? '#12142F' : '#fff' }}>{a.l}</span>)}
              <span className="plus">+</span>
            </div>
            <p>Rejoins les premiers élèves de 3e et de Terminale.</p>
          </div>
        </div>

        <div className="devices-wrap" aria-label="Le même chapitre sur ordinateur et sur téléphone">
          <div className="devices">
            <div className="dv-laptop">
              <div className="dv-lscreen"><Fiche /></div>
              <div className="dv-lbase" />
            </div>
            <div className="dv-phone">
              <div className="dv-pscreen"><Fiche compact /></div>
            </div>
            <div className="dv-sync"><span className="dv-spin"><Icon name="refresh" size={16} /></span>Sync auto</div>
            <div className="dv-live"><i />24/7</div>
          </div>
        </div>
      </div>
    </section>
  );
}
