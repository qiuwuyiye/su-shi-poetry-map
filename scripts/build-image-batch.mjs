import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { poems as curatedPoems } from "../.source/su-shi-chronicle/src/data/poems.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataCode = fs.readFileSync(path.join(root, "data.js"), "utf8");
const context = { window: {} };
vm.runInNewContext(dataCode, context);
const detailedPoems = context.window.POEMS;

function titleKey(title) {
  return title.replace(/[·・\s（）()]/g, "");
}

const detailedByTitle = new Map(
  detailedPoems.map((poem) => [titleKey(poem.title), poem])
);
const works = new Map();

for (const poem of curatedPoems.filter((item) => item.placeId)) {
  const detailed = detailedByTitle.get(titleKey(poem.title));
  const work = detailed || {
    id: `curated-${poem.id}`,
    title: poem.title,
    place: poem.place,
    quote: poem.firstLine,
    note: poem.note
  };
  works.set(titleKey(work.title), work);
}

for (const poem of detailedPoems) {
  works.set(titleKey(poem.title), poem);
}

const commonStyle = [
  "横版16:9中国古典意境插画，北宋美学，水墨与矿物重彩结合，电影感光影，",
  "人物与建筑服饰尽量符合宋代，构图有明确远近层次，适合作为诗词网页卡片封面。",
  "禁止出现文字、书法、题款、印章、水印、现代物品；不要做成现代影视剧海报。"
].join("");

const tasks = [];
const manifest = {};

for (const work of works.values()) {
  const id = work.id.replace(/[^a-zA-Z0-9_-]/g, "-");
  const place = work.location?.site || work.place || work.location?.modern || "北宋山河";
  const quote = work.quote || work.firstLine || work.lines?.[0] || "";
  const note = work.background || work.note || "";
  const image = `assets/poems/${id}.png`;
  tasks.push({
    id,
    provider: "codex-cli",
    ar: "16:9",
    image,
    prompt: [
      commonStyle,
      `作品：苏轼《${work.title}》。`,
      `地点与场景：${place}。`,
      `核心诗句与视觉意象：${quote}`,
      `创作背景参考：${note}`,
      "以景物和氛围表达诗意，苏轼如出现应只是画面中的宋代文士，不追求真实肖像。"
    ].join("\n")
  });
  manifest[titleKey(work.title)] = `/${image}`;
}

fs.mkdirSync(path.join(root, "assets/poems"), { recursive: true });
fs.writeFileSync(
  path.join(root, "image-batch.json"),
  JSON.stringify({ jobs: 3, tasks }, null, 2)
);
fs.writeFileSync(
  path.join(root, "image-manifest.js"),
  `export default ${JSON.stringify(manifest, null, 2)};\n`
);

console.log(`Prepared ${tasks.length} image tasks.`);
