package gallery

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
)

var identifierPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,99}$`)
var publicImagePattern = regexp.MustCompile(`^/gallery/images/(previews|full)/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$`)
var currencyPattern = regexp.MustCompile(`^[A-Z]{3}$`)

func validateCatalog(value catalog) error {
	text := func(values ...string) bool {
		for _, item := range values {
			if strings.TrimSpace(item) == "" {
				return false
			}
		}
		return true
	}
	positive := func(value int) bool { return value > 0 && value <= 1000000000 }
	known := map[string]bool{}
	offers := map[string]bool{}
	if !text(value.Brand, value.Description, value.Label, value.Title) {
		return errors.New("gallery identity is incomplete")
	}
	for _, work := range value.Artworks {
		if !identifierPattern.MatchString(work.ID) || known[work.ID] {
			return errors.New("artwork identifiers must be valid and unique")
		}
		known[work.ID] = true
		if !text(work.Title, work.Description, work.Alt, work.Medium, work.Year) {
			return fmt.Errorf("artwork %s needs all label fields", work.ID)
		}
		picture := work.Image
		if !publicImagePattern.MatchString(picture.CardURL) || !publicImagePattern.MatchString(picture.LightboxURL) || !positive(picture.Width) || !positive(picture.Height) || (picture.Format != "PNG" && picture.Format != "JPEG" && picture.Format != "WebP") {
			return fmt.Errorf("artwork %s has an invalid public image", work.ID)
		}
		if sale := work.Offer; sale != nil {
			if !identifierPattern.MatchString(sale.ID) || offers[sale.ID] || !identifierPattern.MatchString(sale.Revision) || !positive(sale.PriceCents) || !currencyPattern.MatchString(sale.Currency) || !text(sale.License, sale.DeliveryTerms, sale.File.Label, sale.File.Format) || !positive(sale.File.Width) || !positive(sale.File.Height) {
				return fmt.Errorf("artwork %s has an invalid sale offer", work.ID)
			}
			offers[sale.ID] = true
		}
	}
	validateReferences := func(ids []string, cover string, crop []float64) error {
		seen := map[string]bool{}
		for _, id := range ids {
			if !known[id] || seen[id] {
				return errors.New("artwork references must exist and be unique")
			}
			seen[id] = true
		}
		if !seen[cover] || len(crop) != 2 {
			return errors.New("the cover must belong to its presentation and specify a crop")
		}
		for _, position := range crop {
			if position < 0 || position > 100 {
				return errors.New("cover crop must be between 0 and 100")
			}
		}
		return nil
	}
	collections := map[string]bool{}
	for _, item := range value.Collections {
		if !identifierPattern.MatchString(item.ID) || collections[item.ID] || !text(item.Title) {
			return errors.New("collection identity is invalid")
		}
		collections[item.ID] = true
		if err := validateReferences(item.ArtworkIDs, item.CoverArtworkID, item.CoverPosition); err != nil {
			return fmt.Errorf("collection %s: %w", item.ID, err)
		}
	}
	exhibits := map[string]bool{}
	for _, item := range value.Exhibits {
		if !identifierPattern.MatchString(item.ID) || exhibits[item.ID] || !text(item.Title) {
			return errors.New("exhibit identity is invalid")
		}
		exhibits[item.ID] = true
		start, err := time.Parse(time.DateOnly, item.StartDate)
		if err != nil {
			return fmt.Errorf("exhibit %s start date: %w", item.ID, err)
		}
		end, err := time.Parse(time.DateOnly, item.EndDate)
		if err != nil || end.Before(start) {
			return fmt.Errorf("exhibit %s dates are invalid", item.ID)
		}
		sections := map[string]bool{}
		ordered := []string{}
		for _, part := range item.Sections {
			if !identifierPattern.MatchString(part.ID) || sections[part.ID] || !text(part.Title) {
				return errors.New("exhibit section identity is invalid")
			}
			sections[part.ID] = true
			ordered = append(ordered, part.ArtworkIDs...)
		}
		if err := validateReferences(ordered, item.CoverArtworkID, item.CoverPosition); err != nil {
			return fmt.Errorf("exhibit %s: %w", item.ID, err)
		}
	}
	return nil
}
