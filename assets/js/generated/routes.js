// @ts-check
// Generated from contracts/*.openapi.yaml. Do not edit.
export const routes = Object.freeze({
  "gallery": {
    "readReadiness": {
      "method": "GET",
      "path": "/gallery/readyz"
    },
    "headReadReadiness": {
      "method": "HEAD",
      "path": "/gallery/readyz"
    },
    "optionsGalleryReadyz": {
      "method": "OPTIONS",
      "path": "/gallery/readyz"
    },
    "readOpenAPI": {
      "method": "GET",
      "path": "/gallery/openapi.json"
    },
    "headReadOpenAPI": {
      "method": "HEAD",
      "path": "/gallery/openapi.json"
    },
    "optionsGalleryOpenapi.Json": {
      "method": "OPTIONS",
      "path": "/gallery/openapi.json"
    },
    "listAssets": {
      "method": "GET",
      "path": "/gallery/assets"
    },
    "createAsset": {
      "method": "POST",
      "path": "/gallery/assets"
    },
    "headListAssets": {
      "method": "HEAD",
      "path": "/gallery/assets"
    },
    "optionsGalleryAssets": {
      "method": "OPTIONS",
      "path": "/gallery/assets"
    },
    "readAsset": {
      "method": "GET",
      "path": "/gallery/assets/{assetId}"
    },
    "headReadAsset": {
      "method": "HEAD",
      "path": "/gallery/assets/{assetId}"
    },
    "optionsGalleryAssetsAssetid": {
      "method": "OPTIONS",
      "path": "/gallery/assets/{assetId}"
    },
    "readAssetRepresentation": {
      "method": "GET",
      "path": "/gallery/assets/{assetId}/{representation}"
    },
    "headReadAssetRepresentation": {
      "method": "HEAD",
      "path": "/gallery/assets/{assetId}/{representation}"
    },
    "optionsGalleryAssetsAssetidRepresentation": {
      "method": "OPTIONS",
      "path": "/gallery/assets/{assetId}/{representation}"
    },
    "readDraft": {
      "method": "GET",
      "path": "/gallery/draft"
    },
    "replaceDraft": {
      "method": "PUT",
      "path": "/gallery/draft"
    },
    "headReadDraft": {
      "method": "HEAD",
      "path": "/gallery/draft"
    },
    "optionsGalleryDraft": {
      "method": "OPTIONS",
      "path": "/gallery/draft"
    },
    "createPublication": {
      "method": "POST",
      "path": "/gallery/publications"
    },
    "optionsGalleryPublications": {
      "method": "OPTIONS",
      "path": "/gallery/publications"
    },
    "readPublicationArchive": {
      "method": "GET",
      "path": "/gallery/publications/{publicationId}/archive"
    },
    "headReadPublicationArchive": {
      "method": "HEAD",
      "path": "/gallery/publications/{publicationId}/archive"
    },
    "optionsGalleryPublicationsPublicationidArchive": {
      "method": "OPTIONS",
      "path": "/gallery/publications/{publicationId}/archive"
    },
    "createOrder": {
      "method": "POST",
      "path": "/gallery/orders"
    },
    "listOrders": {
      "method": "GET",
      "path": "/gallery/orders"
    },
    "headListOrders": {
      "method": "HEAD",
      "path": "/gallery/orders"
    },
    "optionsGalleryOrders": {
      "method": "OPTIONS",
      "path": "/gallery/orders"
    },
    "readOrder": {
      "method": "GET",
      "path": "/gallery/orders/{orderId}"
    },
    "updateOrder": {
      "method": "PATCH",
      "path": "/gallery/orders/{orderId}"
    },
    "headReadOrder": {
      "method": "HEAD",
      "path": "/gallery/orders/{orderId}"
    },
    "optionsGalleryOrdersOrderid": {
      "method": "OPTIONS",
      "path": "/gallery/orders/{orderId}"
    },
    "createCapture": {
      "method": "POST",
      "path": "/gallery/orders/{orderId}/captures"
    },
    "optionsGalleryOrdersOrderidCaptures": {
      "method": "OPTIONS",
      "path": "/gallery/orders/{orderId}/captures"
    },
    "createDownloadLink": {
      "method": "POST",
      "path": "/gallery/orders/{orderId}/download-links"
    },
    "optionsGalleryOrdersOrderidDownload-Links": {
      "method": "OPTIONS",
      "path": "/gallery/orders/{orderId}/download-links"
    },
    "createAccessReissue": {
      "method": "POST",
      "path": "/gallery/orders/{orderId}/access-reissues"
    },
    "optionsGalleryOrdersOrderidAccess-Reissues": {
      "method": "OPTIONS",
      "path": "/gallery/orders/{orderId}/access-reissues"
    },
    "readAccessReissue": {
      "method": "GET",
      "path": "/gallery/orders/{orderId}/access-reissues/{reissueId}"
    },
    "headReadAccessReissue": {
      "method": "HEAD",
      "path": "/gallery/orders/{orderId}/access-reissues/{reissueId}"
    },
    "optionsGalleryOrdersOrderidAccess-ReissuesReissueid": {
      "method": "OPTIONS",
      "path": "/gallery/orders/{orderId}/access-reissues/{reissueId}"
    },
    "readDownload": {
      "method": "GET",
      "path": "/gallery/downloads/{downloadId}"
    },
    "headReadDownload": {
      "method": "HEAD",
      "path": "/gallery/downloads/{downloadId}"
    },
    "optionsGalleryDownloadsDownloadid": {
      "method": "OPTIONS",
      "path": "/gallery/downloads/{downloadId}"
    },
    "receivePaymentEvent": {
      "method": "POST",
      "path": "/gallery/payment-events"
    },
    "optionsGalleryPayment-Events": {
      "method": "OPTIONS",
      "path": "/gallery/payment-events"
    }
  },
  "music": {
    "readHealth": {
      "method": "GET",
      "path": "/music/healthz"
    },
    "headReadHealth": {
      "method": "HEAD",
      "path": "/music/healthz"
    },
    "optionsMusicHealthz": {
      "method": "OPTIONS",
      "path": "/music/healthz"
    },
    "readReadiness": {
      "method": "GET",
      "path": "/music/readyz"
    },
    "headReadReadiness": {
      "method": "HEAD",
      "path": "/music/readyz"
    },
    "optionsMusicReadyz": {
      "method": "OPTIONS",
      "path": "/music/readyz"
    },
    "readOpenAPI": {
      "method": "GET",
      "path": "/music/openapi.json"
    },
    "headReadOpenAPI": {
      "method": "HEAD",
      "path": "/music/openapi.json"
    },
    "optionsMusicOpenapi.Json": {
      "method": "OPTIONS",
      "path": "/music/openapi.json"
    },
    "createGrant": {
      "method": "POST",
      "path": "/music/playback-grants"
    },
    "optionsMusicPlayback-Grants": {
      "method": "OPTIONS",
      "path": "/music/playback-grants"
    },
    "readGrant": {
      "method": "GET",
      "path": "/music/playback-grants/{grantId}"
    },
    "deleteGrant": {
      "method": "DELETE",
      "path": "/music/playback-grants/{grantId}"
    },
    "headReadGrant": {
      "method": "HEAD",
      "path": "/music/playback-grants/{grantId}"
    },
    "optionsMusicPlayback-GrantsGrantid": {
      "method": "OPTIONS",
      "path": "/music/playback-grants/{grantId}"
    },
    "replaceExpiration": {
      "method": "PUT",
      "path": "/music/playback-grants/{grantId}/expiration"
    },
    "optionsMusicPlayback-GrantsGrantidExpiration": {
      "method": "OPTIONS",
      "path": "/music/playback-grants/{grantId}/expiration"
    },
    "readMedia": {
      "method": "GET",
      "path": "/music/hls/{grantId}/{assetId}/{file}"
    },
    "headReadMedia": {
      "method": "HEAD",
      "path": "/music/hls/{grantId}/{assetId}/{file}"
    },
    "optionsMusicHlsGrantidAssetidFile": {
      "method": "OPTIONS",
      "path": "/music/hls/{grantId}/{assetId}/{file}"
    }
  }
});
