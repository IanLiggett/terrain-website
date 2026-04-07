FROM mcr.microsoft.com/devcontainers/python:3.12-bullseye

# The base image may include a Yarn apt source with an unavailable key.
# Remove it so feature installation apt updates remain valid.
RUN rm -f /etc/apt/sources.list.d/yarn.list
