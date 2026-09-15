#!/bin/bash
# Empêche Netlify de redéployer le site à chaque commit automatique du robot d'actus
# (qui ne change que data/articles.json). Sans ça, Netlify rebuild toutes les 30 min
# et épuise vite son quota gratuit de crédits.
#
# Exit 0 = on annule le build (rien d'important n'a changé pour Netlify)
# Exit 1 = on laisse Netlify construire normalement (vrai changement de code)

if git log -1 --pretty=%B | grep -q "Actus mises à jour automatiquement"; then
  echo "Commit du robot d'actus détecté — build Netlify ignoré."
  exit 0
else
  echo "Changement de code détecté — build Netlify lancé normalement."
  exit 1
fi
