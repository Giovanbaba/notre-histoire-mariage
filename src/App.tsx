import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock3, Download, GripVertical, Heart, LockKeyhole, RotateCcw, Trophy, X } from 'lucide-react';

type Photo = { id: string; year: number; src: string };
type Result = {
  id: string;
  team: string;
  exact: number;
  distance: number;
  score: number;
  seconds: number;
  order: string[];
  createdAt: string;
};

const PHOTO_YEARS = [
  2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015,
  2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025, 2026,
];

const correctPhotos: Photo[] = PHOTO_YEARS.map((year) => ({
  id: String(year),
  year,
  src: `/photos/${year}.jpg`,
}));

const shuffle = <T,>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const formatTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

function readResults(): Result[] {
  try {
    return JSON.parse(localStorage.getItem('notre-histoire-results') || '[]') as Result[];
  } catch {
    return [];
  }
}

function SortablePhoto({ photo, position, locked }: { photo: Photo; position: number; locked: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: photo.id,
    disabled: locked,
  });

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`photo-card ${isDragging ? 'dragging' : ''}`}
    >
      <div className="position">{position}</div>
      <img src={photo.src} alt={`Souvenir à classer ${position}`} draggable={false} />
      {!locked && (
        <button className="drag-handle" type="button" aria-label="Déplacer la photo" {...attributes} {...listeners}>
          <GripVertical size={20} />
        </button>
      )}
    </article>
  );
}

