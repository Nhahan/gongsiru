import { decryptJson, sha256 } from "./crypto.mjs";
import type { Catalog, TopicContent } from "./model";
export const BASE = import.meta.env.BASE_URL;
async function textAt(path: string) {
  const r = await fetch(`${BASE}data/${path}`, {
    cache: "no-cache",
    referrerPolicy: "no-referrer",
  });
  if (!r.ok)
    throw new Error("자료를 불러오지 못했습니다. 연결을 확인해 주세요.");
  return r.text();
}
export async function openCatalog(key: string): Promise<Catalog> {
  const release = JSON.parse(await textAt("current.json"));
  if (release.schemaVersion !== 1)
    throw new Error("새 버전이 필요합니다. 페이지를 새로 열어 주세요.");
  const text = await textAt(release.index);
  if ((await sha256(text)) !== release.sha256)
    throw new Error("목록이 손상되었습니다.");
  const catalog = await decryptJson(
    JSON.parse(text),
    key,
    `content:${release.id}:index`,
  );
  if (catalog.schemaVersion !== 1 || catalog.releaseId !== release.id)
    throw new Error("자료 버전이 일치하지 않습니다.");
  return catalog;
}
export async function openTopic(
  catalog: Catalog,
  topicId: string,
  key: string,
): Promise<TopicContent> {
  const chunk = catalog.chunks.find((c) => c.topicId === topicId);
  if (!chunk) throw new Error("해당 단원의 자료가 없습니다.");
  const text = await textAt(chunk.path);
  if ((await sha256(text)) !== chunk.sha256)
    throw new Error("단원 자료가 손상되었습니다.");
  return decryptJson(
    JSON.parse(text),
    key,
    `content:${catalog.releaseId}:${topicId}`,
  );
}
