# Tectonik

Un Tectonic par jour, le même pour tout le monde ; le score, c'est le temps. Le
classement ne montre que toi et tes amis (pas de classement général). Pas de
compte, pas de série à tenir : les grilles passées restent jouables.
Français et anglais.

Le Tectonic (aussi appelé Suguru) : la grille est découpée en zones entourées
d'un trait gras. Une zone de n cases contient les chiffres 1 à n (cinq au plus),
et deux cases qui se touchent, même par un coin, n'ont jamais le même chiffre.

Cousin de [Sudoku Race](https://github.com/4rtefakt/sudoku-race), dont il
reprend tout le fonctionnement (grille du jour, chrono, amis, duels, saison
hebdomadaire, transfert de profil par QR code), et de
[Mots Croisés](https://github.com/4rtefakt/motscroises) et
[Fléchette](https://github.com/4rtefakt/cofl-ch-s) : même monorepo, même Worker
qui sert le front et l'API, même système visuel.

- **Site** : front React + TypeScript + Vite servi en assets statiques par le
  Worker (même origine que l'API) ; pas encore de domaine (voir « Déployer »)
- **Données** : D1 (SQLite) : joueurs, amitiés, grilles, départs du chrono, scores
- **Grilles** : générées hors ligne (solution unique, difficulté notée par les
  techniques nécessaires), seed SQL versionné

Documentation : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Arborescence

```
packages/shared     règles du Tectonic (zones, voisines, conflits), jours (heure de Paris), codes ami, pseudos, saison, types de l'API
packages/generator  découpage en zones, solveur, notation et génération des grilles, écrit packages/worker/seed/puzzles.sql
packages/worker     Worker HTTP (API + assets), migrations D1, seed, test de bout en bout
packages/web        application React (jour, archives, classement, amis, réglages)
docs/               architecture
```

## Prérequis

Node 22+, npm, `wrangler` authentifié (`CLOUDFLARE_API_TOKEN` ou `wrangler login`).

```sh
npm install
npm test          # vitest (shared, generator, web ; dont la vérification de tout le seed)
npm run typecheck # tsc sur les quatre paquets
```

## Générer des grilles

```sh
npm run gen                                   # du 2026-11-02 au 2027-12-31 (≈ 80 s)
npm run gen -- --to 2028-12-31                # prolonger : mêmes grilles pour les jours déjà faits
npm run gen -- --from 2026-11-02 --to 2027-12-31 --seed tectonik --out chemin.sql
```

Une grille par jour ; la difficulté suit le jour de la semaine et la grille
grandit avec elle, en hauteur comme dans les magazines (et comme un téléphone
tenu droit) :

| jours | niveau | taille | techniques nécessaires | indices |
|---|---|---|---|---|
| lundi, mardi | **facile** | 5 × 7 | singletons nus et cachés | ≈ 8 |
| mercredi, jeudi | **moyen** | 6 × 8 | chiffre « pointé » | ≈ 7,5 |
| vendredi, samedi | **difficile** | 7 × 9 | paires et triplets, nus et cachés | ≈ 8 |
| dimanche | **expert** | 8 × 10 | une hypothèse menant à une impasse | ≈ 8 |

Le générateur tire un découpage en zones (surtout de 4 et 5 cases, une zone
d'une case pour 40 cases au plus), une grille complète au hasard pour ce
découpage, puis retire les chiffres un par un tant que la solution reste unique
et que la résolution « à la main » ne dépasse pas le niveau visé ; il garde la
grille si elle l'atteint. Détail des techniques dans
[`packages/generator/src/grader.ts`](packages/generator/src/grader.ts).

Chaque jour a sa propre graine (graine globale + date) : relancer sur une période
plus longue redonne les mêmes grilles, et le seed utilise `INSERT OR IGNORE`,
donc il se réapplique sans toucher aux jours déjà en base. Le seed est gardé
hors de `migrations/` pour cette raison (une migration ne s'applique qu'une fois).

## Lancer en local

```sh
npm run db:local                      # migrations + seed dans la base D1 locale
npm run build:web                     # le Worker sert web/dist : il doit exister
# terminal 1 : Worker + D1 local
npm run dev:worker                    # http://localhost:8787
# terminal 2 : front avec proxy /api → 8787
npm run dev:web                       # http://localhost:5173
# test de bout en bout de l'API (deux joueurs, amis, chrono, classement, saison)
node packages/worker/scripts/smoke.mjs http://localhost:8787
# test d'interface (Chromium via playwright-core : duel, petite zone, ajout d'ami, transfert de profil)
node packages/web/scripts/ui-test.mjs http://127.0.0.1:5173
```

## Déployer

Une seule fois :

```sh
npx wrangler d1 create tectonik       # puis copier database_id dans packages/worker/wrangler.toml
```

Pour un domaine, décommenter `routes` dans `packages/worker/wrangler.toml` (le
DNS est créé par Cloudflare au déploiement) ; sans domaine, le site est servi
sur `tectonik.<compte>.workers.dev`. Ensuite, à chaque mise à jour :

```sh
npm run db:migrate    # migrations sur la base D1 distante
npm run db:seed       # grilles (INSERT OR IGNORE, sans risque à relancer)
npm run deploy        # build du front puis Worker (assets + API)
```

Le front est construit sans `VITE_API_URL` : il appelle `/api` sur sa propre
origine.

Le seed est public, solutions comprises : ce n'est pas pire qu'une appli de
résolution, et le classement ne réunit que des amis. Pour la même raison, la
solution est envoyée au client avec la grille, pour que la vérification
automatique signale aussi les chiffres faux.
