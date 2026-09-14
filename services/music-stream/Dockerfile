FROM node:26.5.1-bookworm-slim@sha256:9e6f9357d371591e32ab6f2d8a26d63bdd0d17c29eee3f4f3e7e454d9634bf73 AS catalog
WORKDIR /source
COPY package.json ./
COPY data/site.json ./data/site.json
COPY music/catalog.js ./music/catalog.js
COPY assets/js/generated/validators.js ./assets/js/generated/validators.js
COPY scripts/music/runtime-catalog.mjs ./scripts/music/runtime-catalog.mjs
RUN node scripts/music/runtime-catalog.mjs data/site.json /runtime/music
FROM golang:1.26.5-bookworm@sha256:53eeac89074db483fdf0ab3be1df32bf6e47562263d2d0d6baa7f26acb4957dd AS build
WORKDIR /source
COPY services/music-stream/go.mod services/music-stream/go.sum ./
RUN go mod download
COPY services/music-stream/cmd ./cmd
COPY services/music-stream/internal ./internal
ENV CGO_ENABLED=0
RUN go build -trimpath -o /out/music-stream ./cmd/music-stream && go build -trimpath -o /out/music-media ./cmd/music-media
FROM scratch
COPY --from=build /out/music-stream /out/music-media /
COPY --from=catalog /runtime/music/ /runtime/music/
EXPOSE 8092
ENTRYPOINT ["/music-stream"]
