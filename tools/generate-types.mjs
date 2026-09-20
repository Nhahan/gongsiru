import { compileFromFile } from "json-schema-to-typescript";
import { mkdir, writeFile } from "node:fs/promises";
const output = await compileFromFile(
  new URL("../schema/content.schema.json", import.meta.url).pathname,
  {
    bannerComment:
      "/* Generated from schema/content.schema.json. Do not edit. */",
    unreachableDefinitions: true,
  },
);
await mkdir(new URL("../src/generated/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../src/generated/content.ts", import.meta.url),
  output,
);
