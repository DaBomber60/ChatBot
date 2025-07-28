#!/bin/sh
set -e

echo "🚀 Starting HomeChatBot..."

# Function to wait for PostgreSQL to be ready
wait_for_postgres() {
    echo "⏳ Waiting for PostgreSQL to be ready..."
    
    # Extract connection details from DATABASE_URL if it's PostgreSQL
    if echo "$DATABASE_URL" | grep -q "postgresql://"; then
        # Parse DATABASE_URL to get host and port
        # This is a simple parser - works for most standard URLs
        DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
        DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
        
        # Default to localhost:5432 if parsing fails
        DB_HOST=${DB_HOST:-localhost}
        DB_PORT=${DB_PORT:-5432}
        
        echo "🔍 Checking PostgreSQL connection to $DB_HOST:$DB_PORT..."
        
        # Wait for PostgreSQL to accept connections
        while ! nc -z "$DB_HOST" "$DB_PORT"; do
            echo "⏳ PostgreSQL is not ready yet. Waiting 2 seconds..."
            sleep 2
        done
        
        echo "✅ PostgreSQL is accepting connections"
        
        # Additional wait to ensure PostgreSQL is fully ready
        sleep 3
    else
        echo "ℹ️  Using SQLite database - no connection wait needed"
    fi
}

# Check if netcat is available (for PostgreSQL connection check)
if command -v nc >/dev/null 2>&1; then
    wait_for_postgres
else
    echo "⚠️  netcat not available - skipping PostgreSQL connection check"
    echo "⏳ Waiting 10 seconds for database to be ready..."
    sleep 10
fi

# Wait for database to be ready and run migrations
echo "⏳ Running database migrations..."
npx prisma migrate deploy
echo "✅ Database migrations completed"

# Generate Prisma client (in case of any schema changes)
echo "🔧 Generating Prisma client..."
npx prisma generate
echo "✅ Prisma client generated"

echo "🎉 Starting application..."
exec "$@"
