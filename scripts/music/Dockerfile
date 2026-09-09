FROM mwader/static-ffmpeg:8.1.2@sha256:33f770f812cbfc3de96c547157fc9faf8bd95a36481753439ffa761045167585 AS ffmpeg
FROM node:26.5.1-bookworm-slim@sha256:9e6f9357d371591e32ab6f2d8a26d63bdd0d17c29eee3f4f3e7e454d9634bf73
COPY --from=ffmpeg /ffmpeg /ffprobe /usr/local/bin/
COPY prepare.mjs /app/prepare.mjs
ENTRYPOINT ["node", "/app/prepare.mjs"]