export default function App() {
  const [team, setTeam] = useState('');
  const [started, setStarted] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>(() => shuffle(correctPhotos));
  const [seconds, setSeconds] = useState(0);
  const [submitted, setSubmitted] = useState<Result | null>(null);
  const [showRanking, setShowRanking] = useState(false);
  const [showAdmin, setShowAdmin] = useState(() => new URLSearchParams(location.search).has('admin'));
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [results, setResults] = useState<Result[]>(readResults);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
  );

  useEffect(() => {
    if (!started || submitted) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [started, submitted]);

  const ranking = useMemo(
    () => [...results].sort((a, b) => b.score - a.score || a.seconds - b.seconds),
    [results],
  );

  const start = (event: FormEvent) => {
    event.preventDefault();
    if (!team.trim()) return;
    setPhotos(shuffle(correctPhotos));
    setSeconds(0);
    setSubmitted(null);
    setStarted(true);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id || submitted) return;
    setPhotos((items) => {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const submit = () => {
    if (!confirm('Valider définitivement votre ordre ?')) return;
    const exact = photos.reduce((total, photo, index) => total + (photo.id === correctPhotos[index].id ? 1 : 0), 0);
    const distance = photos.reduce((total, photo, index) => {
      const correctIndex = correctPhotos.findIndex((item) => item.id === photo.id);
      return total + Math.abs(correctIndex - index);
    }, 0);
    const maxDistance = correctPhotos.length * correctPhotos.length / 2;
    const chronologyPoints = Math.max(0, Math.round(800 * (1 - distance / maxDistance)));
    const exactBonus = exact * 50;
    const timeBonus = Math.max(0, 200 - Math.floor(seconds / 3));
    const result: Result = {
      id: crypto.randomUUID(),
      team: team.trim(),
      exact,
      distance,
      score: chronologyPoints + exactBonus + timeBonus,
      seconds,
      order: photos.map((photo) => photo.id),
      createdAt: new Date().toISOString(),
    };
    const next = [...readResults(), result];
    localStorage.setItem('notre-histoire-results', JSON.stringify(next));
    setResults(next);
    setSubmitted(result);
  };

  const reset = () => {
    setStarted(false);
    setTeam('');
    setSubmitted(null);
    setSeconds(0);
  };

  const exportCsv = () => {
    const rows = [['Rang', 'Equipe', 'Score', 'Photos exactes', 'Temps', 'Ordre proposé', 'Date']];
    ranking.forEach((item, index) =>
      rows.push([
        String(index + 1), item.team, String(item.score), String(item.exact), formatTime(item.seconds),
        item.order.join(' > '), new Date(item.createdAt).toLocaleString('fr-BE'),
      ]),
    );
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'classement-notre-histoire.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const renderOverlay = () => {
    const adminMode = showAdmin;
    return (
      <div className="overlay" role="dialog" aria-modal="true">
        <section className="modal">
          <button className="close" type="button" onClick={() => { setShowRanking(false); setShowAdmin(false); }}><X /></button>
          {adminMode && !adminUnlocked ? (
            <form className="admin-login" onSubmit={(event) => { event.preventDefault(); if (pin === '230206') setAdminUnlocked(true); else alert('Code incorrect'); }}>
              <LockKeyhole size={34} />
              <h2>Espace animateur</h2>
              <input type="password" inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value)} placeholder="Code PIN" />
              <button className="primary" type="submit">Ouvrir</button>
            </form>
          ) : (
            <>
              <div className="modal-heading">
                <div><p className="eyebrow">{adminMode ? 'Espace animateur' : 'En direct'}</p><h2>Classement</h2></div>
                {adminMode && <button className="secondary compact" type="button" onClick={exportCsv}><Download size={17} /> CSV</button>}
              </div>
              {ranking.length === 0 ? <p className="empty">Aucune équipe n’a encore participé.</p> : (
                <div className="ranking">
                  {ranking.map((item, index) => (
                    <details key={item.id} className="rank-row">
                      <summary><span className="rank-number">{index + 1}</span><strong>{item.team}</strong><span>{item.score} pts</span><small>{formatTime(item.seconds)}</small></summary>
                      {adminMode && <div className="details"><b>{item.exact} exactes</b><span>{item.order.join(' → ')}</span><time>{new Date(item.createdAt).toLocaleString('fr-BE')}</time></div>}
                    </details>
                  ))}
                </div>
              )}
              {adminMode && ranking.length > 0 && <button className="danger" type="button" onClick={() => { if (confirm('Effacer tous les résultats ?')) { localStorage.removeItem('notre-histoire-results'); setResults([]); } }}>Effacer les résultats</button>}
            </>
          )}
        </section>
      </div>
    );
  };

  if (!started) {
    return (
      <main className="page-shell">
        <button className="admin-link" type="button" onClick={() => setShowAdmin(true)}><LockKeyhole size={16} /> Admin</button>
        <section className="hero-card">
          <div className="heart-badge"><Heart fill="currentColor" /></div>
          <p className="eyebrow">Laura & Giovanni</p>
          <h1>Notre histoire</h1>
          <p className="hero-year">2006 — 2026</p>
          <div className="divider" />
          <p className="intro">20 ans d’amour, de souvenirs et une merveilleuse famille.</p>
          <p className="subcopy">Remettez les photos dans leur ordre chronologique. Les années restent secrètes jusqu’à la validation.</p>
          <form onSubmit={start} className="start-form">
            <label htmlFor="team">Nom de l’équipe ou numéro de table</label>
            <input id="team" value={team} onChange={(event) => setTeam(event.target.value)} placeholder="Ex. Table 7 — Les Siciliens" maxLength={50} required />
            <button type="submit"><Heart size={19} fill="currentColor" /> Commencer</button>
          </form>
          <button className="ranking-link" type="button" onClick={() => setShowRanking(true)}><Trophy size={17} /> Voir le classement</button>
        </section>
        {(showRanking || showAdmin) && renderOverlay()}
      </main>
    );
  }

  return (
    <main className="game-shell">
      <header className="game-header">
        <div><p className="eyebrow">{team}</p><h2>Replacez nos souvenirs</h2></div>
        <div className="timer"><Clock3 size={18} /> {formatTime(seconds)}</div>
      </header>
      <p className="hint">Maintenez une photo puis faites-la glisser. Sur ordinateur, utilisez la souris.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={photos.map((photo) => photo.id)} strategy={rectSortingStrategy}>
          <section className="photo-grid">
            {photos.map((photo, index) => <SortablePhoto key={photo.id} photo={photo} position={index + 1} locked={Boolean(submitted)} />)}
          </section>
        </SortableContext>
      </DndContext>
      {submitted ? (
        <section className="result-card">
          <p className="eyebrow">Réponse enregistrée</p><h3>{submitted.score} points</h3>
          <p>{submitted.exact} photo{submitted.exact > 1 ? 's' : ''} exactement à la bonne place · {formatTime(submitted.seconds)}</p>
          <div className="answer-strip">{correctPhotos.map((photo) => <span key={photo.id}>{photo.year}</span>)}</div>
          <button className="primary" type="button" onClick={() => setShowRanking(true)}><Trophy size={18} /> Voir le classement</button>
          <button className="secondary" type="button" onClick={reset}><RotateCcw size={18} /> Nouvelle équipe</button>
        </section>
      ) : (
        <footer className="action-bar">
          <button className="secondary" type="button" onClick={() => setPhotos(shuffle(correctPhotos))}><RotateCcw size={18} /> Remélanger</button>
          <button className="primary" type="button" onClick={submit}>Valider l’ordre</button>
        </footer>
      )}
      {(showRanking || showAdmin) && renderOverlay()}
    </main>
  );
}
