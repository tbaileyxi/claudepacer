FROM ghcr.io/berriai/litellm:main-latest

# The config is mounted as a volume at runtime (see docker-compose.yml)
# This Dockerfile exists for custom build scenarios only.

EXPOSE 4000
CMD ["--config", "/app/config.yaml", "--port", "4000"]
