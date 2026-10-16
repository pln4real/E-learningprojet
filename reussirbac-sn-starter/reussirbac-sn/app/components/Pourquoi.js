import Icon from './Icon';

// « Pourquoi nous choisir ? » : une grille où chaque carte montre un vrai morceau de l'application.
export default function Pourquoi() {
  return (
    <section className="why" aria-labelledby="why-titre">
      <div className="lp-wrap">
        <h2 className="lp-big" id="why-titre">Pourquoi nous choisir&nbsp;?</h2>
        <p className="lp-sub">Tout ce qu'il faut pour réviser sérieusement, sans te perdre dans des dizaines de fichiers.</p>

        <div className="why-grid">
          <article className="why-card why-a">
            <div className="why-vis">
              <ul className="mini-chapters" aria-hidden="true">
                <li><span>Nombres complexes</span><i /></li>
                <li><span>Suites numériques</span><i /></li>
                <li><span>Dénombrement - Probabilité</span><i /></li>
                <li><span>Fonctions logarithme et exponentielle</span><i /></li>
              </ul>
            </div>
            <h3>Le programme officiel, chapitre par chapitre</h3>
            <p>Chaque matière est découpée comme en classe. Tu retrouves une leçon en deux touches.</p>
          </article>

          <article className="why-card why-b">
            <div className="why-vis">
              <div className="mini-media" aria-hidden="true">
                <div className="mini-video"><span><Icon name="play" size={22} /></span></div>
                <div className="mini-pdf"><b /><b /><b /><b className="s" /></div>
              </div>
            </div>
            <h3>Le cours en PDF et en vidéo</h3>
            <p>Lis le support ou regarde la vidéo du même cours, sans changer de page.</p>
          </article>

          <article className="why-card why-c">
            <div className="why-vis">
              <div className="mini-quiz" aria-hidden="true">
                <p>Module de 3 + 4i ?</p>
                <span className="ok"><i>A</i>5<Icon name="check" size={15} /></span>
                <span><i>B</i>7</span>
              </div>
            </div>
            <h3>Des quiz qui corrigent tout de suite</h3>
            <p>La bonne réponse et l'explication, juste après ton choix.</p>
          </article>

          <article className="why-card why-d">
            <div className="why-vis">
              <div className="mini-prog" aria-hidden="true">
                <div><b>3 / 5</b><span>terminés</span></div>
                <span className="bar"><i /></span>
              </div>
            </div>
            <h3>Ta progression se coche toute seule</h3>
            <p>Ouvre un cours et il est marqué comme vu. Tu sais où tu en es, matière par matière.</p>
          </article>

          <article className="why-card why-e">
            <h3>Gratuit pour commencer</h3>
            <p>Crée un compte et ouvre les premiers contenus de chaque série. Les abonnements ouvrent bientôt.</p>
          </article>
        </div>
      </div>
    </section>
  );
}
