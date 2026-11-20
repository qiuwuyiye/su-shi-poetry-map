import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(
  root,
  ".source/su-shi-chronicle/src/data/poems-full.json"
);
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

const placeAliases = [
  ["mizhou", ["密州", "诸城", "超然台"]],
  ["xuzhou", ["徐州", "黄楼", "燕子楼", "百步洪", "石潭"]],
  ["huzhou", ["湖州"]],
  ["bianjing", ["汴京", "京师", "御史台", "乌台"]],
  ["huangzhou", ["黄州", "东坡", "雪堂", "赤壁", "定慧院", "临皋", "沙湖", "蕲水"]],
  ["dengzhou", ["登州", "蓬莱"]],
  ["hangzhou", ["杭州", "西湖", "望湖楼", "有美堂"]],
  ["yingzhou", ["颍州", "颍水"]],
  ["yangzhou", ["扬州", "平山堂"]],
  ["dingzhou", ["定州"]],
  ["huizhou", ["惠州", "罗浮"]],
  ["danzhou", ["儋州", "儋耳", "昌化", "桄榔", "海南"]],
  ["fengxiang", ["凤翔"]],
  ["meishan", ["眉山", "眉州"]]
];

const exactYearItinerary = [
  [1037, 1055, "meishan"],
  [1056, 1060, "bianjing"],
  [1061, 1065, "fengxiang"],
  [1066, 1068, "meishan"],
  [1069, 1070, "bianjing"],
  [1071, 1073, "hangzhou"],
  [1074, 1074, "mizhou", ["hangzhou"]],
  [1075, 1076, "mizhou"],
  [1077, 1078, "xuzhou"],
  [1079, 1079, "huzhou", ["xuzhou", "bianjing"]],
  [1080, 1084, "huangzhou"],
  [1085, 1085, "dengzhou", ["huangzhou", "bianjing"]],
  [1086, 1088, "bianjing"],
  [1089, 1090, "hangzhou"],
  [1091, 1091, "yingzhou", ["hangzhou", "bianjing"]],
  [1092, 1092, "yangzhou", ["yingzhou"]],
  [1093, 1093, "dingzhou", ["yangzhou"]],
  [1094, 1096, "huizhou"],
  [1097, 1100, "danzhou"],
  [1101, 1101, "changzhou"]
];

const placeYearRanges = {
  meishan: [1037, 1068],
  bianjing: [1056, 1091],
  fengxiang: [1061, 1065],
  hangzhou: [1071, 1091],
  mizhou: [1074, 1077],
  xuzhou: [1077, 1079],
  huzhou: [1079, 1079],
  huangzhou: [1080, 1084],
  dengzhou: [1085, 1085],
  yingzhou: [1091, 1092],
  yangzhou: [1092, 1093],
  dingzhou: [1093, 1094],
  huizhou: [1094, 1097],
  danzhou: [1097, 1100],
  changzhou: [1101, 1101]
};

const themes = [
  ["和陶与隐逸", /^和陶|陶渊明|归去来/],
  ["悼亡与追忆", /亡|哭|挽|墓|梦|祭|哀|悼/],
  ["离别与怀人", /送|别|寄|怀|忆|留别|赠/],
  ["山水与行旅", /山|水|江|湖|溪|海|游|舟|行|登|寺/],
  ["四时与物候", /春|夏|秋|冬|雪|雨|月|花|梅|竹|荷/],
  ["饮食与日常", /食|荔枝|酒|茶|饼|羹|笋|鱼/],
  ["仕途与身世", /狱|谪|官|朝|诏|御史|罪|归田/],
  ["佛道与禅思", /佛|禅|僧|道士|罗汉|观音|经/],
  ["唱和与友情", /次韵|和|答|酬|戏作/]
];

const imageWords = [
  "江", "湖", "海", "山", "月", "雨", "雪", "风", "云", "花",
  "梅", "竹", "松", "舟", "寺", "酒", "茶", "梦", "鹤", "鸿"
];

