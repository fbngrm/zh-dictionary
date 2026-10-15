package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

// Same fixtures as test/dictionary.test.js.
const wordsJSON = `{
  "好": {"pinyin": "hǎo", "translation": "good", "part_of_speech": "adjective"},
  "行": [{"pinyin": "xíng", "translation": "to walk"}, {"pinyin": "háng", "translation": "row"}],
  "发": [{"pinyin": "fā", "translation": "to send out", "traditional": "發"},
         {"pinyin": "fà", "translation": "hair", "traditional": "髮"}],
  "躺平": {"pinyin": "tǎngpíng", "translation": "to lie flat", "tags": ["internet", "slang"]}
}`

const hanziJSON = `{
  "发": {"pinyin": ["fā", "fà"], "radical": "又", "strokes": 5, "decomposition": "⿺⿸⿻𠃋丿又丶", "components": ["𠃋", "丿", "又", "丶"]},
  "好": {"pinyin": ["hǎo"], "definition": "good, excellent", "decomposition": "⿰女子", "components": ["女", "子"]}
}`

func testDictionary(t *testing.T) *Dictionary {
	t.Helper()
	words, err := readWords(strings.NewReader(wordsJSON))
	if err != nil {
		t.Fatal(err)
	}
	var hanzi map[string]Character
	if err := json.Unmarshal([]byte(hanziJSON), &hanzi); err != nil {
		t.Fatal(err)
	}
	return NewDictionary(words, hanzi)
}

