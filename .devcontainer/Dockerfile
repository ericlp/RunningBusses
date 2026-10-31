FROM jdxcode/mise:2026.10.25 AS mise
FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

COPY --from=mise /usr/local/bin/mise /usr/local/bin/mise
RUN apt-get update -qq && apt-get install -y --no-install-recommends osmium-tool && apt-get clean

ENV PATH="/home/vscode/.local/share/mise/shims:${PATH}"
