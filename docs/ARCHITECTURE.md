# Tectonik — architecture

Déploiement : https://tectonik.app (Worker `tectonik` : assets statiques du
front + API), base D1 `tectonik`.

Copie de l'architecture de Sudoku Race, elle-même alignée sur Mots Croisés et
Fléchette : monorepo npm, paquet `shared` partagé par le Worker, le front et le
générateur ; le Worker sert le front construit (`[assets]`, repli SPA) et ne
passe en code que pour `/api/*`. Pas de Durable Object ni de WebSocket ici :
chacun joue seul, on compare les temps.

## Règles et format des grilles

- Grille de largeur × hauteur cases (3 à 10 de côté), indexées ligne par ligne.
- Zones de 1 à 5 cases d'un seul tenant ; une zone de n cases contient 1..n.
  Deux cases qui se touchent (coins compris) n'ont jamais le même chiffre.
- Texte des zones : un caractère par case (`0-9A-Za-z`), même caractère = même
  zone, numérotées dans l'ordre de lecture. Chiffres : un caractère par case,
  `0` pour une case vide.
- `packages/shared/src/tectonic.ts` : géométrie (zone, taille, voisines et
  « pairs » de chaque case), validation d'un découpage, conflits, grille finie,
  coloration des zones en quatre teintes pour l'affichage.
- Une grille pleine, sans conflit et qui garde les chiffres donnés est
  forcément la solution (unicité) : le client sait qu'il a fini sans la
  solution, et le serveur compare quand même à la solution stockée.

## Vue d'ensemble

```
                 ┌──────────────────────────┐
                 │  front (packages/web)    │  React + Vite, statique,
                 └────────────┬─────────────┘  servi par le Worker
                              │ HTTPS /api/*   Authorization: Bearer <secret>
                 ┌────────────▼─────────────┐
                 │  Worker (packages/worker)│  identité, chrono, validation,
                 │   └─ D1  DB              │  amis, classement, saison
                 └──────────────────────────┘

   hors ligne :  packages/generator  ──►  packages/worker/seed/puzzles.sql  ──►  wrangler d1 execute
```

## Identité anonyme

- Première visite : `POST /api/player {lang}` crée un secret (32 octets aléatoires,
  base64url), un code ami (6 caractères parmi `ABCDEFGHJKMNPQRSTUVWXYZ23456789`) et
  un pseudo au hasard (animal + adjectif, en français ou en anglais selon la
  langue du navigateur ; numéro ajouté seulement en cas de doublon). Limité à 10
  créations par minute et par IP (`[[ratelimits]]`).
- Le client garde le secret en `localStorage` et l'envoie en
  `Authorization: Bearer`. Le serveur ne stocke que son SHA-256.
- Changer d'appareil : les réglages affichent le secret en texte et en QR code.
  Le QR code encode `<origine du site>/restore#<secret>` : le scanner avec
  l'appareil photo ouvre le site et reprend le profil (le secret est dans le
  fragment, jamais envoyé au serveur ni gardé dans l'historique). Coller le code
  ou le lien dans les réglages fait la même chose. Un appareil vierge reprend le
  profil directement ; sinon une confirmation est demandée.

## Amis

- Lien d'invitation `/add/<code>` : l'ouvrir ajoute ce joueur à ma liste.
- Ajout à sens unique : il apparaît aussitôt dans mon classement, j'apparais dans
  le sien quand il m'ajoute aussi. La liste indique qui m'a ajouté en retour.
  Pas de demande en attente.
