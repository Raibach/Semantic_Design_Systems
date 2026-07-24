#!/bin/bash
# Push this repo to GitHub. Run from project root: ./push-to-github.sh
# Get a free PAT: GitHub → Settings → Developer settings → Personal access tokens (classic)

cd "$(dirname "$0")"
export GIT_TERMINAL_PROMPT=0
export GIT_ASKPASS=/bin/false

if [ -n "$GITHUB_PAT" ]; then
  git push "https://Raibach:${GITHUB_PAT}@github.com/Raibach/prompt-composer-console.git" main
else
  echo "Set your token first, then run again:"
  echo "  export GITHUB_PAT=your_token_here"
  echo "  ./push-to-github.sh"
  echo ""
  echo "Or run one line (replace YOUR_TOKEN):"
  echo '  GITHUB_PAT=YOUR_TOKEN ./push-to-github.sh'
fi
