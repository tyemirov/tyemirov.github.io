FROM node:26.5.1-bookworm-slim@sha256:9e6f9357d371591e32ab6f2d8a26d63bdd0d17c29eee3f4f3e7e454d9634bf73 AS catalog
WORKDIR /source
COPY package.json ./
COPY services/gallery/package-public.mjs ./services/gallery/package-public.mjs
COPY gallery/js/core/catalog.js ./gallery/js/core/catalog.js
COPY gallery/js/constants.js ./gallery/js/constants.js
COPY assets/js ./assets/js
COPY data/site.json ./data/site.json
COPY gallery/images ./gallery/images
RUN node services/gallery/package-public.mjs /source /public
FROM golang:1.26.5-bookworm@sha256:53eeac89074db483fdf0ab3be1df32bf6e47562263d2d0d6baa7f26acb4957dd AS build
WORKDIR /source
COPY services/gallery/go.mod services/gallery/go.sum ./
RUN go mod download
COPY services/gallery/*.go services/gallery/contract.*.json ./
COPY services/gallery/cmd ./cmd
ENV CGO_ENABLED=0
RUN go build -trimpath -o /out/gallery ./cmd/gallery
FROM build AS mail-build
RUN go build -trimpath -o /out/gallery-mail-sink ./cmd/gallery-mail-sink
FROM scratch AS mail-sink
COPY --from=mail-build /out/gallery-mail-sink /gallery-mail-sink
EXPOSE 50051
ENTRYPOINT ["/gallery-mail-sink"]
FROM scratch AS gallery
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /out/gallery /gallery
COPY --from=catalog /public /site
EXPOSE 8093
ENTRYPOINT ["/gallery"]
