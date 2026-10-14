package main

import (
	"sort"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Port of src/pinyin.ts. Go's standard library has no Unicode
// normalization, so tone-marked vowels are mapped explicitly; the data is NFC.
var toneBase = map[rune]rune{}

func init() {
	for base, marked := range map[rune]string{
		'a': "āáǎà", 'e': "ēéěè", 'i': "īíǐì", 'o': "ōóǒò", 'u': "ūúǔù", 'ü': "ǖǘǚǜ",
		'A': "ĀÁǍÀ", 'E': "ĒÉĚÈ", 'I': "ĪÍǏÌ", 'O': "ŌÓǑÒ", 'U': "ŪÚǓÙ", 'Ü': "ǕǗǙǛ",
		'ê': "ếề", 'Ê': "ẾỀ", 'm': "ḿ", 'M': "Ḿ", 'n': "ńňǹ", 'N': "ŃŇǸ",
	} {
		for _, r := range marked {
			toneBase[r] = base
		}
	}
}

// isToneMark reports combining tone marks (U+0300, U+0301, U+0304, U+030C),
// which appear when no precomposed character exists (e.g. ê̄).
func isToneMark(r rune) bool {
	return r == 0x300 || r == 0x301 || r == 0x304 || r == 0x30C
}

// toneless: "Háng" → "hang", "lǜ" → "lü".
func toneless(s string) string {
	var b strings.Builder
	for _, r := range s {
		if isToneMark(r) {
			continue
		}
		if base, ok := toneBase[r]; ok {
			r = base
		}
		b.WriteRune(unicode.ToLower(r))
	}
	return b.String()
}

func isSeparator(r rune) bool {
	return unicode.IsSpace(r) || r == '\'' || r == '’' || r == '·' || r == '-'
}

// splitPinyin splits a word's pinyin into one syllable per character by
// matching each character's known readings, ignoring tones. Nil when the
// pinyin can't be matched character by character.
func splitPinyin(pinyin string, chars []string, readingsOf func(string) []string) []string {
	original := []rune(pinyin)
	plain := make([]string, len(original))
	for i, r := range original {
		plain[i] = toneless(string(r))
	}
	failed := map[string]bool{}

	var split func(pos, k int) []string
	split = func(pos, k int) []string {
		for pos < len(original) && isSeparator(original[pos]) {
			pos++
		}
		if k == len(chars) {
			if pos == len(original) {
				return []string{}
			}
			return nil
		}
		key := strconv.Itoa(pos) + "," + strconv.Itoa(k)
		if failed[key] {
			return nil
		}

		var candidates []string
		seen := map[string]bool{}
		add := func(reading string) {
			if !seen[reading] {
				seen[reading] = true
				candidates = append(candidates, reading)
			}
		}
		for _, reading := range readingsOf(chars[k]) {
			add(toneless(reading))
		}
		if chars[k] == "儿" {
			add("r") // erhua: 一点儿 yīdiǎnr
		}
		// Longest first, stable like the JS sort.
		sort.SliceStable(candidates, func(i, j int) bool {
			return utf8.RuneCountInString(candidates[i]) > utf8.RuneCountInString(candidates[j])
		})

		for _, reading := range candidates {
			n := utf8.RuneCountInString(reading)
			if pos+n > len(original) || strings.Join(plain[pos:pos+n], "") != reading {
				continue
			}
			if rest := split(pos+n, k+1); rest != nil {
				return append([]string{string(original[pos : pos+n])}, rest...)
			}
		}
		failed[key] = true
		return nil
	}

	return split(0, 0)
}
