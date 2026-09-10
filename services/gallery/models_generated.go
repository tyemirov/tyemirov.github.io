// Code generated from contracts/gallery.schema.json. DO NOT EDIT.
package gallery

type catalog struct {
	Label       string       `json:"label"`
	Title       string       `json:"title"`
	Brand       string       `json:"brand"`
	Description string       `json:"description"`
	Artworks    []artwork    `json:"artworks"`
	Collections []collection `json:"collections"`
	Exhibits    []exhibit    `json:"exhibits"`
}

type publicImage struct {
	CardURL     string `json:"cardUrl"`
	LightboxURL string `json:"lightboxUrl"`
	Width       int    `json:"width"`
	Height      int    `json:"height"`
	Format      string `json:"format"`
}

type artwork struct {
	ID          string      `json:"id"`
	Title       string      `json:"title"`
	Description string      `json:"description"`
	Alt         string      `json:"alt"`
	Medium      string      `json:"medium"`
	Year        string      `json:"year"`
	Image       publicImage `json:"image"`
	Offer       *offer      `json:"offer"`
}

type offer struct {
	ID            string      `json:"id"`
	PriceCents    int         `json:"priceCents"`
	Currency      string      `json:"currency"`
	License       string      `json:"license"`
	Revision      string      `json:"revision"`
	File          offeredFile `json:"file"`
	DeliveryTerms string      `json:"deliveryTerms"`
}

type offeredFile struct {
	Label  string `json:"label"`
	Format string `json:"format"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

type collection struct {
	ID             string    `json:"id"`
	Title          string    `json:"title"`
	Introduction   string    `json:"introduction"`
	CoverArtworkID string    `json:"coverArtworkId"`
	CoverPosition  []float64 `json:"coverPosition"`
	ArtworkIDs     []string  `json:"artworkIds"`
}

type exhibit struct {
	ID             string    `json:"id"`
	Title          string    `json:"title"`
	Subtitle       string    `json:"subtitle"`
	Introduction   string    `json:"introduction"`
	StartDate      string    `json:"startDate"`
	EndDate        string    `json:"endDate"`
	CoverArtworkID string    `json:"coverArtworkId"`
	CoverPosition  []float64 `json:"coverPosition"`
	Sections       []section `json:"sections"`
}

type section struct {
	ID         string   `json:"id"`
	Title      string   `json:"title"`
	ArtworkIDs []string `json:"artworkIds"`
}

type draft struct {
	Gallery catalog           `json:"gallery"`
	Masters map[string]string `json:"masters"`
}

type asset struct {
	ID        string `json:"id"`
	Checksum  string `json:"checksum"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	Format    string `json:"format"`
	CreatedAt string `json:"createdAt"`
}

type apiError struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"requestId"`
}

type assetPage struct {
	Items      []asset `json:"items"`
	NextCursor *string `json:"nextCursor"`
}

type readiness struct {
	Status string `json:"status"`
}

type orderInput struct {
	OfferIDs      []string `json:"offerIds"`
	Email         string   `json:"email"`
	CatalogDigest string   `json:"catalogDigest"`
}

type orderItem struct {
	ArtworkID string `json:"artworkId"`
	Title     string `json:"title"`
	Offer     offer  `json:"offer"`
}

type orderView struct {
	ID           string        `json:"id"`
	Status       orderStatus   `json:"status"`
	Email        string        `json:"email"`
	Items        []orderItem   `json:"items"`
	TotalCents   int           `json:"totalCents"`
	Currency     string        `json:"currency"`
	ApprovalURL  *string       `json:"approvalUrl"`
	Entitlements []entitlement `json:"entitlements"`
	Receipt      *receiptView  `json:"receipt"`
}

type orderCreation struct {
	Order        orderView `json:"order"`
	AccessSecret string    `json:"accessSecret"`
}

type entitlement struct {
	OfferID  string `json:"offerId"`
	Revision string `json:"revision"`
	Status   string `json:"status"`
}

type downloadLinkInput struct {
	OfferID string `json:"offerId"`
}

type download struct {
	ID        string `json:"id"`
	OfferID   string `json:"offerId"`
	Revision  string `json:"revision"`
	ExpiresAt string `json:"expiresAt"`
	Href      string `json:"href"`
}

type downloadCreation struct {
	Download     download `json:"download"`
	AccessSecret string   `json:"accessSecret"`
}

type accessReissueInput struct {
	VerifiedEmail string `json:"verifiedEmail"`
}

type accessReissue struct {
	ID            string `json:"id"`
	OrderID       string `json:"orderId"`
	VerifiedEmail string `json:"verifiedEmail"`
	OwnerEmail    string `json:"ownerEmail"`
	CreatedAt     string `json:"createdAt"`
}

type accessReissueCreation struct {
	Reissue      accessReissue `json:"reissue"`
	AccessSecret string        `json:"accessSecret"`
	OrderURL     string        `json:"orderUrl"`
}

type ownerOrderSummary struct {
	ID         string       `json:"id"`
	CreatedAt  string       `json:"createdAt"`
	Status     orderStatus  `json:"status"`
	Email      string       `json:"email"`
	TotalCents int          `json:"totalCents"`
	Currency   string       `json:"currency"`
	Receipt    *receiptView `json:"receipt"`
}

type ownerOrderPage struct {
	Items      []ownerOrderSummary `json:"items"`
	NextCursor *string             `json:"nextCursor"`
}

type orderUpdate struct {
	Status orderStatus `json:"status"`
}

type receiptView struct {
	Status receiptStatus `json:"status"`
}

type publicationRequest struct {
	DraftETag         string `json:"draftEtag"`
	BaseCatalogDigest string `json:"baseCatalogDigest"`
}

type publication struct {
	ID                string `json:"id"`
	DraftETag         string `json:"draftEtag"`
	BaseCatalogDigest string `json:"baseCatalogDigest"`
	ArchiveURL        string `json:"archiveUrl"`
}

type orderSnapshot struct {
	Email      string      `json:"email"`
	Items      []orderItem `json:"items"`
	TotalCents int         `json:"totalCents"`
	Currency   string      `json:"currency"`
}

type emptyInput struct {
}
