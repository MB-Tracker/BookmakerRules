#!/bin/sh
set -e
cd "$(dirname "$0")/editor"
[ -d node_modules ] || npm install
npm run dev
