# Sécurité, sauvegardes et quotas

## Médias

- Bucket R2 privé, jamais d'URL publique permanente.
- Téléchargement par URL signée courte et contrôle du `tenantId` avant signature.
- Téléversement multipart/reprenables pour les vidéos de 1 à 2 Go ; ne pas faire transiter ces fichiers par le serveur Express.
- Types autorisés par signature réelle : JPEG, PNG, WebP, HEIC, MP4, MOV, WebM ; refuser HTML, SVG actif et exécutables.
- Noms de fichiers générés côté serveur, métadonnées utilisateur nettoyées.
- Analyse antivirus asynchrone avant visibilité et statut `quarantine/ready/rejected`.
- Suppression des métadonnées EXIF sensibles à l'affichage ; original conservé selon consentement.
- Liens invités avec jeton révocable, limite de débit et journal d'accès.
- Chiffrement TLS en transit et chiffrement fournisseur au repos.

## Sauvegardes et récupération

1. Contenu : version automatique avant chaque publication, conservation glissante de 50 versions.
2. Base PostgreSQL future : sauvegarde quotidienne + restauration temporelle, test de restauration trimestriel.
3. Médias R2 : versioning/lifecycle ou réplication vers un second bucket/compte ; sauvegarde séparée de la base.
4. Objectifs de lancement : RPO 24 h pour contenus, 1 h pour données transactionnelles ; RTO 8 h.
5. Export complet ZIP/JSON accessible au couple avant expiration.
6. Aucun système n'est considéré sauvegardé tant qu'une restauration testée n'a pas réussi.

## Quotas commerciaux proposés

| Formule | Stockage | Invités | Administrateurs | Vidéo/fichier | Conservation |
|---|---:|---:|---:|---:|---:|
| Pilote | 5 Go | 150 | 2 | 2 Go | 12 mois |
| Essentiel | 10 Go | 200 | 2 | 2 Go | 12 mois |
| Signature | 50 Go | 350 | 4 | 5 Go | 18 mois |
| Extension | +25 Go | — | — | — | +12 mois |

Alertes à 80 % et 95 %. À 100 %, bloquer les nouveaux envois sans supprimer de données. Afficher la consommation photos/vidéos/audio séparément.

## Mesures avant vente

- MFA obligatoire pour l'administration Éclat.
- Réinitialisation de mot de passe avec jeton à usage unique de 30 minutes.
- Validation d'e-mail, journal des connexions, révocation de toutes les sessions.
- WAF, limitation de débit distribuée, en-têtes CSP/HSTS/Permissions-Policy.
- Tests d'autorisation croisée automatisés : un tenant A ne doit jamais lire/modifier B.
- Plan d'incident et notification APD dans les délais applicables.