function inferTheme(poem) {
  const text = `${poem.title}${poem.lines.join("")}`;
  return themes.find(([, pattern]) => pattern.test(text))?.[0] || "人生感怀";
}

function inferImages(poem) {
  const text = `${poem.title}${poem.firstLine}`;
  const hits = imageWords.filter((word) => text.includes(word)).slice(0, 4);
  return hits.length ? hits : ["眼前景物"];
}

function inferLocation(poem) {
  for (const [placeId, aliases] of placeAliases) {
    const hit = aliases.find((alias) => poem.title.includes(alias));
    if (hit) {
      return {
        placeId,
        alternatives: [],
        confidence: "high",
        basis: `题名直接出现“${hit}”`
      };
    }
  }

  if (poem.year) {
    const row = exactYearItinerary.find(
      ([start, end]) => poem.year >= start && poem.year <= end
    );
    if (row) {
      const alternatives = row[3] || [];
      return {
        placeId: row[2],
        alternatives,
        confidence: alternatives.length ? "low" : "medium",
        basis: alternatives.length
          ? `${poem.year} 年苏轼行迹涉及多地，暂按主要停留地推定`
          : `据 ${poem.year} 年苏轼行迹推定`
      };
    }
  }

  if (poem.phase === "huangzhou") {
    return {
      placeId: "huangzhou",
      alternatives: [],
      confidence: "medium",
      basis: "作品被系入黄州时期"
    };
  }
  if (poem.phase === "wutai") {
    return {
      placeId: "bianjing",
      alternatives: [],
      confidence: "medium",
      basis: "作品被系入乌台诗案时期"
    };
  }
  if (poem.phase === "nanhuang") {
    return {
      placeId: "huizhou",
      alternatives: ["danzhou"],
      confidence: "low",
      basis: "作品被系入惠州—儋州时期，具体地点待考"
    };
  }
  return null;
}

function buildReading(poem, theme, images) {
  const opening = (poem.firstLine || "").replace(/\s+/g, "").slice(0, 48);
  const imageText = images.join("、");
  return {
    theme,
    images,
    plain:
      `这篇${poem.type}以“${opening}”起笔，主要写${theme}。` +
      `先抓住${imageText}这些意象：它们既是眼前所见，也承载着苏轼当时的情绪与处境。`,
    insight:
      `用人话说，苏轼不是只在描摹景物，而是在借${imageText}` +
      `整理自己的感受。阅读时可留意景物如何从外部环境转向内心，以及结尾怎样完成转折或自我宽解。`,
    caveat: "这是基于题目、首句和关键词生成的基础导读，不替代权威注本的逐句笺释。"
  };
}

const poems = source.poems.map((poem) => {
  const theme = inferTheme(poem);
  const images = inferImages(poem);
  const locationInference = inferLocation(poem);
  const locationRange = locationInference
    ? placeYearRanges[locationInference.placeId]
    : null;
  return {
    ...poem,
    age: poem.year ? poem.year - 1036 : null,
    locationInference,
    dateInference: poem.year
      ? { start: poem.year, end: poem.year, confidence: "high" }
      : locationRange
        ? {
            start: locationRange[0],
            end: locationRange[1],
            confidence: locationInference.confidence
          }
        : null,
    reading: buildReading(poem, theme, images)
  };
});

const locationCounts = {};
for (const poem of poems) {
  const placeId = poem.locationInference?.placeId;
  if (placeId) locationCounts[placeId] = (locationCounts[placeId] || 0) + 1;
}

const output = {
  meta: {
    ...source.meta,
    withInferredLocation: poems.filter((poem) => poem.locationInference).length,
    withBaseReading: poems.length,
    locationCounts,
    generatedAt: new Date().toISOString()
  },
  poems
};

fs.writeFileSync(
  path.join(root, "enriched-poems.json"),
  JSON.stringify(output)
);

console.log(
  JSON.stringify({
    total: poems.length,
    withInferredLocation: output.meta.withInferredLocation,
    withBaseReading: output.meta.withBaseReading,
    locationCounts
  }, null, 2)
);
