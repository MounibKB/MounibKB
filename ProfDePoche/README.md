# Prof de Poche

Une « machine à cours interactifs » : on lui donne n'importe quelle série d'exercices (photos, PDF, Word, PowerPoint ou texte, toutes matières), et le prof IA la transforme en parcours guidé.

## Pipeline
1. **Lecture des fichiers** dans le navigateur (pdf.js, mammoth, JSZip).
2. **Transcription fidèle** de la série : exercices, énoncés, questions, règles à retenir.
3. **Résolution exercice par exercice**, deux à la fois, avec étapes, indices, quiz et figure. On peut commencer l'exercice 1 pendant que les autres se préparent ; un exercice raté peut être refait seul.

## Le parcours
- Navigation par question, étapes révélées une à une, progression et XP.
- Figures :
  - géométrie vectorielle **interactive** : points déplaçables, propriétés (alignement, milieu, parallélisme) vérifiées en direct ;
  - **courbes** de fonctions (analyseur d'expressions sans eval) ;
  - **schémas SVG** nettoyés (physique, SVT…) ;
  - aucun schéma pour les matières littéraires.
- Fonctions IA :
  - « Explique autrement » : plus simple, image de la vie, histoire, pourquoi, darija, une phrase ;
  - indice plus précis ;
  - 3 questions de quiz supplémentaires ;
  - correction de la copie (texte ou photo du cahier) ;
  - exercice similaire ;
  - chat avec le prof IA.
- Modèle : Haiku 5.5 par défaut, Sonnet 5.5 ou Opus 5.5 au choix ; curseur d'effort (rapide / équilibré / approfondi).
- Interface FR / AR / EN, explications en français, arabe, anglais ou darija ; thème sombre par défaut, thème clair disponible.

## Exemple fourni
« Calcul vectoriel — Série n°1, Tronc commun, GS Al Makrizi » : 6 exercices et 24 questions résolus à la main. Toutes les relations ont été vérifiées numériquement. Les fautes d'orthographe de la fiche ont été légèrement corrigées (par exemple « deux point tel que » → « deux points tels que »).

## Fichiers
- `prof-de-poche.html` : page publiée dans Claude (capacité `sample` avec images).
- `index.html` : même page, autonome ; demande une clé Anthropic API stockée localement.
