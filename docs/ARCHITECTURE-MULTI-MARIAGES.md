# Éclat — architecture multi-mariages

## Séparation des produits

- `laura-giova.be` : mariage Laura & Giovanni, démonstrateur public et vitrine.
- `/eclat` : portail d'inscription et de connexion des futurs mariés pendant le pilote.
- `/mariage/{slug}` : site public généré pour chaque mariage.
- À la création de la société, Éclat devra utiliser son propre domaine. Les chemins et API sont déjà indépendants.

## Isolation

Chaque couple reçoit un `tenantId` UUID. Contenus, versions et médias sont rangés sous `eclat/tenants/{tenantId}/`. Toutes les routes privées vérifient la session HttpOnly et l'appartenance de l'utilisateur au tenant. Le code admin Laura & Giovanni ne donne aucun droit sur les espaces Éclat.

Le registre JSON dans R2 convient uniquement au pilote contrôlé. Avant commercialisation : migrer utilisateurs, sessions, RSVP, audit et métadonnées vers PostgreSQL managé avec contraintes par tenant et politique RLS. R2 reste le stockage objet.

## Parcours

1. Inscription du couple et choix de l'adresse.
2. Création atomique de l'utilisateur, du tenant et du contenu initial.
3. Connexion par cookie `HttpOnly; Secure; SameSite=Lax`.
4. Édition et publication ; chaque publication sauvegarde la version précédente.
5. Site public en lecture seule.
6. Suppression à 12 mois après l'événement, précédée d'avis à J-365, J-120, J-30, J-7 et J-1.

## Variables d'exploitation

`R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`.

Le fournisseur e-mail reste facultatif en pilote : les échéances sont calculées, mais aucun message ne part sans configuration Resend.