# Notre histoire — jeu photo de mariage

Jeu mobile de Laura & Giovanni : les invités doivent remettre les souvenirs du couple dans leur ordre chronologique.

## Fonctionnalités

- Glisser-déposer tactile et souris
- Chronomètre
- Score selon l’ordre, les positions exactes et le temps
- Classement
- Espace animateur protégé par PIN
- Consultation de l’ordre proposé par chaque équipe
- Export CSV
- Design mobile-first

## Photos

Les images doivent être placées dans `public/photos` avec leur année comme nom :

`2006.jpg`, `2007.jpg`, etc.

La version actuelle utilise les années suivantes :

`2006–2019`, puis `2021–2026`.

Il manque donc encore la photo `2020.jpg` et deux souvenirs supplémentaires si le jeu définitif doit contenir exactement 22 photos.

## Espace animateur

Ouvrir le bouton **Admin** ou ajouter `?admin=1` à l’URL.

PIN provisoire : `230206`

## Lancement local

```bash
npm install
npm run dev
```

## Limite provisoire

Les résultats sont actuellement enregistrés dans le navigateur de l’appareil avec `localStorage`. Firebase sera nécessaire pour réunir en direct les résultats de plusieurs téléphones sur un classement centralisé.
