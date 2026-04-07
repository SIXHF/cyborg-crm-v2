#!/bin/sh
# Run database migration on startup, then start the Next.js server
echo "Running database migration..."
node /app/migrate.js
echo "Starting server..."
exec node server.js
