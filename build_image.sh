#!/bin/bash
# Build Docker image and create tar file for cloud deployment

set -e  # Exit on error

# Check for --clean flag to force rebuild without cache
CLEAN_BUILD=false
if [[ "$1" == "--clean" ]]; then
    CLEAN_BUILD=true
    echo "🧹 Clean build requested - will rebuild without cache"
fi

echo "🧹 Cleaning up build artifacts..."

# Container configuration
IMAGE_NAME="container-monkey"

# Only remove old image if clean build requested (keeps cache for faster builds)
if [ "$CLEAN_BUILD" = true ]; then
    echo "  - Removing old image (clean build)..."
    sudo docker rmi "$IMAGE_NAME" 2>/dev/null || true
fi

# Clean up build artifacts
echo "  - Cleaning build artifacts..."
rm -f container-monkey.tar 2>/dev/null || true
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
sudo docker save -o container-monkey.tar "$IMAGE_NAME" 2>/dev/null || \
echo "⚠️  Could not save image"

echo ""
echo "✅ Build complete!"
echo ""
echo "📦 Image saved to: container-monkey.tar"
echo ""
echo "💡 To deploy to cloud Docker:"
echo "   1. Transfer container-monkey.tar to your cloud server"
echo "   2. Load the image: docker load -i container-monkey.tar"
echo "   3. Run the container with appropriate volume mounts and ports"
echo ""
echo "💡 Tip: Build uses Docker cache for faster rebuilds."
echo "   Use './build_image.sh --clean' to force a complete rebuild without cache."


