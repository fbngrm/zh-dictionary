// Command server serves the zh-dictionary API over HTTP. It mirrors the JS
// library: GET /v1/{mode}/{function}?q=<word or character>, where mode is
// zh or cedict and function is lookup, lookupAll, has, describe or
// character, plus GET /v1/{mode}/attribution. Responses are the same JSON
// the library returns. POST /v1/{mode}/{function} with {"q": [...]} answers
// a batch: one result per item, in order.
//
// Environment: DATA_DIR (default "data"), ADDR (default ":8080").
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
)

type mode struct {
	dict        *Dictionary
	attribution string
}

func main() {
	dataDir := env("DATA_DIR", "data")
	addr := env("ADDR", ":8080")

	modes, err := loadModes(dataDir)
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("listening on %s (data: %s)", addr, dataDir)
	log.Fatal(http.ListenAndServe(addr, newHandler(modes)))
}

func loadModes(dataDir string) (map[string]*mode, error) {
	path := func(p string) string { return filepath.Join(dataDir, p) }
	var hanzi map[string]Character
	var hanziMeta, cedictMeta, hskMeta struct{ Attribution string }
	for p, v := range map[string]any{
		"hanzi/hanzi.json": &hanzi, "hanzi/meta.json": &hanziMeta, "cedict/meta.json": &cedictMeta, "hsk/meta.json": &hskMeta,
	} {
		if err := loadJSON(path(p), v); err != nil {
			return nil, err
		}
	}
	zh, err := loadWords(path("zh/dictionary.json"))
	if err != nil {
		return nil, err
	}
	cedict, err := loadWords(path("cedict/cedict.json"))
	if err != nil {
		return nil, err
	}
	return map[string]*mode{
		"zh":     {NewDictionary(zh, hanzi), hanziMeta.Attribution + " " + hskMeta.Attribution},
		"cedict": {NewDictionary(cedict, hanzi), cedictMeta.Attribution + " " + hanziMeta.Attribution + " " + hskMeta.Attribution},
	}, nil
}

// Batch requests: at most maxBatch items and maxBody bytes.
const (
	maxBatch = 1000
	maxBody  = 1 << 20
)

func newHandler(modes map[string]*mode) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /v1/{mode}/{fn}", func(w http.ResponseWriter, r *http.Request) {
		m, fn, ok := resolve(w, r, modes)
		if !ok {
			return
		}
		if fn == "attribution" {
			cache(w)
			writeJSON(w, http.StatusOK, map[string]string{"attribution": m.attribution})
			return
		}
		if !r.URL.Query().Has("q") {
			writeError(w, http.StatusBadRequest, "missing query parameter q")
			return
		}
		cache(w)
		writeJSON(w, http.StatusOK, call(m.dict, fn, r.URL.Query().Get("q")))
	})
	// Batch: POST {"q": [...]} → one result per item, in the same order.
	mux.HandleFunc("POST /v1/{mode}/{fn}", func(w http.ResponseWriter, r *http.Request) {
		m, fn, ok := resolve(w, r, modes)
		if !ok {
			return
		}
		if fn == "attribution" {
			writeError(w, http.StatusMethodNotAllowed, "attribution has no batch form, use GET")
			return
		}
		var body struct{ Q []string }
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBody)).Decode(&body); err != nil || body.Q == nil {
			writeError(w, http.StatusBadRequest, `body must be {"q": ["word", ...]} (max 1 MiB)`)
			return
		}
		if len(body.Q) > maxBatch {
			writeError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("at most %d items per batch", maxBatch))
			return
		}
		results := make([]any, len(body.Q))
		for i, q := range body.Q {
			results[i] = call(m.dict, fn, q)
		}
		writeJSON(w, http.StatusOK, results)
	})
	// CORS preflight, which browsers send before a JSON POST.
	mux.HandleFunc("OPTIONS /v1/{mode}/{fn}", func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", "*")
		h.Set("Access-Control-Allow-Methods", "GET, POST")
		h.Set("Access-Control-Allow-Headers", "Content-Type")
		h.Set("Access-Control-Max-Age", "86400")
		w.WriteHeader(http.StatusNoContent)
	})
	return mux
}

var functions = map[string]bool{
	"lookup": true, "lookupAll": true, "has": true, "describe": true, "character": true, "attribution": true,
}

// resolve checks the mode and function in the path, writing a 404 if
// either is unknown.
func resolve(w http.ResponseWriter, r *http.Request, modes map[string]*mode) (*mode, string, bool) {
	m, ok := modes[r.PathValue("mode")]
	if !ok {
		writeError(w, http.StatusNotFound, "unknown mode, use zh or cedict")
		return nil, "", false
	}
	fn := r.PathValue("fn")
	if !functions[fn] {
		writeError(w, http.StatusNotFound, "unknown function "+fn)
		return nil, "", false
	}
	return m, fn, true
}

func call(d *Dictionary, fn, q string) any {
	switch fn {
	case "lookup":
		return d.Lookup(q)
	case "lookupAll":
		return d.LookupAll(q)
	case "has":
		return d.Has(q)
	case "describe":
		return d.Describe(q)
	default: // "character"; resolve() rejects anything else
		return d.Character(q)
	}
}

// cache marks a GET answer cacheable: answers only change with the image.
func cache(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "public, max-age=3600")
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	h := w.Header()
	h.Set("Content-Type", "application/json; charset=utf-8")
	// Read-only public data: any web app may call it.
	h.Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		log.Printf("write response: %v", err)
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
