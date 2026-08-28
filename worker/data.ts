export const CHALLENGES = [
  { id: 'maries', emoji: '💍', title: 'Avec les mariés', text: 'Prenez une photo originale avec Laura et Giovanni.', points: 120 },
  { id: 'grimace', emoji: '😂', title: 'La grimace', text: 'Toute la table fait sa meilleure grimace.', points: 80 },
  { id: 'danse', emoji: '💃', title: 'Sur la piste', text: 'Réunissez toute votre table sur la piste de danse.', points: 150 },
  { id: 'coeur', emoji: '❤️', title: 'Un grand cœur', text: 'Formez un cœur collectif avec vos mains.', points: 90 },
  { id: 'generations', emoji: '👶', title: 'Les générations', text: 'Prenez une photo réunissant un enfant et un aîné.', points: 140 },
  { id: 'film', emoji: '🎬', title: 'Scène de cinéma', text: 'Recréez une scène de film reconnaissable.', points: 180 },
  { id: 'accessoire', emoji: '🎩', title: 'Accessoire surprise', text: 'Créez une photo drôle avec un accessoire inattendu.', points: 100 },
  { id: 'selfie', emoji: '🤳', title: 'Selfie géant', text: 'Faites entrer le plus de personnes possible dans un selfie.', points: 130 },
  { id: 'bisou', emoji: '😘', title: 'Pluie de bisous', text: 'Toute la table envoie un bisou aux mariés.', points: 70 },
  { id: 'lettres', emoji: '🔤', title: 'L & G', text: 'Formez les lettres L et G avec les invités.', points: 200 },
  { id: 'elegance', emoji: '✨', title: 'Photo élégante', text: 'Réalisez la photo la plus chic de votre table.', points: 110 },
  { id: 'fou-rire', emoji: '🤣', title: 'Fou rire', text: 'Capturez un véritable fou rire collectif.', points: 100 },
] as const;

export const SONGS = [
  ['Move', ['Adam Port', 'Stryv', 'Keinemusik', 'Orso', 'Malachiii'], ['2024']],
  ['Billie Jean', ['Michael Jackson'], ['1982', '1983']],
  ['Les Démons de minuit', ['Images'], ['1986']],
  ['Freed from Desire', ['Gala'], ['1996']],
  ['Alors on danse', ['Stromae'], ['2009']],
  ['I Gotta Feeling', ['The Black Eyed Peas'], ['2009']],
  ['Smalltown Boy', ['Bronski Beat'], ['1984']],
  ['Oh, Pretty Woman', ['Roy Orbison'], ['1964']],
  ['A Whiter Shade of Pale', ['Procol Harum'], ['1967']],
  ['Dancing Queen', ['ABBA'], ['1976']],
  ['Born to Be Alive', ['Patrick Hernandez'], ['1978', '1979']],
  ['D.A.N.C.E.', ['Justice'], ['2007']],
  ['As It Was', ['Harry Styles'], ['2022']],
  ['Houdini', ['Dua Lipa'], ['2023']],
  ['September', ['Earth, Wind & Fire'], ['1978']],
  ['melodrama', ['Disiz', 'Theodora'], ['2025']],
  ['Um, Um, Um, Um, Um, Um', ['Major Lance'], ['1964']],
  ['Do You Love Me', ['The Contours'], ['1962']],
  ['La Boulette (Génération nan nan)', ["Diam's"], ['2006']],
  ['Relax, Take It Easy', ['MIKA'], ['2006', '2007']],
  ['Heavy Cross', ['Gossip'], ['2009']],
  ['Poker Face', ['Lady Gaga'], ['2008']],
  ['Crazy in Love', ['Beyoncé', 'Jay-Z'], ['2003']],
  ['Sarà perché ti amo', ['Ricchi e Poveri'], ['1981']],
  ['J’irai où tu iras', ['Céline Dion', 'Jean-Jacques Goldman'], ['1995']],
  ['Wati by Night', ["Sexion d'Assaut"], ['2010']],
  ['Sweet Dreams (Are Made of This)', ['Eurythmics'], ['1983']],
  ['Noche de Sexo', ['Wisin & Yandel', 'Aventura'], ['2005']],
  ['(When You Gonna) Give It Up to Me', ['Sean Paul', 'Keyshia Cole'], ['2005', '2006']],
  ['Mambo No. 5 (A Little Bit of…)', ['Lou Bega'], ['1999']],
  ['No Scrubs', ['TLC'], ['1999']],
  ['I Want It That Way', ['Backstreet Boys'], ['1999']],
  ['Tití Me Preguntó', ['Bad Bunny'], ['2022']],
  ['Ma Benz', ['Suprême NTM', 'Lord Kossity'], ['1998']],
].map((song, index) => ({ id: index + 1, title: song[0] as string, artists: song[1] as string[], years: song[2] as string[] }));

