package main

import "strings"

// Dictionary is the Go port of createDictionary() in src/index.ts, for one
// word dataset plus character data. Its JSON output matches the JS library.
type Dictionary struct {
	words       *Words
	hanzi       map[string]Character
	traditional map[string]string // traditional form → simplified key
}

type WordCharacter struct {
	Char          string   `json:"char"`
	Traditional   string   `json:"traditional"`
	Pinyin        string   `json:"pinyin,omitempty"`
	Meaning       string   `json:"meaning,omitempty"`
	Radical       string   `json:"radical,omitempty"`
	Strokes       int      `json:"strokes,omitempty"`
	Decomposition string   `json:"decomposition,omitempty"`
	Components    []string `json:"components"`
}

type WordDetails struct {
	Word         string          `json:"word"`
	Traditional  string          `json:"traditional"`
	Pinyin       string          `json:"pinyin"`
	Translation  string          `json:"translation"`
	PartOfSpeech string          `json:"part_of_speech,omitempty"`
	Characters   []WordCharacter `json:"characters"`
}

func NewDictionary(words *Words, hanzi map[string]Character) *Dictionary {
	d := &Dictionary{words: words, hanzi: hanzi, traditional: map[string]string{}}
	for _, word := range words.keys {
		for _, e := range words.entries[word] {
			if _, taken := d.traditional[e.Traditional]; e.Traditional != "" && !taken {
				d.traditional[e.Traditional] = word
			}
		}
	}
	return d
}

// find returns the simplified key and matching entries for word.
func (d *Dictionary) find(word string) (string, []Entry) {
	if entries, ok := d.words.entries[word]; ok {
		return word, entries
	}
	simplified, ok := d.traditional[word]
	if !ok {
		return "", nil
	}
	var matching []Entry
	for _, e := range d.words.entries[simplified] {
		if e.Traditional == word {
			matching = append(matching, e)
		}
	}
	return simplified, matching
}

func (d *Dictionary) LookupAll(word string) []Entry {
	_, entries := d.find(word)
	if entries == nil {
		return []Entry{}
	}
	return entries
}

func (d *Dictionary) Lookup(word string) *Entry {
	if entries := d.LookupAll(word); len(entries) > 0 {
		return &entries[0]
	}
	return nil
}

func (d *Dictionary) Has(word string) bool { return len(d.LookupAll(word)) > 0 }

func (d *Dictionary) Character(char string) *Character {
	if c, ok := d.hanzi[char]; ok {
		return &c
	}
	return nil
}

// meaningOf: the character's own entry in this reading, else its general
// definition.
func (d *Dictionary) meaningOf(char, reading string) string {
	entries := d.LookupAll(char)
	if reading != "" {
		for _, e := range entries {
			if strings.ToLower(e.Pinyin) == strings.ToLower(reading) {
				return e.Translation
			}
		}
		for _, e := range entries {
			if toneless(e.Pinyin) == toneless(reading) {
				return e.Translation
			}
		}
	}
	if c := d.Character(char); c != nil && c.Definition != "" {
		return c.Definition
	}
	if len(entries) > 0 {
		return entries[0].Translation
	}
	return ""
}

func (d *Dictionary) Describe(word string) *WordDetails {
	simplified, entries := d.find(word)
	if len(entries) == 0 {
		return nil
	}
	entry := entries[0]
	chars := splitChars(simplified)
	traditionalForm := entry.Traditional
	if traditionalForm == "" {
		traditionalForm = simplified
	}
	traditionalChars := splitChars(traditionalForm)
	if len(traditionalChars) != len(chars) {
		traditionalChars = chars
	}
	readings := splitPinyin(entry.Pinyin, chars, func(c string) []string {
		var readings []string
		if data := d.Character(c); data != nil {
			readings = append(readings, data.Pinyin...)
		}
		for _, e := range d.LookupAll(c) {
			readings = append(readings, e.Pinyin)
		}
		return readings
	})

	characters := make([]WordCharacter, len(chars))
	for k, char := range chars {
		wc := WordCharacter{Char: char, Traditional: traditionalChars[k], Components: []string{}}
		reading := ""
		if readings != nil {
			reading = readings[k]
			wc.Pinyin = reading
		}
		wc.Meaning = d.meaningOf(char, reading)
		if data := d.Character(char); data != nil {
			wc.Radical, wc.Strokes, wc.Decomposition = data.Radical, data.Strokes, data.Decomposition
			if data.Components != nil {
				wc.Components = data.Components
			}
		}
		characters[k] = wc
	}

	return &WordDetails{
		Word:         simplified,
		Traditional:  traditionalForm,
		Pinyin:       entry.Pinyin,
		Translation:  entry.Translation,
		PartOfSpeech: entry.PartOfSpeech,
		Characters:   characters,
	}
}

// splitChars splits by code point, like [...text] in JS.
func splitChars(text string) []string {
	var chars []string
	for _, r := range text {
		chars = append(chars, string(r))
	}
	return chars
}
