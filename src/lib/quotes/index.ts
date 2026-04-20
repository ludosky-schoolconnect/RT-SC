/**
 * RT-SC · Educational quotes for the landing page rotator.
 * Mix of universal classics and African / Beninese voices.
 * Feel free to add, edit, reorder.
 */

export interface Quote {
  text: string
  author: string
  context?: string
}

export const QUOTES: Quote[] = [
  {
    text: "L'éducation est l'arme la plus puissante que vous puissiez utiliser pour changer le monde.",
    author: 'Nelson Mandela',
  },
  {
    text: "L'enseignement doit être conçu pour fortifier l'esprit et non pour le remplir.",
    author: 'Léopold Sédar Senghor',
    context: 'Poète et président sénégalais',
  },
  {
    text: "Si tu veux aller vite, marche seul. Si tu veux aller loin, marchons ensemble.",
    author: 'Proverbe africain',
  },
  {
    text: "L'avenir de tout pays repose sur l'éducation de sa jeunesse.",
    author: 'Patrice Lumumba',
  },
  {
    text: "Apprendre, c'est découvrir ce que vous savez déjà. Faire, c'est démontrer que vous le savez.",
    author: 'Richard Bach',
  },
  {
    text: "L'école n'est pas la fin, mais seulement le début d'une éducation.",
    author: 'Calvin Coolidge',
  },
  {
    text: "Un peuple sans éducation est un peuple sans avenir.",
    author: 'Cheikh Anta Diop',
    context: 'Historien et anthropologue sénégalais',
  },
  {
    text: "L'élève intelligent dépasse le maître.",
    author: 'Proverbe yoruba',
  },
  {
    text: "Celui qui ouvre une porte d'école, ferme une prison.",
    author: 'Victor Hugo',
  },
  {
    text: "La vraie connaissance est de connaître l'étendue de son ignorance.",
    author: 'Confucius',
  },
  {
    text: "L'éducation est le passeport pour l'avenir, car demain appartient à ceux qui s'y préparent aujourd'hui.",
    author: 'Malcolm X',
  },
  {
    text: "On ne peut rien apprendre aux gens. On peut seulement les aider à découvrir qu'ils possèdent déjà en eux tout ce qui est à apprendre.",
    author: 'Galilée',
  },
  {
    text: "Le savoir n'a de valeur que partagé.",
    author: 'Proverbe africain',
  },
  {
    text: "L'enseignant médiocre raconte. Le bon enseignant explique. Le grand enseignant inspire.",
    author: 'William Arthur Ward',
  },
  {
    text: "Sans éducation, l'homme ne saurait apercevoir ses propres erreurs.",
    author: 'Felix Houphouët-Boigny',
    context: 'Premier président de la Côte d\'Ivoire',
  },
]
