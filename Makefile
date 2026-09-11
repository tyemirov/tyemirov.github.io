.DEFAULT_GOAL := ci
PAGES_DIST_DIR ?= $(CURDIR)/.pages-dist
ANSIBLE_PLAYBOOK ?= $(abspath ../mprlab-gateway/.venv/bin/ansible-playbook)
ANSIBLE_INVENTORY_BIN ?= $(abspath ../mprlab-gateway/.venv/bin/ansible-inventory)
UP_PORT ?= 8080
API_PORT ?= 8082
PAYMENT_PORT ?= 8446
LOCAL_PROJECT ?= tyemirov-site-local
MUSIC_LOCAL_ROOT ?= $(HOME)/.local/share/tyemirov-site/music
GHTTP ?= ghttp
LOCAL_CERT_ROOT ?= $(HOME)/.local/share/tyemirov-site/certs
LOCAL_ENV = UP_PORT="$(UP_PORT)" API_PORT="$(API_PORT)" PAYMENT_PORT="$(PAYMENT_PORT)" MUSIC_LOCAL_ROOT="$(MUSIC_LOCAL_ROOT)" LOCAL_PROJECT="$(LOCAL_PROJECT)" GHTTP="$(GHTTP)" LOCAL_CERT_ROOT="$(LOCAL_CERT_ROOT)"

.PHONY: up down local-test local-prepare-test local-recordings-test local-receipts
up down:
	@$(LOCAL_ENV) node local/stack.mjs $@

local-receipts:
	@$(LOCAL_ENV) node local/stack.mjs receipts

local-test:
	@GHTTP="$(GHTTP)" LOCAL_CERT_ROOT="$(LOCAL_CERT_ROOT)" node --test $(LOCAL_TEST_ARGS) tests/music/local-config.test.mjs tests/music/local.test.mjs

local-recordings-test:
	@$(LOCAL_ENV) node --test tests/music/local-recordings.test.mjs

local-prepare-test:
	@node --test tests/music/local-prepare.test.mjs

.PHONY: lifecycle-contract-test
lifecycle-contract-test:
	@ANSIBLE_PLAYBOOK="$(ANSIBLE_PLAYBOOK)" ANSIBLE_INVENTORY_BIN="$(ANSIBLE_INVENTORY_BIN)" node --test tests/music/lifecycle.test.mjs

.PHONY: ci pages-build loopaware-site-id-test release publish deploy

.PHONY: music-package-test music-api-test music-browser-test music-check music-artifact-test music-container-test music-ci-container

music-package-test:
	@node --test tests/music/package.test.mjs tests/music/activation.test.mjs

.PHONY: music-load-test music-load music-load-container
music-load-test:
	@node --test tests/music/load.test.mjs

music-load:
	@node tests/music/load.mjs $(MUSIC_LOAD_ARGS)

music-load-container:
	@docker build -q -t music-ci:local -f tests/music/Dockerfile.ci .
	@mkdir -p output/playwright/load
	@docker run --rm --init --network none --mount "type=bind,src=$(CURDIR)/output/playwright/load,dst=/workspace/output/playwright" music-ci:local make music-load MUSIC_LOAD_ARGS="$(MUSIC_LOAD_ARGS)"

.PHONY: music-host-test
music-host-test:
	@ANSIBLE_PLAYBOOK="$(ANSIBLE_PLAYBOOK)" node --test tests/music/host.test.mjs

.PHONY: music-release-test
music-release-test:
	@node --test tests/music/release.test.mjs

.PHONY: music-publication-test
music-publication-test:
	@node --test tests/music/publication.test.mjs

.PHONY: music-deployment-test
music-deployment-test:
	@MUSIC_QUALIFICATION_PHASE=deployment node --test tests/music/publication.test.mjs

music-artifact-test:
	@node --test tests/music/artifact.test.mjs

music-ci-container:
	@docker build -q -t music-ci:local -f tests/music/Dockerfile.ci .
	@mkdir -p output/playwright/linux
	@git -C ../mprlab-gateway bundle create "$(CURDIR)/output/playwright/gateway.bundle" HEAD
	@docker run --rm --init --shm-size=1g --mount "type=bind,src=$(CURDIR)/output/playwright/gateway.bundle,dst=/gateway.bundle,readonly" --mount "type=bind,src=$(CURDIR)/output/playwright/linux,dst=/workspace/output/playwright" music-ci:local

music-container-test:
	@node --test $(MUSIC_CONTAINER_ARGS) tests/music/container.test.mjs

music-api-test:
	@cd services/music-stream && go test -race ./...

.PHONY: gallery-check gallery-contract-test gallery-api-test gallery-browser-test gallery-container-test
gallery-container-test:
	@node --test tests/gallery/container.test.mjs

gallery-check:
	@cd services/gallery && go vet ./...
	@cd services/gallery && go vet ../../tests/gallery/server/main.go
	@cd services/gallery && go vet ../../tests/gallery/mail-seed/main.go

gallery-contract-test:
	@node --test tests/gallery/api.test.mjs

gallery-api-test:
	@cd services/gallery && go test -race $(GALLERY_API_ARGS) ./...

gallery-browser-test:
	@npm run test:music -- gallery/ $(GALLERY_BROWSER_ARGS)

music-browser-test:
	@npm run test:music -- $(MUSIC_BROWSER_ARGS)

music-check:
	@cd services/music-stream && go vet ./...

ci: site-contract-test pages-build lifecycle-contract-test loopaware-site-id-test music-package-test music-api-test music-check music-artifact-test local-prepare-test music-load-test music-browser-test gallery-api-test gallery-contract-test gallery-check

pages-build:
	@PAGES_DIST_DIR="$(PAGES_DIST_DIR)" ./scripts/build-pages-artifact.sh

loopaware-site-id-test:
	@./tests/loopaware_site_id_test.sh

release publish deploy:
	@application_root="$$(git rev-parse --show-toplevel)"; gateway_root="$$(dirname "$${application_root}")/mprlab-gateway"; $(MAKE) --no-print-directory -C "$${gateway_root}" "app-$@" MPRLAB_APP_ROOT="$${application_root}"

.PHONY: site-contract-test contracts-generate
site-contract-test:
	@node --test tests/site/*.test.mjs

contracts-generate:
	@node scripts/contracts/generate.mjs
