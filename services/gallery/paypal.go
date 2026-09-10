package gallery

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	paypalAlgorithmHeader    = "Paypal-Auth-Algo"
	paypalCertificateHeader  = "Paypal-Cert-Url"
	paypalTransmissionHeader = "Paypal-Transmission-Id"
	paypalSignatureHeader    = "Paypal-Transmission-Sig"
	paypalTimeHeader         = "Paypal-Transmission-Time"
)

var paypalVerificationHeaders = []string{paypalAlgorithmHeader, paypalCertificateHeader, paypalTransmissionHeader, paypalSignatureHeader, paypalTimeHeader}

var errUnverifiedPaymentEvent = errors.New("the provider did not verify the payment event")

const paypalTokenPath = "/v1/oauth2/token"
const paypalOrdersPath = "/v2/checkout/orders"
const paypalVerifyPath = "/v1/notifications/verify-webhook-signature"

var paypalIDPattern = regexp.MustCompile(`^[A-Z0-9]{1,36}$`)

var paypalCurrencies = map[string]int{
	"AUD": 2, "BRL": 2, "CAD": 2, "CNY": 2, "CZK": 2, "DKK": 2, "EUR": 2, "HKD": 2, "HUF": 0, "ILS": 2, "JPY": 0, "MYR": 2, "MXN": 2, "TWD": 0, "NZD": 2, "NOK": 2, "PHP": 2, "PLN": 2, "GBP": 2, "RUB": 2, "SGD": 2, "SEK": 2, "CHF": 2, "THB": 2, "USD": 2,
}

func formatPayPalAmount(currency string, cents int) string {
	if paypalCurrencies[currency] == 0 {
		return fmt.Sprintf("%d", cents/100)
	}
	return fmt.Sprintf("%d.%02d", cents/100, cents%100)
}

// PayPalConfig supplies the server payment account and HTTP transport.
type PayPalConfig struct {
	BaseURL        string
	CheckoutOrigin string
	ClientID       string
	ClientSecret   string
	MerchantID     string
	WebhookID      string
	HTTPClient     *http.Client
}
type paypalClient struct {
	config      PayPalConfig
	transport   *http.Client
	mutex       sync.Mutex
	token       string
	tokenExpiry time.Time
}
type paypalAmount struct {
	Currency string `json:"currency_code"`
	Value    string `json:"value"`
}
type paypalPayee struct {
	MerchantID string `json:"merchant_id"`
}
type paypalCapture struct {
	ID     string       `json:"id"`
	Status string       `json:"status"`
	Amount paypalAmount `json:"amount"`
}
type paypalCaptureDetails struct {
	paypalCapture
	CustomID      string      `json:"custom_id"`
	Payee         paypalPayee `json:"payee"`
	Supplementary struct {
		RelatedIDs struct {
			OrderID string `json:"order_id"`
		} `json:"related_ids"`
	} `json:"supplementary_data"`
}
type paypalUnit struct {
	CustomID string       `json:"custom_id"`
	Amount   paypalAmount `json:"amount"`
	Payee    paypalPayee  `json:"payee"`
	Payments struct {
		Captures []paypalCapture `json:"captures"`
	} `json:"payments"`
}
type paypalOrder struct {
	ID            string       `json:"id"`
	Status        string       `json:"status"`
	PurchaseUnits []paypalUnit `json:"purchase_units"`
	Links         []struct {
		Relation string `json:"rel"`
		URL      string `json:"href"`
		Method   string `json:"method"`
	} `json:"links"`
}