export const TITLE_ALIASES: Record<number, string[]> = {
  2: ['billy jean', 'bili jean', 'billie jeans'], 3: ['demons de minuit'], 4: ['free from desire'],
  6: ['gotta feeling'], 7: ['small town boy'], 8: ['pretty woman'], 9: ['whiter shade'],
  11: ['born alive'], 12: ['dance'], 17: ['um um um'], 19: ['la boulette', 'boulette'],
  20: ['relax'], 24: ['sara perche ti amo'], 25: ['jirai ou tu iras'], 27: ['sweet dreams'],
  28: ['noche sexo'], 29: ['give it up to me'], 30: ['mambo 5'], 32: ['i want it'],
  33: ['titi me pregunto'], 34: ['benz'],
};

export const ARTIST_ALIASES: Record<number, string[]> = {
  1: ['adam port', 'stryv', 'keinemusik'], 2: ['michael', 'jackson'], 6: ['black eyed peas', 'bep'],
  7: ['bronski'], 8: ['roy', 'orbison'], 9: ['procol arum'], 15: ['earth wind fire', 'ewf'],
  16: ['disiz', 'theodora'], 19: ['diams'], 23: ['beyonce', 'jay z'], 24: ['ricchi poveri'],
  25: ['celine dion', 'goldman'], 26: ['sexion assaut'], 27: ['eurythmics'],
  28: ['wisin', 'yandel', 'aventura'], 29: ['sean paul'], 30: ['lou bega'],
  32: ['backstreet boys', 'bsb'], 33: ['bad bunny'], 34: ['ntm', 'supreme ntm'],
};

export function normalize(value: unknown): string {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').replace(/\b(the|feat|featuring|and|et)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function levenshtein(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) {
    d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1]);
  }
  return d[a.length][b.length];
}

function phonetic(value: string): string {
  return normalize(value).replace(/ph/g, 'f').replace(/ck|qu/g, 'k').replace(/y/g, 'i')
    .replace(/ge|gi|j/g, 'j').replace(/c(?=[eiy])/g, 's').replace(/c|q/g, 'k')
    .replace(/(.)\1+/g, '$1').replace(/[aeouh]/g, '');
}

export function fuzzyMatch(input: unknown, values: string[], aliases: string[] = []) {
  const guess = normalize(input);
  if (!guess) return { status: 'wrong', confidence: 0 };
  let best = 0;
  for (const candidate of [...values, ...aliases].map(normalize).filter(Boolean)) {
    if (guess === candidate) return { status: 'correct', confidence: 1 };
    if (candidate.length >= 5 && (candidate.includes(guess) || guess.includes(candidate)) && Math.min(guess.length, candidate.length) / Math.max(guess.length, candidate.length) > 0.54) best = Math.max(best, 0.91);
    best = Math.max(best, 1 - levenshtein(guess, candidate) / Math.max(guess.length, candidate.length));
    const gp = phonetic(guess); const cp = phonetic(candidate);
    best = Math.max(best, (1 - levenshtein(gp, cp) / Math.max(gp.length, cp.length, 1)) * 0.96);
  }
  return best >= 0.72 ? { status: 'correct', confidence: best } : best >= 0.52 ? { status: 'review', confidence: best } : { status: 'wrong', confidence: best };
}
