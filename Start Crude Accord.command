#!/bin/bash
#
# Double-click this file to run a Crude Accord lesson on a Mac.
#
# It does nothing clever: it moves into this folder and runs "npm run class",
# which is the same thing a teacher would type. If anything goes wrong the
# window stays open so the message can be read, rather than disappearing.

cd "$(dirname "$0")" || {
  echo "Could not find the Crude Accord folder."
  echo "Press Return to close this window."
  read -r _
  exit 1
}

echo "Starting Crude Accord from $(pwd)"
echo

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js is not installed on this computer, and Crude Accord needs it."
  echo
  echo "  1. Go to https://nodejs.org"
  echo "  2. Download the version marked LTS and install it."
  echo "  3. Double-click this file again."
  echo
  echo "Press Return to close this window."
  read -r _
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "This is the first time, so the parts have to be downloaded once."
  echo "This needs the internet, takes a few minutes, and happens only once."
  echo
  if ! npm install; then
    echo
    echo "The download did not finish. Check the internet connection and try again."
    echo "Press Return to close this window."
    read -r _
    exit 1
  fi
  echo
fi

npm run class
status=$?

# Ctrl+C is the normal way to finish, and the launcher reports 0 or 130 for it.
if [ $status -ne 0 ] && [ $status -ne 130 ]; then
  echo
  echo "Crude Accord stopped because of a problem (code $status)."
  echo "The message above says what to do. Nothing you saved has been lost."
  echo
  echo "Press Return to close this window."
  read -r _
fi
