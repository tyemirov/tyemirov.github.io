package gallery

import (
	_ "embed"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
)

//go:embed contract.openapi.json
var openAPIContract []byte

type accessPolicy int

const (
	ownerAccess accessPolicy = iota
	publicAccess
	buyerAccess
	webhookAccess
	downloadAccess
	ownerOrBuyerAccess
)

type endpoint struct {
	method, path, operation string
	handler                 http.HandlerFunc
	input, output           reflect.Type
	binary                  bool
	access                  accessPolicy
}

func shape(value any) reflect.Type { return reflect.TypeOf(value) }
func (service *Service) endpoints() []endpoint {
	return []endpoint{
		{"GET", readinessPath, "readReadiness", service.getReadiness, nil, shape(readiness{}), false, publicAccess},
		{"GET", schemaPath, "readOpenAPI", service.getSchema, nil, nil, false, publicAccess},
		{"GET", assetsPath, "listAssets", service.listAssets, nil, shape(assetPage{}), false, ownerAccess},
		{"POST", assetsPath, "createAsset", service.createAsset, nil, shape(asset{}), true, ownerAccess},
		{"GET", assetPath, "readAsset", service.getAsset, nil, shape(asset{}), false, ownerAccess},
		{"GET", representationPath, "readAssetRepresentation", service.getRepresentation, nil, nil, true, ownerAccess},
		{"GET", draftPath, "readDraft", service.getDraft, nil, shape(draft{}), false, ownerAccess},
		{"PUT", draftPath, "replaceDraft", service.putDraft, shape(draft{}), shape(draft{}), false, ownerAccess},
		{"POST", publicationsPath, "createPublication", service.createPublication, shape(publicationRequest{}), shape(publication{}), false, ownerAccess},
		{"GET", publicationArchivePath, "readPublicationArchive", service.getPublicationArchive, nil, nil, true, ownerAccess},
		{"POST", ordersPath, "createOrder", service.createOrder, shape(orderInput{}), shape(orderCreation{}), false, publicAccess},
		{"GET", ordersPath, "listOrders", service.listOrders, nil, shape(ownerOrderPage{}), false, ownerAccess},
		{"GET", orderPath, "readOrder", service.getOrder, nil, shape(orderView{}), false, ownerOrBuyerAccess},
		{"POST", accessReissuesPath, "createAccessReissue", service.createAccessReissue, shape(accessReissueInput{}), shape(accessReissueCreation{}), false, ownerAccess},
		{"GET", accessReissuePath, "readAccessReissue", service.getAccessReissue, nil, shape(accessReissue{}), false, ownerAccess},
		{"PATCH", orderPath, "updateOrder", service.updateOrder, shape(orderUpdate{}), shape(orderView{}), false, buyerAccess},
		{"POST", capturesPath, "createCapture", service.createCapture, shape(struct{}{}), shape(orderView{}), false, buyerAccess},
		{"POST", paymentEventsPath, "receivePaymentEvent", service.receivePaymentEvent, nil, nil, false, webhookAccess},
		{"POST", downloadLinksPath, "createDownloadLink", service.createDownloadLink, shape(downloadLinkInput{}), shape(downloadCreation{}), false, buyerAccess},
		{"GET", downloadPath, "readDownload", service.getDownload, nil, nil, true, downloadAccess},
	}
}
func (service *Service) accessFor(request *http.Request) accessPolicy {
	for _, entry := range service.endpoints() {
		if (entry.method == request.Method || (entry.method == "GET" && request.Method == "HEAD")) && matchesResource(entry.path, request.URL.Path) {
			return entry.access
		}
	}
	return ownerAccess
}
func matchesResource(template, path string) bool {
	parts, actual := strings.Split(template, "/"), strings.Split(path, "/")
	if len(parts) != len(actual) {
		return false
	}
	for index, part := range parts {
		if strings.HasPrefix(part, "{") {
			if actual[index] == "" {
				return false
			}
		} else if part != actual[index] {
			return false
		}
	}
	return true
}

func (service *Service) router() http.Handler {
	router := http.NewServeMux()
	endpoints := service.endpoints()
	for _, entry := range endpoints {
		router.HandleFunc(entry.method+" "+entry.path, entry.handler)
	}
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		_, pattern := router.Handler(request)
		if pattern == "" {
			allowed := service.allowedMethods(request.URL.Path)
			if len(allowed) == 0 {
				problem(writer, http.StatusNotFound, codeNotFound, "This resource does not exist.")
			} else {
				writer.Header().Set("Allow", strings.Join(allowed, ", "))
				problem(writer, http.StatusMethodNotAllowed, "method_not_allowed", "This method is not available for the resource.")
			}
			return
		}
		// ServeMux sets path values for the selected handler.
		router.ServeHTTP(writer, request)
	})
}
func (service *Service) allowedMethods(path string) []string {
	methods := map[string]bool{}
	actual := strings.Split(path, "/")
	for _, entry := range service.endpoints() {
		parts := strings.Split(entry.path, "/")
		if len(parts) != len(actual) {
			continue
		}
		matches := true
		for index, part := range parts {
			if strings.HasPrefix(part, "{") {
				if actual[index] == "" {
					matches = false
				}
			} else if part != actual[index] {
				matches = false
			}
		}
		if matches {
			methods[entry.method] = true
			if entry.method == "GET" {
				methods["HEAD"] = true
			}
			methods["OPTIONS"] = true
		}
	}
	result := make([]string, 0, len(methods))
	for method := range methods {
		result = append(result, method)
	}
	sort.Strings(result)
	return result
}
func (service *Service) getReadiness(writer http.ResponseWriter, request *http.Request) {
	if err := service.database.PingContext(request.Context()); err != nil {
		service.storageError(writer, request, "check readiness", err)
		return
	}
	value, err := service.publicCatalogDigest()
	if err != nil {
		service.storageError(writer, request, "read selected catalog", err)
		return
	}
	writer.Header().Set("X-Catalog-Digest", value)
	respond(writer, http.StatusOK, readiness{Status: "ready"})
}

func (service *Service) publicCatalogDigest() (string, error) {
	payload, err := os.ReadFile(filepath.Join(service.config.PublicRoot, "data", "site.json"))
	if err != nil {
		return "", fmt.Errorf("read selected catalog: %w", err)
	}
	return digest(payload), nil
}
func (service *Service) getSchema(writer http.ResponseWriter, request *http.Request) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write(openAPIContract)
}
