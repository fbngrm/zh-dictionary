// Command server serves the zh-dictionary API over HTTP. It mirrors the JS
// library: GET /v1/{mode}/{function}?q=<word or character>, where mode is
// zh or cedict and function is lookup, lookupAll, has, describe or
// character, plus GET /v1/{mode}/attribution. Responses are the same JSON
// the library returns.
//
// Environment: DATA_DIR (default "data"), ADDR (default ":8080").
package main

import (
	"encoding/json"
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

func newHandler(modes map[string]*mode) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /v1/{mode}/{fn}", func(w http.ResponseWriter, r *http.Request) {
		m, ok := modes[r.PathValue("mode")]
		if !ok {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "unknown mode, use zh or cedict"})
			return
		}
		fn := r.PathValue("fn")
		if fn == "attribution" {
			writeJSON(w, http.StatusOK, map[string]string{"attribution": m.attribution})
			return
		}
		if !r.URL.Query().Has("q") {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing query parameter q"})
			return
		}
		q := r.URL.Query().Get("q")
		switch fn {
		case "lookup":
			writeJSON(w, http.StatusOK, m.dict.Lookup(q))
		case "lookupAll":
			writeJSON(w, http.StatusOK, m.dict.LookupAll(q))
		case "has":
			writeJSON(w, http.StatusOK, m.dict.Has(q))
		case "describe":
			writeJSON(w, http.StatusOK, m.dict.Describe(q))
		case "character":
			writeJSON(w, http.StatusOK, m.dict.Character(q))
		default:
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "unknown function " + fn})
		}
	})
	return mux
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	h := w.Header()
	h.Set("Content-Type", "application/json; charset=utf-8")
	// Read-only public data: any web app may call it, and answers only
	// change when the image does.
	h.Set("Access-Control-Allow-Origin", "*")
	if status == http.StatusOK {
		h.Set("Cache-Control", "public, max-age=3600")
	}
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
