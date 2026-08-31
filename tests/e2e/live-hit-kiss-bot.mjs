const endpoint = process.env.HIT_KISS_URL || 'wss://laura-giova.be/api/hit-kiss/ws';
const pin = process.env.HIT_KISS_ADMIN_PIN;
if (!pin) throw new Error('HIT_KISS_ADMIN_PIN is required');

const songs = [
  ['Move', 'Adam Port', '2024'],
  ['Billie Jean', 'Michael Jackson', '1982'],
  ['Les Démons de minuit', 'Images', '1986'],
  ['Freed from Desire', 'Gala', '1996'],
  ['Alors on danse', 'Stromae', '2009'],
  ['I Gotta Feeling', 'The Black Eyed Peas', '2009'],
  ['Smalltown Boy', 'Bronski Beat', '1984'],
  ['Oh, Pretty Woman', 'Roy Orbison', '1964'],
  ['A Whiter Shade of Pale', 'Procol Harum', '1967'],
  ['Dancing Queen', 'ABBA', '1976'],
];

function client() {
  const ws = new WebSocket(endpoint);
  const pending = new Map();
  let latestState = null;
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.type === 'ack' && message.id) {
      pending.get(message.id)?.(message.data);
      pending.delete(message.id);
    }
    if (message.type === 'state' || message.type === 'admin-state') latestState = message.data;
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const send = async (type, payload) => {
    await ready;
    const id = crypto.randomUUID();
    const response = new Promise(resolve => pending.set(id, resolve));
    ws.send(JSON.stringify({ id, type, payload }));
    const result = await Promise.race([response, new Promise((_, reject) => setTimeout(() => reject(new Error(`${type} timeout`)), 10000))]);
    if (!result?.ok) throw new Error(`${type}: ${result?.error || 'failed'}`);
    return result;
  };
  return { ws, send, state: () => latestState };
}

const admin = client();
await admin.send('admin-login', pin);
await admin.send('admin-action', { pin, action: 'start' });

const scenarios = [
  { firstName: 'BOT', lastName: '100 POURCENT', correct: 10 },
  { firstName: 'BOT', lastName: '70 POURCENT', correct: 7 },
  { firstName: 'BOT', lastName: '50 POURCENT', correct: 5 },
  { firstName: 'BOT', lastName: '20 POURCENT', correct: 2 },
];
const players = scenarios.map(scenario => ({ ...scenario, client: client() }));
for (const player of players) await player.client.send('join', { firstName: player.firstName, lastName: player.lastName });

for (let songIndex = 0; songIndex < songs.length; songIndex += 1) {
  const [title, artist, year] = songs[songIndex];
  for (const player of players) {
    const correct = songIndex < player.correct;
    await player.client.send('answer', {
      songId: songIndex + 1,
      title: correct ? title : 'réponse volontairement fausse',
      artist: correct ? artist : 'artiste volontairement faux',
      year: correct ? year : '0000',
    });
  }
}

await admin.send('admin-action', { pin, action: 'finish' });
await new Promise(resolve => setTimeout(resolve, 500));
const ranking = admin.state()?.ranking || [];
console.log(JSON.stringify(ranking.filter(row => row.firstName === 'BOT'), null, 2));
for (const player of players) player.client.ws.close();
admin.ws.close();
