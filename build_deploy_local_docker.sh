#!/bin/bash
# Build and run Container Monkey using docker run

set -e  # Exit on error

# Check for --clean flag to force rebuild without cache
CLEAN_BUILD=false
if [[ "$1" == "--clean" ]]; then
    CLEAN_BUILD=true
    echo "🧹 Clean build requested - will rebuild without cache"
fi

echo "🧹 Cleaning up old container_monkey resources..."

# Container configuration
CONTAINER_NAME="container_monkey"
IMAGE_NAME="container_monkey"
VOLUME_NAME="container_monkey"
PORT_MAPPING="1066:80"
FLASK_PORT=80

# Stop and remove existing container
echo "  - Stopping and removing container..."
sudo docker stop "$CONTAINER_NAME" 2>/dev/null || true
sudo docker rm "$CONTAINER_NAME" 2>/dev/null || true

# Only remove old image if clean build requested (keeps cache for faster builds)
if [ "$CLEAN_BUILD" = true ]; then
    echo "  - Removing old image (clean build)..."
    sudo docker rmi "$IMAGE_NAME" 2>/dev/null || true
fi

# Clean up build artifacts
echo "  - Cleaning build artifacts..."
rm -f container_monkey.tar 2>/dev/null || true
find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
find . -type f -name "*.pyc" -delete 2>/dev/null || true

echo "✅ Cleanup complete"
echo ""

echo "🔨 Building Docker image..."
if [ "$CLEAN_BUILD" = true ]; then
    sudo docker build --no-cache -t "$IMAGE_NAME" .
else
    # Use cache - much faster when only code changes
    sudo docker build -t "$IMAGE_NAME" .
fi

echo ""
echo "💾 Saving image to tar file..."
sudo docker save -o container_monkey.tar "$IMAGE_NAME" 2>/dev/null || \
echo "⚠️  Could not save image"

echo ""
echo "🚀 Starting container..."

# Create volume if it doesn't exist
echo "  - Creating volume if needed..."
sudo docker volume create "$VOLUME_NAME" 2>/dev/null || true

# Run container
sudo docker run -d \
  --name "$CONTAINER_NAME" \
  -p "$PORT_MAPPING" \
  -e FLASK_ENV=production \
  -e FLASK_PORT="$FLASK_PORT" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$VOLUME_NAME":/backups \
  --restart unless-stopped \
  "$IMAGE_NAME"

echo ""
echo "✅ Build and deployment complete!"
echo ""
echo "📊 Container status:"
sudo docker ps --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "🌐 Access the web UI at: http://localhost:1066"
echo "📋 View logs: sudo docker logs -f $CONTAINER_NAME"
echo "📦 Image saved to: container_monkey.tar"
echo ""
echo "💡 Tip: Build uses Docker cache for faster rebuilds."
echo "   Use './build_deploy_local_docker.sh --clean' to force a complete rebuild without cache."
echo "   Use 'sudo docker stop $CONTAINER_NAME && sudo docker rm $CONTAINER_NAME' to stop and remove container."

