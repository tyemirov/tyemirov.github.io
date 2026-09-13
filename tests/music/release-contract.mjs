// @ts-check
import assert from "node:assert/strict";

export const serviceImages = [
  { resourceID: "music", repository: "ghcr.io/tyemirov/personal-site-music" },
  { resourceID: "gallery", repository: "ghcr.io/tyemirov/personal-site-gallery" },
];

/** @param {{ kind: string, resource_id: string, id: string, repository?: string }[]} artifacts */
export function assertReleaseArtifacts(artifacts) {
  assert.deepEqual(
    artifacts.map(({ kind, resource_id, id }) => `${kind}:${resource_id}:${id}`).sort(),
    ["container_image:gallery:service", "container_image:music:service", "github_pages:website:website"],
    "Qualification requires a sealed release with the gallery image, music image, and Pages artifact.",
  );
  for (const { resourceID, repository } of serviceImages) {
    assert.equal(artifacts.find(artifact => artifact.resource_id === resourceID)?.repository, repository);
  }
}
