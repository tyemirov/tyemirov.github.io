# Unlisted albums

The source catalog is `data/site.json`.
Each album has a `status` and a `visibility`.
The values for `status` are `draft` and `live`.
The values for `visibility` are `listed` and `unlisted`.

A draft album is absent from the production artifact and the media service allowlist.
A live, unlisted album has a direct page and file playback.
Its page has `noindex`.
The homepage, Music index, and sitemap exclude it.
The public catalog and route manifest contain its metadata.
Anyone with the URL can open the page.

## Current draft

The album slug is `ostatki-sladki-7c9e2b18`.
The five track IDs are `ostatki-sladki-01` through `ostatki-sladki-05`.
The track titles come from the five selected WAV filenames.
The sixth recording in the source directory is outside this album.
The album has a title cover.

The prepared AAC-LC recordings and preparation receipts are in `.local/music-drafts/ostatki-sladki-7c9e2b18/`.
Its `catalog.json` contains exactly those five recordings.
These local files are outside Git and the production artifact.
The production media index remains `assets/music/catalog.json`.

## Local preview

1. Prepare the selected draft with this command:

   ```sh
   make music-preview ALBUM=ostatki-sladki-7c9e2b18 > .local/ostatki-preview.json
   ```

2. Read the `site` and `media` paths from `.local/ostatki-preview.json`.
3. In one terminal, serve the `site` directory:

   ```sh
   ghttp 18680 --bind 127.0.0.1 --directory <site> --no-md
   ```

4. In another terminal, start the media service from `services/music-stream`:

   ```sh
   go run ./cmd/music-stream \
     --listen 127.0.0.1:18682 \
     --media-root <media> \
     --index <media>/catalog.json \
     --allowlist <media>/allowlist.json \
     --public-origin http://localhost:18682 \
     --allowed-origins http://localhost:18680
   ```

5. Open the `url` from `.local/ostatki-preview.json`.
6. To stop the preview, press Control-C in both terminals.

The preview command promotes only the selected draft in a local catalog copy.
It validates the combined media index through `music-media validate`.
It keeps the source catalog and production media index unchanged.
Missing, extra, or mismatched draft recordings cause an error.

## Publication

Publication requires author permission for all five songs and a user request.
After these requirements are completed:

1. Add the prepared recordings to the production media directory and index.
2. Change the album status to `live`.
3. Keep its visibility as `unlisted`.
4. Update the catalog, track-count, and draft preview test fixtures for the new publication state.
5. Run `make ci`.
6. Use the repository release and publication procedure.

The preview artifact uses localhost addresses and is for local review only.
