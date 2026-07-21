import { FormEvent, useMemo, useState } from 'react';
import { Heart, Move, Sparkles } from 'lucide-react';

type Photo = { id: number; label: string };

const initialPhotos: Photo[] = Array.from({ length: 22 }, (_, index) => ({
  id: index + 1,
  label: `Photo ${index + 1}`,
}));

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function App() {
  const [tableName, setTableName] = useState('');
  const [started, setStarted] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>(() => shuffle(initialPhotos));
  const [selected, setSelected] = useState<number | null>(null);
  const progress = useMemo(() => photos.length, [photos]);

  const start = (event: FormEvent) => {
    event.preventDefault();
    if (!tableName.trim()) return;
    setStarted(true);
  };

  const selectPhoto = (index: number) => {
    if (selected === null) {
      setSelected(index);
      return;
    }
    if (selected === index) {
      setSelected(null);
      return;
    }
    const next = [...photos];
    [next[selected], next[index]] = [next[index], next[selected]];
    setPhotos(next);
    setSelected(null);
  };

  if (!started) {
    return (
      <main className="page-shell">
        <section className="hero-card">
          <div className="heart-badge"><Heart fill="currentColor" /></div>
          <p className="eyebrow">Laura & Giovanni</p>
          <h1>Notre histoire en 22 photos</h1>
          <div className="divider" />
          <p className="intro">Depuis 20 ans, nous écrivons notre plus belle aventure… À vous de la reconstituer !</p>
          <p className="subcopy">Replacez les 22 photos dans le bon ordre chronologique.</p>
          <form onSubmit={start} className="start-form">
            <label htmlFor="table">Nom ou numéro de la table</label>
            <input
              id="table"
              value={tableName}
              onChange={(event) => setTableName(event.target.value)}
              placeholder="Ex. Table 7 ou Les Siciliens"
              maxLength={50}
              required
            />
            <button type="submit"><Sparkles size={20} /> Commencer le jeu</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="game-shell">
      <header className="game-header">
        <div>
          <p className="eyebrow">Table : {tableName}</p>
          <h2>Remettez les souvenirs dans l’ordre</h2>
        </div>
        <div className="counter">{progress} photos</div>
      </header>

      <p className="hint"><Move size={18} /> Touchez une photo puis une autre pour les échanger. Le glisser-déposer arrive dans la prochaine étape.</p>

      <section className="photo-grid" aria-label="Photos à classer">
        {photos.map((photo, index) => (
          <button
            type="button"
            key={photo.id}
            className={`photo-card ${selected === index ? 'selected' : ''}`}
            onClick={() => selectPhoto(index)}
          >
            <span className="position">{index + 1}</span>
            <img src={`/photos/${photo.id}.jpg`} alt={photo.label} onError={(event) => { event.currentTarget.style.display = 'none'; }} />
            <span className="placeholder">{photo.label}</span>
          </button>
        ))}
      </section>

      <footer className="action-bar">
        <button className="secondary" type="button" onClick={() => setPhotos(shuffle(initialPhotos))}>Mélanger</button>
        <button className="primary" type="button" onClick={() => alert('La validation et le score sécurisé seront connectés à Firebase.')}>Valider notre réponse</button>
      </footer>
    </main>
  );
}
