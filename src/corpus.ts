// Pinned corpus version: recordings, transcripts and grades remain in sync.
export const SENTENCE_CORPUS_BASE = 'https://raw.githubusercontent.com/fbngrm/mandarin-sentence-audio/v1.1.0/';
export function sentenceAudioUrl(id: string, base = SENTENCE_CORPUS_BASE): string {
  if (!/^SSB\d{8}$/.test(id)) throw new Error('Invalid AISHELL-3 recording ID');
  return new URL(`audio/aishell3/${id.slice(0, 7)}/${id}.mp3`, base).href;
}
export function sentenceMetadataUrl(source: 'aishell3' | 'tatoeba', id: string | number, base = SENTENCE_CORPUS_BASE): string {
  if (source === 'aishell3') {
    sentenceAudioUrl(String(id), base);
    return new URL(`data/aishell3/${String(id).slice(0, 7)}.json`, base).href;
  }
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new Error('Invalid Tatoeba ID');
  return new URL(`data/tatoeba/${Number(id) % 256}.json`, base).href;
}