func newPayPal(config PayPalConfig) (*paypalClient, error) {
	for _, value := range []string{config.BaseURL, config.CheckoutOrigin} {
		parsed, err := url.Parse(value)
		if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
			return nil, errors.New("configure PayPal: use explicit HTTPS origins")
		}
	}
	if config.ClientID == "" || config.ClientSecret == "" || !paypalIDPattern.MatchString(config.MerchantID) || config.WebhookID == "" {
		return nil, errors.New("configure PayPal: client credentials, merchant ID, and webhook ID are required")
	}
	transport := http.Client{Timeout: 20 * time.Second}
	if config.HTTPClient != nil {
		transport = *config.HTTPClient
		if transport.Timeout == 0 {
			transport.Timeout = 20 * time.Second
		}
	}
	transport.CheckRedirect = func(request *http.Request, via []*http.Request) error {
		return errors.New("PayPal API redirects are not permitted")
	}
	return &paypalClient{config: config, transport: &transport}, nil
}
func (client *paypalClient) accessToken(ctx context.Context) (string, error) {
	client.mutex.Lock()
	defer client.mutex.Unlock()
	if client.token != "" && time.Now().Before(client.tokenExpiry) {
		return client.token, nil
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, client.config.BaseURL+paypalTokenPath, strings.NewReader("grant_type=client_credentials"))
	if err != nil {
		return "", fmt.Errorf("construct PayPal token request: %w", err)
	}
	request.SetBasicAuth(client.config.ClientID, client.config.ClientSecret)
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := client.transport.Do(request)
	if err != nil {
		return "", fmt.Errorf("request PayPal access token: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("request PayPal access token: HTTP %d", response.StatusCode)
	}
	var token struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		ExpiresIn   int64  `json:"expires_in"`
	}
	if err := decodeProvider(response.Body, &token); err != nil {
		return "", fmt.Errorf("decode PayPal token: %w", err)
	}
	if token.AccessToken == "" || token.TokenType != "Bearer" || token.ExpiresIn <= 30 || token.ExpiresIn > 86400 {
		return "", errors.New("validate PayPal token response: invalid token metadata")
	}
	client.token = token.AccessToken
	client.tokenExpiry = time.Now().Add(time.Duration(token.ExpiresIn-30) * time.Second)
	return client.token, nil
}
func decodeProvider(reader io.Reader, target any) error {
	data, err := io.ReadAll(io.LimitReader(reader, 2<<20+1))
	if err != nil {
		return err
	}
	if len(data) > 2<<20 {
		return errors.New("provider response is too large")
	}
	return json.Unmarshal(data, target)
}
func (client *paypalClient) call(ctx context.Context, method, path, key string, input, target any) error {
	token, err := client.accessToken(ctx)
	if err != nil {
		return err
	}
	var data []byte
	if input != nil {
		data, err = json.Marshal(input)
		if err != nil {
			return fmt.Errorf("encode PayPal request: %w", err)
		}
	}
	request, err := http.NewRequestWithContext(ctx, method, client.config.BaseURL+path, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("construct PayPal request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Prefer", "return=representation")
	if key != "" {
		request.Header.Set("PayPal-Request-Id", key)
	}
	response, err := client.transport.Do(request)
	if err != nil {
		return fmt.Errorf("send PayPal %s request: %w", method, err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK && response.StatusCode != http.StatusCreated {
		return fmt.Errorf("PayPal %s request: HTTP %d", method, response.StatusCode)
	}
	if err := decodeProvider(response.Body, target); err != nil {
		return fmt.Errorf("decode PayPal response: %w", err)
	}
	return nil
}
func (client *paypalClient) create(ctx context.Context, record orderRecord, origin string) (string, string, error) {
	type experience struct {
		Shipping  string `json:"shipping_preference"`
		Action    string `json:"user_action"`
		ReturnURL string `json:"return_url"`
		CancelURL string `json:"cancel_url"`
	}
	type wallet struct {
		Experience experience `json:"experience_context"`
	}
	type source struct {
		PayPal wallet `json:"paypal"`
	}
	type purchase struct {
		CustomID string       `json:"custom_id"`
		Amount   paypalAmount `json:"amount"`
		Payee    paypalPayee  `json:"payee"`
	}
	payload := struct {
		Intent        string     `json:"intent"`
		PaymentSource source     `json:"payment_source"`
		Units         []purchase `json:"purchase_units"`
	}{Intent: "CAPTURE", PaymentSource: source{PayPal: wallet{Experience: experience{Shipping: "NO_SHIPPING", Action: "PAY_NOW", ReturnURL: origin + "/gallery/order/?order=" + record.ID, CancelURL: origin + "/gallery/order/?order=" + record.ID + "&cancelled=1"}}}, Units: []purchase{{CustomID: record.ID, Amount: paypalAmount{Currency: record.Snapshot.Currency, Value: formatPayPalAmount(record.Snapshot.Currency, record.Snapshot.TotalCents)}, Payee: paypalPayee{MerchantID: client.config.MerchantID}}}}
	var result paypalOrder
	if err := client.call(ctx, http.MethodPost, paypalOrdersPath, record.ID, payload, &result); err != nil {
		return "", "", err
	}
	if !paypalIDPattern.MatchString(result.ID) || result.Status != "PAYER_ACTION_REQUIRED" {
		return "", "", errors.New("validate PayPal creation: expected a payer action order")
	}
	approval := ""
	for _, link := range result.Links {
		if link.Relation == "payer-action" && link.Method == "GET" {
			if approval != "" {
				return "", "", errors.New("validate PayPal creation: duplicate payer action")
			}
			approval = link.URL
		}
	}
	parsed, err := url.Parse(approval)
	if err != nil || parsed.Scheme+"://"+parsed.Host != client.config.CheckoutOrigin || parsed.User != nil || parsed.Fragment != "" || parsed.Path != "/checkoutnow" || parsed.Query().Get("token") != result.ID {
		return "", "", errors.New("validate PayPal creation: invalid payer action link")
	}
	return result.ID, approval, nil
}

func (client *paypalClient) read(ctx context.Context, id string) (paypalOrder, error) {
	var result paypalOrder
	if !paypalIDPattern.MatchString(id) {
		return result, errors.New("validate provider order identifier")
	}
	if err := client.call(ctx, http.MethodGet, paypalOrdersPath+"/"+id, "", nil, &result); err != nil {
		return result, err
	}
	if result.ID != id {
		return result, errors.New("provider returned another order identifier")
	}
	return result, nil
}

var providerAmountPattern = regexp.MustCompile(`^[0-9]+(?:\.[0-9]{1,2})?$`)

func matchesPayPalAmount(amount paypalAmount, currency string, cents int) bool {
	actual, valid := payPalAmountCents(amount)
	return valid && amount.Currency == currency && actual == cents
}

func payPalAmountCents(amount paypalAmount) (int, bool) {
	if !providerAmountPattern.MatchString(amount.Value) {
		return 0, false
	}
	parts := strings.Split(amount.Value, ".")
	scale, known := paypalCurrencies[amount.Currency]
	if !known || (scale == 0 && len(parts) != 1) {
		return 0, false
	}
	major, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || major > 10000000 {
		return 0, false
	}
	fraction := int64(0)
	if len(parts) == 2 {
		digits := parts[1]
		if len(digits) == 1 {
			digits += "0"
		}
		fraction, err = strconv.ParseInt(digits, 10, 64)
		if err != nil {
			return 0, false
		}
	}
	return int(major*100 + fraction), true
}

func (client *paypalClient) matchPurchase(result paypalOrder, record orderRecord) error {
	if result.ID != record.ProviderID || len(result.PurchaseUnits) != 1 {
		return errors.New("The provider order does not identify this purchase.")
	}
	unit := result.PurchaseUnits[0]
	if unit.CustomID != record.ID || unit.Payee.MerchantID != client.config.MerchantID || !matchesPayPalAmount(unit.Amount, record.Snapshot.Currency, record.Snapshot.TotalCents) {
		return errors.New("The provider order, payee, amount, or currency differs from this purchase.")
	}
	for _, capture := range unit.Payments.Captures {
		if !paypalIDPattern.MatchString(capture.ID) || !matchesPayPalAmount(capture.Amount, record.Snapshot.Currency, record.Snapshot.TotalCents) {
			return errors.New("The provider capture differs from this purchase.")
		}
	}
	return nil
}
func (client *paypalClient) capture(ctx context.Context, record orderRecord, key string) (string, error) {
	result, err := client.read(ctx, record.ProviderID)
	if err != nil {
		return "", err
	}
	if err := client.matchPurchase(result, record); err != nil {
		return "", err
	}
	if result.Status == "APPROVED" {
		if len(result.PurchaseUnits[0].Payments.Captures) != 0 {
			return "", errors.New("An approved provider order already contains captures.")
		}
		if err := client.call(ctx, http.MethodPost, paypalOrdersPath+"/"+record.ProviderID+"/capture", key, struct{}{}, &result); err != nil {
			return "", err
		}
		if err := client.matchPurchase(result, record); err != nil {
			return "", err
		}
	}
	if result.Status != "COMPLETED" || len(result.PurchaseUnits[0].Payments.Captures) != 1 {
		return "", errors.New("The provider capture is not confirmed.")
	}
	capture := result.PurchaseUnits[0].Payments.Captures[0]
	if capture.Status != "COMPLETED" && capture.Status != "PENDING" {
		return "", errors.New("The provider capture has no accepted payment state.")
	}
	return capture.ID, nil
}
func (client *paypalClient) verify(ctx context.Context, headers http.Header, event json.RawMessage) error {
	payload := struct {
		Algorithm        string          `json:"auth_algo"`
		CertificateURL   string          `json:"cert_url"`
		TransmissionID   string          `json:"transmission_id"`
		Signature        string          `json:"transmission_sig"`
		TransmissionTime string          `json:"transmission_time"`
		WebhookID        string          `json:"webhook_id"`
		Event            json.RawMessage `json:"webhook_event"`
	}{headers.Get(paypalAlgorithmHeader), headers.Get(paypalCertificateHeader), headers.Get(paypalTransmissionHeader), headers.Get(paypalSignatureHeader), headers.Get(paypalTimeHeader), client.config.WebhookID, event}
	if payload.Algorithm == "" || payload.CertificateURL == "" || payload.TransmissionID == "" || payload.Signature == "" || payload.TransmissionTime == "" {
		return fmt.Errorf("%w: verification headers are missing", errUnverifiedPaymentEvent)
	}
	var result struct {
		Status string `json:"verification_status"`
	}
	if err := client.call(ctx, http.MethodPost, paypalVerifyPath, "", payload, &result); err != nil {
		return err
	}
	if result.Status != "SUCCESS" {
		return errUnverifiedPaymentEvent
	}
	return nil
}
