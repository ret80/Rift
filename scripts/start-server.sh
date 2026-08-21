#!/bin/bash
# Check if server is running on port 3000, start it if not
PORT=3000

if lsof -i :$PORT > /dev/null 2>&1; then
  echo "✓ Server is already running on port $PORT"
  exit 0
else
  echo "→ Server is not running, starting Vite preview server..."
  npm run preview &
  # Wait for server to be ready
  for i in {1..30}; do
    if lsof -i :$PORT > /dev/null 2>&1; then
      echo "✓ Server started successfully"
      exit 0
    fi
    sleep 1
  done
  echo "✗ Failed to start server"
  exit 1
fi
