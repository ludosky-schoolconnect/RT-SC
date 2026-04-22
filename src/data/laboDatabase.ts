/**
 * RT-SC · Labo Virtuel — PhET simulation catalog (30 entries).
 *
 * Pedagogical catalog of PhET Interactive Simulations (Colorado
 * University) with French localization. Covers Physics, Chemistry,
 * and Life & Earth Sciences (SVT) at collège and lycée levels.
 *
 * Content is hosted by phet.colorado.edu — we just embed their
 * iframe via a launcher modal. No data is stored, no Firebase
 * reads/writes. Pure static catalog.
 */

export type LaboSubject = 'Physique' | 'Chimie' | 'SVT'
export type LaboLevel = 'Collège' | 'Lycée' | 'Tous'

export interface LaboSim {
  /** French title */
  title: string
  subject: LaboSubject
  level: LaboLevel
  /** PhET simulation URL (French version) */
  url: string
  /** Emoji shown as a visual hint in the card */
  img: string
}

export const LABO_DATABASE: LaboSim[] = [
  { title: 'Construction de Circuits (DC)', subject: 'Physique', level: 'Tous', url: 'https://phet.colorado.edu/sims/html/circuit-construction-kit-dc/latest/circuit-construction-kit-dc_fr.html', img: '🔌' },
  { title: 'Équilibrage d\'Équations', subject: 'Chimie', level: 'Lycée', url: 'https://phet.colorado.edu/sims/html/balancing-chemical-equations/latest/balancing-chemical-equations_fr.html', img: '⚖️' },
  { title: 'Construire un Atome', subject: 'Chimie', level: 'Collège', url: 'https://phet.colorado.edu/sims/html/build-an-atom/latest/build-an-atom_fr.html', img: '⚛️' },
  { title: 'Loi de l\'Ohm', subject: 'Physique', level: 'Lycée', url: 'https://phet.colorado.edu/sims/html/ohms-law/latest/ohms-law_fr.html', img: '⚡' },
  { title: 'Énergie en Patinoire', subject: 'Physique', level: 'Collège', url: 'https://phet.colorado.edu/sims/html/energy-skate-park/latest/energy-skate-park_fr.html', img: '🛹' },
  { title: 'Vision des Couleurs', subject: 'SVT', level: 'Tous', url: 'https://phet.colorado.edu/sims/html/color-vision/latest/color-vision_fr.html', img: '👁️' },
  { title: 'Frictions et Thermodynamique', subject: 'Physique', level: 'Tous', url: 'https://phet.colorado.edu/sims/html/friction/latest/friction_fr.html', img: '🔥' },
  { title: 'Molarité et Concentration', subject: 'Chimie', level: 'Lycée', url: 'https://phet.colorado.edu/sims/html/molarity/latest/molarity_fr.html', img: '🧪' },
  { title: 'États de la Matière', subject: 'Chimie', level: 'Collège', url: 'https://phet.colorado.edu/sims/html/states-of-matter-basics/latest/states-of-matter-basics_fr.html', img: '🧊' },
  { title: 'Ondes sur une Corde', subject: 'Physique', level: 'Lycée', url: 'https://phet.colorado.edu/sims/html/wave-on-a-string/latest/wave-on-a-string_fr.html', img: '〰️' },
  { title: 'Densité et Flottabilité', subject: 'Physique', level: 'Collège', url: 'https://phet.colorado.edu/sims/html/density/latest/density_fr.html', img: '🧱' },
  { title: 'Échelle de pH', subject: 'Chimie', level: 'Tous', url: 'https://phet.colorado.edu/sims/html/ph-scale/latest/ph-scale_fr.html', img: '💧' },
  { title: 'Sélection Naturelle', subject: 'SVT', level: 'Lycée', url: 'https://phet.colorado.edu/sims/html/natural-selection/latest/natural-selection_fr.html', img: '🧬' },
  { title: 'Gravité et Orbites', subject: 'Physique', level: 'Lycée', url: 'https://phet.colorado.edu/sims/html/gravity-and-orbits/latest/gravity-and-orbits_fr.html', img: '🌍' },
  { title: 'Optique Géométrique', subject: 'Physique', level: 'Lycée', url: 'https://phet.colorado.edu/sims/html/geometric-optics-basics/latest/geometric-optics-basics_fr.html', img: '🔎' },
  { title: 'Diffusion', subject: 'SVT', level: 'Collège', url: 'https://phet.colorado.edu/sims/html/diffusion/latest/diffusion_fr.html', img: '💨' },
  { title: 'Formes et Changements d\'Énergie', subject: 'Physique', level: 'Tous', url: 'https://phet.colorado.edu/sims/html/energy-forms-and-changes/latest/energy-forms-and-changes_fr.html', img: '☀️' },
  { title: 'Isotopes et Masse Atomique', subject: 'Chimie', level: 'Lycée', url: 'https://phet.colorado.edu/sims/html/isotopes-and-atomic-mass/latest/isotopes-and-atomic-mass_fr.html', img: '🔬' },
  { title: 'Forces et Mouvement', subject: 'Physique', level: 'Collège', url: 'https://phet.colorado.edu/sims/html/forces-and-motion-basics/latest/forces-and-motion-basics_fr.html', img: '🚀' },
  { title: 'Masses et Ressorts', subject: 'Physique', level: 'Lycée', url: 'https://phet.colorado.edu/sims/html/masses-and-springs/latest/masses-and-springs_fr.html', img: '🪀' },
  { title: 'Laboratoire Pendule', subject: 'Physique', level: 'Lycée', url: 'https://phet.colorado.edu/sims/html/pendulum-lab/latest/pendulum-lab_fr.html', img: '⏱️' },
  { title: 'Réfraction de la Lumière', subject: 'Physique', level: 'Lycée', url: 'https://phet.colorado.edu/sims/html/bending-light/latest/bending-light_fr.html', img: '🌈' },
  { title: 'Pression des Fluides', subject: 'Physique', level: 'Collège', url: 'https://phet.colorado.edu/sims/html/under-pressure/latest/under-pressure_fr.html', img: '🌊' },
  { title: 'Électricité Statique', subject: 'Physique', level: 'Collège', url: 'https://phet.colorado.edu/sims/html/balloons-and-static-electricity/latest/balloons-and-static-electricity_fr.html', img: '🎈' },
  { title: 'Loi de Faraday', subject: 'Physique', level: 'Lycée', url: 'https://phet.colorado.edu/sims/html/faradays-law/latest/faradays-law_fr.html', img: '🧲' },
  { title: 'Concentration des Solutions', subject: 'Chimie', level: 'Collège', url: 'https://phet.colorado.edu/sims/html/concentration/latest/concentration_fr.html', img: '🧃' },
  { title: 'Réactifs et Produits', subject: 'Chimie', level: 'Lycée', url: 'https://phet.colorado.edu/sims/html/reactants-products-and-leftovers/latest/reactants-products-and-leftovers_fr.html', img: '🍔' },
  { title: 'Propriétés des Gaz', subject: 'Chimie', level: 'Lycée', url: 'https://phet.colorado.edu/sims/html/gas-properties/latest/gas-properties_fr.html', img: '☁️' },
  { title: 'Effet de Serre', subject: 'SVT', level: 'Tous', url: 'https://phet.colorado.edu/sims/html/greenhouse-effect/latest/greenhouse-effect_fr.html', img: '🌡️' },
  { title: 'Expression Génétique', subject: 'SVT', level: 'Lycée', url: 'https://phet.colorado.edu/sims/html/gene-expression-essentials/latest/gene-expression-essentials_fr.html', img: '🧬' },
]
