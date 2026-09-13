// Code generated from contracts/gallery.openapi.yaml. DO NOT EDIT.
package gallery

const (
	readinessPath          = "/gallery/readyz"
	schemaPath             = "/gallery/openapi.json"
	assetsPath             = "/gallery/assets"
	assetPath              = "/gallery/assets/{assetId}"
	representationPath     = "/gallery/assets/{assetId}/{representation}"
	draftPath              = "/gallery/draft"
	publicationsPath       = "/gallery/publications"
	publicationArchivePath = "/gallery/publications/{publicationId}/archive"
	ordersPath             = "/gallery/orders"
	orderPath              = "/gallery/orders/{orderId}"
	capturesPath           = "/gallery/orders/{orderId}/captures"
	paymentEventsPath      = "/gallery/payment-events"
	downloadLinksPath      = "/gallery/orders/{orderId}/download-links"
	downloadPath           = "/gallery/downloads/{downloadId}"
	accessReissuesPath     = "/gallery/orders/{orderId}/access-reissues"
	accessReissuePath      = "/gallery/orders/{orderId}/access-reissues/{reissueId}"
)
