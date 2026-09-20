/** PDF의 물리적 줄바꿈만 연결한다. 원문 데이터는 변경하지 않는다. */
export function readingText(text: string) {
  return text
    .replace(/\n(?!\s*(?:[ㄱ-ㅎ]\s*[.．]|[①-⑳]|[가-하]\s*[.．]|\n))/g, " ")
    .replace(/ +\n/g, "\n");
}
export function splitStem(stem: string) {
  const at = stem.search(/\n\s*[ㄱ-ㅎ]\s*[.．]/);
  return at < 0
    ? { prompt: stem, cases: "" }
    : { prompt: stem.slice(0, at), cases: stem.slice(at + 1) };
}
