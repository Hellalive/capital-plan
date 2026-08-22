# Capital Plan V2

Simulateur personnel d’indépendance financière adapté par défaut à une personne de 38 ans résidant en Belgique.

## Ce que la V2 corrige

- Elle remplace la date déterministe au mois près par deux seuils : possible (50 %) et robuste (90 % par défaut).
- Elle sépare les dépenses de vie, l’investissement et la constitution d’une réserve de sécurité.
- Elle teste la volatilité et le risque de séquence au moyen de trajectoires Monte-Carlo reproductibles.
- Elle projette le portefeuille jusqu’à un âge de sécurité configurable, 95 ans par défaut.
- Elle intègre pension, frais, TOB, fiscalité simplifiée des plus-values et taxe sur les comptes-titres.
- Elle accepte des événements de vie : interruption de carrière, évolution salariale, fin d’une dette, changement de logement, apport ou dépense exceptionnelle et vente immobilière.
- Elle confronte le résultat à trois stress tests au lieu de supposer une croissance régulière.
- Son mode objectif calcule les décisions nécessaires pour viser un âge donné, 60 ans par défaut, puis mesure chaque plan sous trois hypothèses de marché.

## Mode objectif

Le bouton « Construire un plan pour un âge cible » compare trois stratégies : équilibrer hausse de revenu et baisse des dépenses flexibles, préserver le niveau de vie en augmentant les revenus, ou privilégier la réduction des dépenses. Le marché prudent, central ou favorable reste une hypothèse externe au plan.

Le moteur calcule le besoin sans plafond arbitraire, signale les ratios d’effort élevés et accepte des limites personnelles facultatives. L’utilisateur peut ensuite appliquer un plan au simulateur principal ; aucune hypothèse n’est modifiée avant cette action explicite.

## Limites assumées

Le modèle est une aide à la décision, pas une prévision ni un conseil financier. La fiscalité est volontairement paramétrable et simplifiée : elle ne couvre pas tous les instruments, exemptions, situations familiales ou changements législatifs. Les rendements suivent une distribution log-normale ; les crises réelles présentent davantage d’événements extrêmes et de corrélations changeantes.

## Utilisation

Ouvrir directement `index.html` ou servir le dossier avec un serveur HTTP. L’application ne dépend d’aucune bibliothèque externe et conserve les hypothèses dans le stockage local du navigateur. Le fichier `app.bundle.js` est généré depuis `model.js` et `app.js` avec `npm run build`.

## Vérification

```powershell
node tests.mjs
```

Les tests couvrent la cohérence du budget, la décroissance du capital cible avec l’âge, l’exécution d’une trajectoire et la forme des résultats probabilistes.
