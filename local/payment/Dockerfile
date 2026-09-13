FROM node:26.5.1-bookworm-slim@sha256:9e6f9357d371591e32ab6f2d8a26d63bdd0d17c29eee3f4f3e7e454d9634bf73
WORKDIR /provider
COPY server.mjs approval.html ./
EXPOSE 8094 8095
CMD ["node", "server.mjs"]