// asJSON normalizes a value to its JSON form for comparison.
func asJSON(t *testing.T, v any) any {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	var out any
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func TestLookup(t *testing.T) {
	d := testDictionary(t)
	if got := d.Lookup("行").Pinyin; got != "xíng" {
		t.Errorf("lookup 行 = %q", got)
	}
	if got := len(d.LookupAll("行")); got != 2 {
		t.Errorf("lookupAll 行 has %d entries", got)
	}
	if d.Lookup("不在") != nil || d.Has("constructor") {
		t.Error("missing words should not be found")
	}
	if got := d.LookupAll("髮"); len(got) != 1 || got[0].Translation != "hair" {
		t.Errorf("traditional 髮 = %+v", got)
	}
}

func TestSplitPinyin(t *testing.T) {
	readings := map[string][]string{
		"银": {"yín"}, "行": {"xíng", "háng"}, "一": {"yī"}, "点": {"diǎn"}, "儿": {"ér"}, "西": {"xī"}, "安": {"ān"},
	}
	of := func(c string) []string { return readings[c] }
	for _, tc := range []struct {
		pinyin, word string
		want         []string
	}{
		{"yínháng", "银行", []string{"yín", "háng"}},
		{"yīdiǎnr", "一点儿", []string{"yī", "diǎn", "r"}},
		{"Xī'ān", "西安", []string{"Xī", "ān"}},
		{"yí háng", "一行", []string{"yí", "háng"}},
		{"yínhángxíng", "银行", nil},
	} {
		if got := splitPinyin(tc.pinyin, splitChars(tc.word), of); !reflect.DeepEqual(got, tc.want) {
			t.Errorf("splitPinyin(%q) = %q, want %q", tc.pinyin, got, tc.want)
		}
	}
}

func TestDescribe(t *testing.T) {
	d := testDictionary(t)
	if d.Describe("不在") != nil {
		t.Error("describe of a missing word should be nil")
	}
	want := asJSON(t, map[string]any{
		"word": "发", "traditional": "髮", "pinyin": "fà", "translation": "hair",
		"characters": []any{map[string]any{
			"char": "发", "traditional": "髮", "pinyin": "fà", "meaning": "hair", "radical": "又", "strokes": 5,
			"decomposition": "⿺⿸⿻𠃋丿又丶", "components": []string{"𠃋", "丿", "又", "丶"},
		}},
	})
	if got := asJSON(t, d.Describe("髮")); !reflect.DeepEqual(got, want) {
		t.Errorf("describe 髮 = %v\nwant %v", got, want)
	}
	if got := d.Describe("好").Characters[0].Meaning; got != "good" {
		t.Errorf("meaning of 好 = %q", got)
	}
	if got := d.Describe("躺平").Tags; !reflect.DeepEqual(got, []string{"internet", "slang"}) {
		t.Errorf("tags of 躺平 = %q", got)
	}
	if got := asJSON(t, d.Describe("好")).(map[string]any); got["tags"] != nil {
		t.Errorf("describe 好 has tags %v", got["tags"])
	}
}

func TestHandler(t *testing.T) {
	d := testDictionary(t)
	srv := httptest.NewServer(newHandler(map[string]*mode{"zh": {d, "credit"}}))
	defer srv.Close()

	for _, tc := range []struct {
		path   string
		status int
		body   string
	}{
		{"/v1/zh/lookup?q=%E5%A5%BD", 200, `{"pinyin": "hǎo", "translation": "good", "part_of_speech": "adjective"}`},
		{"/v1/zh/lookup?q=x", 200, `null`},
		{"/v1/zh/lookupAll?q=x", 200, `[]`},
		{"/v1/zh/has?q=%E8%A1%8C", 200, `true`},
		{"/v1/zh/character?q=%E5%A5%BD", 200, `{"pinyin": ["hǎo"], "definition": "good, excellent", "decomposition": "⿰女子", "components": ["女", "子"]}`},
		{"/v1/zh/attribution", 200, `{"attribution":"credit"}`},
		{"/v1/zh/lookup", 400, `{"error":"missing query parameter q"}`},
		{"/v1/xx/lookup?q=x", 404, `{"error":"unknown mode, use zh or cedict"}`},
		{"/v1/zh/nope?q=x", 404, `{"error":"unknown function nope"}`},
	} {
		res, err := http.Get(srv.URL + tc.path)
		if err != nil {
			t.Fatal(err)
		}
		var got, want any
		if err := json.NewDecoder(res.Body).Decode(&got); err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		json.Unmarshal([]byte(tc.body), &want)
		if res.StatusCode != tc.status || !reflect.DeepEqual(got, want) {
			t.Errorf("%s = %d %v, want %d %v", tc.path, res.StatusCode, got, tc.status, want)
		}
		if res.Header.Get("Access-Control-Allow-Origin") != "*" {
			t.Errorf("%s: missing CORS header", tc.path)
		}
	}
}

func TestBatch(t *testing.T) {
	d := testDictionary(t)
	srv := httptest.NewServer(newHandler(map[string]*mode{"zh": {d, "credit"}}))
	defer srv.Close()

	tooMany := `{"q": [` + strings.Repeat(`"好",`, maxBatch) + `"好"]}`
	for _, tc := range []struct {
		path, body string
		status     int
		want       string
	}{
		{"/v1/zh/has", `{"q": ["好", "x", "髮", "好"]}`, 200, `[true, false, true, true]`},
		{"/v1/zh/lookup", `{"q": ["好", "x"]}`, 200, `[{"pinyin": "hǎo", "translation": "good", "part_of_speech": "adjective"}, null]`},
		{"/v1/zh/lookupAll", `{"q": []}`, 200, `[]`},
		{"/v1/zh/describe", `{"q": ["x"]}`, 200, `[null]`},
		{"/v1/zh/has", `{"q": "好"}`, 400, `{"error": "body must be {\"q\": [\"word\", ...]} (max 1 MiB)"}`},
		{"/v1/zh/has", `not json`, 400, `{"error": "body must be {\"q\": [\"word\", ...]} (max 1 MiB)"}`},
		{"/v1/zh/has", tooMany, 413, `{"error": "at most 1000 items per batch"}`},
		{"/v1/zh/attribution", `{"q": []}`, 405, `{"error": "attribution has no batch form, use GET"}`},
		{"/v1/zh/nope", `{"q": []}`, 404, `{"error": "unknown function nope"}`},
	} {
		res, err := http.Post(srv.URL+tc.path, "application/json", strings.NewReader(tc.body))
		if err != nil {
			t.Fatal(err)
		}
		var got, want any
		if err := json.NewDecoder(res.Body).Decode(&got); err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		json.Unmarshal([]byte(tc.want), &want)
		if res.StatusCode != tc.status || !reflect.DeepEqual(got, want) {
			t.Errorf("POST %s %.40s = %d %v, want %d %v", tc.path, tc.body, res.StatusCode, got, tc.status, want)
		}
	}

	// Results match the single GET answers item for item.
	for _, fn := range []string{"lookup", "lookupAll", "has", "describe", "character"} {
		words := []string{"好", "行", "髮", "发", "x"}
		body, _ := json.Marshal(map[string][]string{"q": words})
		res, _ := http.Post(srv.URL+"/v1/zh/"+fn, "application/json", strings.NewReader(string(body)))
		var batch []any
		json.NewDecoder(res.Body).Decode(&batch)
		res.Body.Close()
		for i, w := range words {
			if single := asJSON(t, call(d, fn, w)); !reflect.DeepEqual(batch[i], single) {
				t.Errorf("%s batch[%d] = %v, single = %v", fn, i, batch[i], single)
			}
		}
	}
}

func TestPreflight(t *testing.T) {
	srv := httptest.NewServer(newHandler(map[string]*mode{"zh": {testDictionary(t), ""}}))
	defer srv.Close()
	req, _ := http.NewRequest(http.MethodOptions, srv.URL+"/v1/zh/describe", nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	h := res.Header
	if res.StatusCode != 204 || h.Get("Access-Control-Allow-Origin") != "*" ||
		h.Get("Access-Control-Allow-Methods") != "GET, POST" || h.Get("Access-Control-Allow-Headers") != "Content-Type" {
		t.Errorf("preflight = %d %v", res.StatusCode, h)
	}
}
