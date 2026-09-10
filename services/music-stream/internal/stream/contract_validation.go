package stream

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"
	"reflect"
	"sync"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

//go:embed contract.schemas.json
var domainContract []byte

var compileSchemas sync.Once
var compiledSchemas map[string]*jsonschema.Schema
var schemaError error

func prepareSchemas() {
	var document any
	if err := json.Unmarshal(domainContract, &document); err != nil {
		schemaError = err
		return
	}
	compiler := jsonschema.NewCompiler()
	compiler.AssertFormat()
	const location = "https://tyemirov.net/contracts/music.schema.json"
	if err := compiler.AddResource(location, document); err != nil {
		schemaError = err
		return
	}
	compiledSchemas = make(map[string]*jsonschema.Schema, len(schemaNames))
	for name, definition := range schemaNames {
		schema, err := compiler.Compile(location + "#/$defs/" + definition)
		if err != nil {
			schemaError = err
			return
		}
		compiledSchemas[name] = schema
	}
}

func decodeTransport(payload []byte, target any) error {
	compileSchemas.Do(prepareSchemas)
	if schemaError != nil {
		return fmt.Errorf("compile music contract: %w", schemaError)
	}
	name := reflect.TypeOf(target).Elem().Name()
	schema, exists := compiledSchemas[name]
	if !exists {
		return fmt.Errorf("decode music contract: unregistered type %s", name)
	}
	var value any
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.UseNumber()
	if err := decoder.Decode(&value); err != nil {
		return fmt.Errorf("decode %s: %w", name, err)
	}
	if err := schema.Validate(value); err != nil {
		return fmt.Errorf("validate %s: %w", name, err)
	}
	if err := json.Unmarshal(payload, target); err != nil {
		return fmt.Errorf("decode %s: %w", name, err)
	}
	return nil
}
