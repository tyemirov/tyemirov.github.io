# First tracked deployment

The deployment repair uses the normal application command:

```bash
make release && make publish && make deploy
```

The current release is `v2.0.5`. Preparation and publication are completed.
Gateway `v5.0.10` rejects the existing gallery and music containers because their publication labels are absent.
The website also has a schema 1 release marker.

The operator selected first deployment behavior on October 6, 2026.
An absent confirmed deployment record establishes the first tracked deployment.
The existing services remain existing targets.
Gateway verifies their ownership before normal convergence installs the selected published release.

Gallery keeps `tyemirov-site-gallery-data` at `/data`.
Music uses the files from its published image.
Container replacement can cause a short service interruption.
The website receives the current schema 2 release marker.

The normal operation journal records the selected version and initial container identities before provider changes.
Interrupted operations continue toward the same release.
Changed initial containers and changed release targets stop an unfinished first deployment.
Any known target version greater than the selected release stops provider changes.

Complete verification requires the selected version labels, website marker, and declared health responses.
Gateway then records the first confirmed deployment.
Subsequent deployments require the current version metadata.
This repair adds no special command, approval record, or deployment phase.

The Gateway source fix is completed under B625.
Full `make ci`, native Pages activation, and initial container recovery tests passed.
Real isolated Linux Docker qualification verified retained volume data, version metadata, confirmation, journal cleanup, and an unchanged container on equal retry.
Independent review found no remaining source issue.

Release and installation of the corrected Gateway come next.
The installed `v5.0.10` runtime still has the original error.
Production deployment follows installation through the normal command above.

B626 tracks a separate initial network alias defect for same-host endpoints.
This application's runtime endpoints use private LAN addresses.
The six existing Gateway governance differences remain unchanged.
The changed prose passed mechanical language checks and a source review.
