package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
)

// Entry is one reading of a word. It is served exactly as stored in the
// data file (raw), so the API returns the same objects as the JS library;
// the decoded fields are only used for lookups and describe().
type Entry struct {
	Hsk          map[string]int `json:"hsk,omitempty"`
	Pinyin       string         `json:"pinyin"`
	Translation  string         `json:"translation"`
	PartOfSpeech string         `json:"part_of_speech"`
	Traditional  string         `json:"traditional"`
	raw          json.RawMessage
}

func (e *Entry) UnmarshalJSON(b []byte) error {
	type fields Entry
	if err := json.Unmarshal(b, (*fields)(e)); err != nil {
		return err
	}
	e.raw = append(json.RawMessage(nil), b...)
	return nil
}

func (e Entry) MarshalJSON() ([]byte, error) { return e.raw, nil }

// Character is one record of data/hanzi, served raw like Entry.
type Character struct {
	Pinyin        []string `json:"pinyin"`
	Definition    string   `json:"definition"`
	Radical       string   `json:"radical"`
	Strokes       int      `json:"strokes"`
	Decomposition string   `json:"decomposition"`
	Components    []string `json:"components"`
	raw           json.RawMessage
}

func (c *Character) UnmarshalJSON(b []byte) error {
	type fields Character
	if err := json.Unmarshal(b, (*fields)(c)); err != nil {
		return err
	}
	c.raw = append(json.RawMessage(nil), b...)
	return nil
}

func (c Character) MarshalJSON() ([]byte, error) { return c.raw, nil }

// Words keeps the file's key order: the traditional index takes the first
// word that claims a traditional form, as the JS library does.
type Words struct {
	keys    []string
	entries map[string][]Entry
}

// readWords parses a word file: word → entry, or word → [entries].
func readWords(r io.Reader) (*Words, error) {
	dec := json.NewDecoder(r)
	if _, err := dec.Token(); err != nil {
		return nil, err
	}
	words := &Words{entries: map[string][]Entry{}}
	for dec.More() {
		key, err := dec.Token()
		if err != nil {
			return nil, err
		}
		var raw json.RawMessage
		if err := dec.Decode(&raw); err != nil {
			return nil, err
		}
		var entries []Entry
		if raw[0] == '[' {
			err = json.Unmarshal(raw, &entries)
		} else {
			entries = make([]Entry, 1)
			err = json.Unmarshal(raw, &entries[0])
		}
		if err != nil {
			return nil, fmt.Errorf("%s: %w", key, err)
		}
		words.keys = append(words.keys, key.(string))
		words.entries[key.(string)] = entries
	}
	return words, nil
}

func loadWords(path string) (*Words, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return readWords(f)
}

// loadJSON decodes a whole file, for data/hanzi and the meta files.
func loadJSON(path string, v any) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}
