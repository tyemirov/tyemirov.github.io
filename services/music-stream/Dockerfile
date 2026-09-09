FROM golang:1.26.5-bookworm@sha256:53eeac89074db483fdf0ab3be1df32bf6e47562263d2d0d6baa7f26acb4957dd AS build
WORKDIR /source
COPY go.mod ./
COPY cmd ./cmd
COPY internal ./internal
ENV CGO_ENABLED=0
RUN go build -trimpath -o /out/music-stream ./cmd/music-stream && go build -trimpath -o /out/music-media ./cmd/music-media
FROM scratch
COPY --from=build /out/music-stream /out/music-media /
EXPOSE 8092
ENTRYPOINT ["/music-stream"]
