#!/bin/bash
# Initialize database schema on first deploy
# Run from the project root after docker compose is up

echo "Waiting for database to be ready..."
sleep 5

echo "Pushing schema to database..."
docker compose exec app npx drizzle-kit push --config drizzle.config.ts

echo "Database schema initialized."
