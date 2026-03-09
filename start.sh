#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "⚠️  Warning: ANTHROPIC_API_KEY is not set."
  echo "   Papers will be fetched from arxiv, but AI narrative generation will fail."
  echo "   Export it with: export ANTHROPIC_API_KEY=your_key_here"
  echo ""
fi

PORT=${PORT:-8000}
echo "Starting State of Research on http://localhost:$PORT"
python -m uvicorn main:app --host 0.0.0.0 --port "$PORT" --reload
