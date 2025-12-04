FROM python:3.11-slim

WORKDIR /app

# Install Docker CLI (needed to interact with Docker daemon)
# This layer is cached unless apt packages change
RUN apt-get update && apt-get install -y \
    docker.io \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (for better caching)
# This layer is cached unless requirements.txt changes
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code last (changes most frequently)
# This layer rebuilds when code changes, but previous layers stay cached
COPY . .

# Expose Flask port
EXPOSE 80

# Run the application
CMD ["python", "app.py"]