- Duel : `/<jour>/vs/<code>` ajoute l'auteur du lien et ouvre la grille de ce
  jour avec un encart « duel » (temps de chacun, verdict, bouton pour renvoyer le
  défi afin que l'autre voie mon temps). N'importe quel jour peut servir.
- Aucune route ne liste les joueurs : tout passe par le cercle « moi + mes amis ».

## Jours, chrono, score

- Clé du jour : date à Paris (`AAAA-MM-JJ`). Un jour futur n'est jamais servi.
  Premier jour : lundi 2 novembre 2026 (grille n° 1).
- `GET /api/puzzle/:day` ne renvoie que les dimensions tant que le chrono n'est
  pas lancé (le découpage en zones est déjà un indice) ; `POST /api/start` fixe
  `started_at` au premier appel (reprendre ne le change pas) et renvoie zones,
  chiffres donnés et solution (pour la vérification automatique ; le seed est
  public de toute façon).
- `POST /api/finish {day, grid, mistakes, wrong}` : grille == solution, puis
  `time_ms = maintenant − started_at + 10 000 × mistakes + 30 000 × wrong`,
  enregistré une seule fois par joueur et par jour. Le temps est celui de
  l'horloge : fermer la page n'arrête pas le chrono.
- Erreurs (déclarées par le client) : `mistakes` compte les chiffres posés en
  conflit, c'est-à-dire déjà présents dans leur zone ou dans une case qui les
  touche (+10 s), `wrong` les chiffres qui ne sont pas ceux de la solution sans
  être en conflit (+30 s) ; un chiffre à la fois en conflit et faux ne coûte que
  10 s. Elles ne comptent que si la vérification automatique est active (c'est
  le prix de l'aide) ; activer la vérification, annuler ou rétablir compte les
  erreurs qui apparaissent, et chaque (case, chiffre) ne compte qu'une fois.
- Jours passés : jouables à tout moment, le score compte dans le classement de ce
  jour-là.
- Saison hebdomadaire (lundi → dimanche) : chaque jour, 3 points au plus rapide
  du cercle, 2 au deuxième, 1 à tous les autres qui ont fini (ex æquo au même
  rang). Pas de série.

## Schéma D1

Voir `packages/worker/migrations/0001_init.sql` : `players`, `friendships`,
`puzzles` (jour, largeur, hauteur, zones, chiffres donnés, solution,
difficulté), `attempts` (départ du chrono), `scores` (temps, conflits, chiffres
faux).

## API

| Méthode | Chemin | Rôle |
|---|---|---|
| POST | /api/player | créer l'identité (seule route sans jeton) |
| GET | /api/player | mon profil (pseudo, code ami) |
| PATCH | /api/player | changer de pseudo (20 caractères au plus) |
| GET | /api/days | jours jouables et mon état pour chacun (bandeau des archives) |
| GET | /api/puzzle/:day | difficulté, dimensions, départ, score ; zones, grille et solution si commencée |
| POST | /api/start | lancer le chrono, recevoir zones, grille et solution |
| POST | /api/finish | valider et enregistrer le temps |
| GET | /api/board/:day | moi + amis, triés par temps ; amis sans score à part |
| GET | /api/season/:day | points de la semaine qui contient ce jour |
| GET | /api/friends | ma liste (avec « m'a ajouté aussi ») |
| POST | /api/friends/:code | ajouter |
| DELETE | /api/friends/:code | retirer |

Erreurs : `{ "error": "unauthorized" | "bad_day" | "not_yet" | "not_found" | "not_started" | "bad_grid" | "wrong" | "bad_code" | "self" | "bad_pseudo" | "rate_limited" }`.

## Front

- `/` grille du jour, `/<jour>` un jour passé, `/<jour>/vs/<code>` duel,
  `/add/<code>`, `/friends`, `/settings`, `/restore#<secret>`.
- Avant le départ, grille masquée (dimensions seulement) et bouton « Découvrir
  la grille ». En jeu : chrono (recalé sur l'heure du serveur), notes, annuler,
  rétablir, effacer, surlignage de la zone et des voisines de la case choisie et
  des chiffres identiques, vérification automatique optionnelle (conflits et
  chiffres faux), pavé 1 à 5 avec le nombre restant (les chiffres trop grands
  pour la zone de la case choisie sont grisés et refusés) ; clavier (chiffres,
  Maj+chiffre ou mode N pour les notes, flèches, retour arrière, Ctrl+Z, Ctrl+Y).
- Grille : cases en grille CSS, contours des zones tracés en SVG par-dessus
  (traits nets et centrés quelle que soit la forme), zones teintées en quatre
  couleurs pastel (deux zones qui partagent un côté n'ont jamais la même),
  désactivable dans les réglages. La grille (9 × 9 au plus) occupe le même carré
  que celle de Sudoku Race : case = côté du carré ÷ max(largeur, hauteur),
  64 px au plus, donc jamais plus petite qu'une case du sudoku.
  La partie en cours est gardée en `localStorage` par jour, historique
  d'annulation et de rétablissement compris (300 états au plus, effacé une fois
  la grille finie) : on peut annuler en reprenant la grille le lendemain.
- Réglages : vérification automatique par défaut, grosses notes (activées
  d'office pour le pseudo « Pangolin distrait » tant qu'aucun choix n'est fait),
  zones colorées.
- Classement et saison à droite sur grand écran, sous la grille sur mobile ;
  bandeau des jours en haut (difficulté en couleur, temps des grilles finies).
- Textes dans `packages/web/src/i18n/{fr,en}.ts` ; langue du navigateur par
  défaut, modifiable dans les réglages.
