#!/bin/bash

# HomeChatBot Deployment Script
# Usage: ./deploy.sh [--rebuild] [--logs]

set -e

# Detect Docker Compose command (V1 vs V2)
if command -v docker-compose >/dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
elif docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
else
    echo "❌ Error: Docker Compose not found!"
    echo "Please install Docker and Docker Compose:"
    echo "  - Docker Compose V1: install docker-compose"
    echo "  - Docker Compose V2: use 'docker compose' (included with Docker)"
    exit 1
fi

echo "🚀 HomeChatBot Deployment Script"
echo "================================="
echo "📦 Using: $DOCKER_COMPOSE"

# Default values
REBUILD=false
SHOW_LOGS=false
NGINX_PROFILE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --rebuild)
      REBUILD=true
      shift
      ;;
    --logs)
      SHOW_LOGS=true
      shift
      ;;
    --nginx)
      NGINX_PROFILE="--profile nginx"
      shift
      ;;
    *)
      echo "Unknown option $1"
      echo "Usage: $0 [--rebuild] [--logs] [--nginx]"
      exit 1
      ;;
  esac
done

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo "📝 Creating .env from template..."
    cp .env.docker .env
    echo "✅ Please edit .env file with your configuration"
    echo "🔑 Don't forget to set secure passwords!"
    exit 1
fi

# Validate required environment variables
echo "🔍 Validating configuration..."

# Check if JWT_SECRET exists and is not empty
if ! grep -q "JWT_SECRET=" .env || grep -q "JWT_SECRET=$" .env; then
    echo "🔑 Generating random JWT_SECRET..."
    # Generate a secure random JWT secret (64 characters)
    # Try multiple methods for cross-platform compatibility
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || \
                 xxd -l 32 -p /dev/urandom 2>/dev/null | tr -d '\n' || \
                 head -c 64 /dev/urandom 2>/dev/null | base64 | tr -d '\n' | head -c 64 || \
                 node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || \
                 echo "$(date +%s)_$(whoami)_$(hostname)" | sha256sum | cut -d' ' -f1 2>/dev/null || \
                 echo "fallback_secret_$(date +%s)_please_change_me")
    
    # Update the .env file
    if grep -q "JWT_SECRET=" .env; then
        # Replace existing empty JWT_SECRET
        sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
    else
        # Add JWT_SECRET if it doesn't exist
        echo "JWT_SECRET=$JWT_SECRET" >> .env
    fi
    echo "✅ JWT_SECRET generated and saved to .env"
fi

echo "✅ Configuration ready"

# Stop existing containers
echo "🛑 Stopping existing containers..."
$DOCKER_COMPOSE down

# Rebuild if requested
if [ "$REBUILD" = true ]; then
    echo "🔨 Rebuilding containers..."
    $DOCKER_COMPOSE build --no-cache
fi

# Start services
echo "🐳 Starting services..."
$DOCKER_COMPOSE up -d $NGINX_PROFILE

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
timeout=60
while [ $timeout -gt 0 ]; do
    if $DOCKER_COMPOSE ps | grep -q "Up (healthy)"; then
        echo "✅ Services are healthy!"
        break
    fi
    echo "   Waiting... ($timeout seconds remaining)"
    sleep 5
    timeout=$((timeout - 5))
done

if [ $timeout -eq 0 ]; then
    echo "❌ Services failed to become healthy"
    echo "📋 Container status:"
    $DOCKER_COMPOSE ps
    echo "📝 Logs:"
    $DOCKER_COMPOSE logs --tail=50
    exit 1
fi

# Show deployment info
echo ""
echo "🎉 HomeChatBot deployed successfully!"
echo "=================================="
echo "📱 Application: http://localhost:$(grep APP_PORT .env | cut -d= -f2 | head -1)"

if [ -n "$NGINX_PROFILE" ]; then
    echo "🌐 Nginx: http://localhost:$(grep NGINX_HTTP_PORT .env | cut -d= -f2 | head -1 || echo 80)"
fi

echo ""
echo "🔧 Useful commands:"
echo "   View logs: $DOCKER_COMPOSE logs -f"
echo "   Stop: $DOCKER_COMPOSE down"
echo "   Update: ./deploy.sh --rebuild"
echo ""

# Show logs if requested
if [ "$SHOW_LOGS" = true ]; then
    echo "📝 Live logs (Ctrl+C to exit):"
    $DOCKER_COMPOSE logs -f
fi
