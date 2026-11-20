import { poems as curatedPoems } from "./.source/su-shi-chronicle/src/data/poems.js";
import { places as lifePlaces } from "./.source/su-shi-chronicle/src/data/places.js";

const enrichedCorpus = await fetch("/enriched-poems.json").then((response) =>
  response.json()
);
const detailedPoems = window.POEMS || [];
const placeMeta = new Map(lifePlaces.map((place) => [place.id, place]));
const markerByPlace = new Map();
let selectedPlaceKey = null;
let selectedGlobalPlaceId = null;
let globalMode = false;
let globalPlaces = [];
let detailOrigin = "place";
let corpusType = "全部";
let currentDynasty = "song";
let selectedAuthor = "";
let corpusOffset = 0;
let corpusTotal = 0;
let authorTimer = null;
let authorRequestId = 0;
let globalPlaceRequestId = 0;
let startYear = 1037;
let endYear = 1101;

const dynastyNames = {
  xianqin: "先秦", qinhan: "秦汉", weijin: "魏晋", nanbeichao: "南北朝",
  sui: "隋", tang: "唐", song: "宋", liao: "辽", jin: "金",
  yuan: "元", ming: "明", qing: "清"
};
const dynastyCounts = {
  xianqin: 570, qinhan: 365, weijin: 3021, nanbeichao: 4586,
  sui: 1170, tang: 50784, song: 299406, liao: 22, jin: 5760,
  yuan: 37378, ming: 252694, qing: 107791
};
const genreKeys = { 全部: "", 诗: "shi", 词: "ci", 曲: "qu" };
const genreNames = { shi: "诗", ci: "词", qu: "曲" };
const suShiByTitle = new Map(
  enrichedCorpus.poems.map((poem) => [titleKey(poem.title), poem])
);

function titleKey(title) {
  return title.replace(/[·・\s（）()]/g, "");
}

const detailedByTitle = new Map(
  detailedPoems.map((poem) => [titleKey(poem.title), poem])
);

function normalizeCuratedPoem(poem) {
  const detailed = detailedByTitle.get(titleKey(poem.title));
  if (detailed) return detailed;
  if (!poem.placeId || !placeMeta.has(poem.placeId)) return null;

  const place = placeMeta.get(poem.placeId);
  return {
    id: `curated-${poem.id}`,
    title: poem.title,
    form: poem.type,
    year: poem.year,
    age: poem.year - 1036,
    ageType: "虚岁",
    location: {
      key: place.id,
      historical: place.name,
      modern: place.modern,
      region: place.modern.slice(0, 2),
      site: poem.place,
      lat: place.lat,
      lng: place.lon,
      accuracy: "城市级定位"
    },
    image: null,
    lines: poem.paragraphs,
    quote: poem.firstLine,
    background: poem.note,
    meaning: "这篇作品的白话解读尚未逐篇校订，当前先展示可靠的原文、系年和创作背景。",
    subtext: `系年：${poem.dateLabel}。地图地点来自编年名篇资料。`,
    lifeStage: poem.dateLabel,
    sourceNote: "编年与地点采用“一蓑烟雨·苏轼编年诗传”整理数据；正式版仍需逐篇与权威年谱、校注本复核。"
  };
}

const mappedByTitle = new Map();
for (const poem of curatedPoems) {
  const normalized = normalizeCuratedPoem(poem);
  if (normalized) mappedByTitle.set(titleKey(normalized.title), normalized);
}
for (const poem of detailedPoems) {
  mappedByTitle.set(titleKey(poem.title), poem);
}
for (const poem of enrichedCorpus.poems) {
  if (!poem.locationInference || mappedByTitle.has(titleKey(poem.title))) continue;
  const place = placeMeta.get(poem.locationInference.placeId);
  if (!place) continue;
  mappedByTitle.set(titleKey(poem.title), {
    id: `inferred-${poem.id}`,
    title: poem.title,
    form: poem.type,
    year: poem.year,
    yearStart: poem.dateInference?.start,
    yearEnd: poem.dateInference?.end,
    yearLabel: poem.yearLabel,
    age: poem.age,
    ageType: "虚岁",
    location: {
      key: place.id,
      historical: place.name,
      modern: place.modern,
      region: place.modern.slice(0, 2),
      site: place.name,
      lat: place.lat,
      lng: place.lon,
      accuracy: {
        high: "高置信推定",
        medium: "中置信推定",
        low: "低置信推定"
      }[poem.locationInference.confidence]
    },
    image: null,
    lines: poem.lines,
    quote: poem.firstLine,
    background: poem.evidence || poem.locationInference.basis,
    meaning: poem.reading.plain,
    subtext: `${poem.reading.insight} ${poem.reading.caveat}`,
    lifeStage: poem.yearLabel || "推定时期",
    sourceNote:
      `${poem.locationInference.basis}；地点置信度：${poem.locationInference.confidence}。` +
      "正文来自开放古诗词语料，推定信息与史实分开展示。"
  });
}
const mappedPoems = [...mappedByTitle.values()];

const placeMap = new Map();
for (const poem of mappedPoems) {
  const key = poem.location.key || poem.location.modern;
  if (!placeMap.has(key)) {
    const meta = placeMeta.get(key);
    placeMap.set(key, {
      key,
      title: meta?.name || poem.location.historical,
      modern: meta?.modern || poem.location.modern,
      region: poem.location.region,
      lat: meta?.lat ?? poem.location.lat,
      lng: meta?.lon ?? poem.location.lng,
      poems: []
    });
  }
  placeMap.get(key).poems.push(poem);
}
const places = [...placeMap.values()];
places.forEach((place) =>
  place.poems.sort(
    (a, b) => (a.year ?? a.yearStart ?? 9999) - (b.year ?? b.yearStart ?? 9999)
  )
);

const elements = {
  count: document.querySelector("#poem-count"),
  collectionLabel: document.querySelector("#collection-label"),
  mapTitleKicker: document.querySelector("#map-title-kicker"),
  mapTitleText: document.querySelector("#map-title-text"),
  placePanel: document.querySelector("#place-panel"),
  placeRegion: document.querySelector("#place-region"),
  placeTitle: document.querySelector("#place-title"),
  placeSummary: document.querySelector("#place-summary"),
  placePoems: document.querySelector("#place-poems"),
  closePlace: document.querySelector("#close-place"),
  card: document.querySelector("#detail-card"),
  media: document.querySelector(".detail-media"),
  image: document.querySelector("#detail-image"),
  mediaPlaceholder: document.querySelector("#media-placeholder"),
  year: document.querySelector("#detail-year"),
  place: document.querySelector("#detail-place"),
  meta: document.querySelector("#detail-meta"),
  title: document.querySelector("#detail-title"),
  stage: document.querySelector("#detail-stage"),
  quote: document.querySelector("#detail-quote"),
  meaning: document.querySelector("#detail-meaning"),
  subtext: document.querySelector("#detail-subtext"),
  background: document.querySelector("#detail-background"),
  source: document.querySelector("#detail-source"),
  lines: document.querySelector("#detail-lines"),
  closeDetail: document.querySelector("#close-detail"),
  reset: document.querySelector("#reset-view"),
  context: document.querySelector("#map-context"),
  hint: document.querySelector("#map-hint"),
  mapError: document.querySelector("#map-error"),
  openCorpus: document.querySelector("#open-corpus"),
  corpusPanel: document.querySelector("#corpus-panel"),
  closeCorpus: document.querySelector("#close-corpus"),
  corpusTitle: document.querySelector("#corpus-title"),
  corpusSummary: document.querySelector("#corpus-summary"),
  corpusSearch: document.querySelector("#corpus-search"),
  authorSearch: document.querySelector("#author-search"),
  authorSuggestions: document.querySelector("#author-suggestions"),
  corpusCount: document.querySelector("#corpus-result-count"),
  corpusResults: document.querySelector("#corpus-results"),
  corpusMore: document.querySelector("#corpus-more"),
  yearStart: document.querySelector("#year-start"),
  yearEnd: document.querySelector("#year-end"),
  timeLabel: document.querySelector("#time-range-label"),
  rangeProgress: document.querySelector("#range-progress"),
  resetTime: document.querySelector("#reset-time")
};

elements.count.textContent = `全集 3,165 · 地图 ${mappedPoems.length}`;

const map = L.map("map", {
  zoomControl: false,
  minZoom: 3,
  maxZoom: 14,
  attributionControl: true
});
L.control.zoom({ position: "bottomright" }).addTo(map);
const globalMarkerLayer = L.layerGroup().addTo(map);

const baseTiles = L.tileLayer("/tiles/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors · Esri fallback'
});
baseTiles.on("load", () => elements.mapError.classList.remove("is-visible"));
baseTiles.on("tileerror", () => elements.mapError.classList.add("is-visible"));
baseTiles.addTo(map);

function filteredPoems(place) {
  return place.poems.filter((poem) => {
    const start = poem.year ?? poem.yearStart;
    const end = poem.year ?? poem.yearEnd;
    return start != null && end != null && start <= endYear && end >= startYear;
  });
}

function placeMarkerHtml(place, active = false) {
  const count = filteredPoems(place).length;
  return `
    <div class="poem-marker place-marker${active ? " is-active" : ""}">
      <span class="marker-count">${count}</span>
      <div class="marker-label">
        <b>${place.title}</b>
        <small>${place.modern} · ${count} 首</small>
      </div>
    </div>
  `;
}

function placeIcon(place, active = false) {
  return L.divIcon({
    className: "",
    html: placeMarkerHtml(place, active),
    iconSize: [50, 50],
    iconAnchor: [25, 44]
  });
}

function updatePlaceMarkers() {
  for (const place of places) {
    const marker = markerByPlace.get(place.key);
    const count = filteredPoems(place).length;
    if (globalMode || currentDynasty !== "song" || count === 0) {
      if (map.hasLayer(marker)) marker.remove();
      continue;
    }
    if (!map.hasLayer(marker)) marker.addTo(map);
    marker.setIcon(placeIcon(place, place.key === selectedPlaceKey));
  }
}

function poemListItem(poem) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "place-poem-card";
  button.innerHTML = `
    <span class="place-poem-year">${poem.year || (poem.yearStart ? `${poem.yearStart}–${poem.yearEnd}` : "未系年")}</span>
    <span class="place-poem-main">
      <strong>${poem.title}</strong>
      <small>${poem.age ? `${poem.age} ${poem.ageType} · ` : ""}${poem.location.site} · ${poem.location.accuracy}</small>
      <q>${poem.quote}</q>
    </span>
    <span class="place-poem-arrow" aria-hidden="true">›</span>
  `;
  button.addEventListener("click", () => selectPoem(poem, "place"));
  return button;
}

function selectPlace(key, moveMap = false) {
  const place = placeMap.get(key);
  if (!place) return;
  const works = filteredPoems(place);
  if (!works.length) return;

  selectedPlaceKey = key;
  updatePlaceMarkers();
  elements.card.classList.remove("is-visible");
  elements.corpusPanel.classList.remove("is-visible");
  elements.placeRegion.textContent = `中国 · ${place.region} · ${works.length} 首作品`;
  elements.placeTitle.textContent = `${place.title}诗词`;
  const firstYear = works[0].year ?? works[0].yearStart;
  const lastYear = works[works.length - 1].year ?? works[works.length - 1].yearEnd;
  elements.placeSummary.textContent =
    `${firstYear}—${lastYear}，含生平推定地点；点击作品查看依据与置信度。`;
  elements.placePoems.replaceChildren(...works.map(poemListItem));
  elements.placePanel.classList.add("is-visible");
  elements.hint.classList.add("is-hidden");
  elements.context.innerHTML = `
    <span class="context-overline">已选择地点</span>
    <strong>${place.region} · ${place.title}</strong>
    <span>${place.modern} · 当前时段 ${works.length} 首</span>
  `;

  if (moveMap) {
    const mobile = window.matchMedia("(max-width: 680px)").matches;
    map.flyTo([place.lat, place.lng], mobile ? 7 : 8, { duration: 0.8 });
    if (!mobile) window.setTimeout(() => map.panBy([190, 0], { animate: true }), 850);
  }
}

function globalPlaceIcon(place, active = false) {
  return L.divIcon({
    className: "",
    html: `
      <div class="poem-marker place-marker${active ? " is-active" : ""}">
        <span class="marker-count">${place.poem_count}</span>
        <div class="marker-label">
          <b>${place.historical_name}</b>
          <small>${place.modern_name} · ${place.poem_count} 首</small>
        </div>
      </div>
    `,
    iconSize: [50, 50],
    iconAnchor: [25, 44]
  });
}

function globalQueryParams() {
  const params = new URLSearchParams({ dynasty: currentDynasty });
  const query = elements.corpusSearch.value.trim();
  if (query) params.set("q", query);
  if (selectedAuthor) params.set("author", selectedAuthor);
  if (genreKeys[corpusType]) params.set("genre", genreKeys[corpusType]);
  return params;
}

async function loadGlobalPlaces({ fit = true } = {}) {
  if (!globalMode) return;
  const requestId = ++globalPlaceRequestId;
  const response = await fetch(`/api/places?${globalQueryParams()}`);
  const payload = await response.json();
  if (requestId !== globalPlaceRequestId || !response.ok) return;

  globalPlaces = payload.items || [];
  globalMarkerLayer.clearLayers();
  selectedGlobalPlaceId = null;
  for (const place of globalPlaces) {
    const marker = L.marker([place.lat, place.lng], {
      icon: globalPlaceIcon(place),
      title: `${place.historical_name}诗词`
    });
    marker.on("click", () => selectGlobalPlace(place, true));
    marker.addTo(globalMarkerLayer);
  }
  if (fit && globalPlaces.length) {
    map.fitBounds(
      L.latLngBounds(globalPlaces.map((place) => [place.lat, place.lng])),
      {
        paddingTopLeft: [150, 140],
        paddingBottomRight: [150, 190],
        maxZoom: 5,
        animate: true
      }
    );
  }
  const mappedCount = globalPlaces.reduce((sum, place) => sum + place.poem_count, 0);
  elements.context.innerHTML = `
    <span class="context-overline">${dynastyNames[currentDynasty]}代 · 明确地名</span>
    <strong>${globalPlaces.length} 个地点</strong>
    <span>${mappedCount.toLocaleString()} 条作品地点关联；仅采用题目明示地名</span>
  `;
  elements.hint.classList.toggle("is-hidden", !globalPlaces.length);
}

function normalizeGlobalPoem(poem, place) {
  const lines = poem.body.match(/[^。！？]+[。！？]?/g) || [poem.body];
  const reading = basicReading(poem);
  return {
    id: poem.id,
    title: poem.title,
    author: poem.author,
    form: genreNames[poem.genre] || poem.genre,
    lines,
    quote: lines[0],
    location: {
      historical: place.historical_name,
      modern: place.modern_name,
      site: "题目所指地点",
      accuracy: "题名高置信 · 城市级示意"
    },
    lifeStage: poem.dynasty_raw,
    meaning: reading.plain,
    subtext: `${reading.insight} ${reading.caveat}`,
    background: `作品题目明确提到“${place.historical_name}”相关地名，因此将它关联到此处；这不等于已经证明作品就在该坐标写成。`,
    sourceNote: `正文来源：${poem.source}。地图坐标取现代城市中心，仅表示作品相关地点。`
  };
}

async function selectGlobalPlace(place, moveMap = false) {
  selectedGlobalPlaceId = place.id;
  const params = globalQueryParams();
  params.set("place_id", place.id);
  params.set("limit", "100");
  const response = await fetch(`/api/poems?${params}`);
  const payload = await response.json();
  if (!response.ok) return;
  const works = payload.items.map((poem) => normalizeGlobalPoem(poem, place));

  elements.card.classList.remove("is-visible");
  elements.corpusPanel.classList.remove("is-visible");
  elements.placeRegion.textContent =
    `${dynastyNames[currentDynasty]} · ${place.modern_name} · ${payload.total} 首作品`;
  elements.placeTitle.textContent = `${place.historical_name}诗词`;
  elements.placeSummary.textContent = payload.total > 100
    ? "按语料顺序展示前 100 首；可配合作者、体裁和关键词进一步筛选。"
    : "地点来自题目中的明确地名；坐标为城市级示意。";
  elements.placePoems.replaceChildren(...works.map((poem) => {
    const item = poemListItem(poem);
    item.addEventListener("click", () => {
      detailOrigin = "global-place";
    });
    return item;
  }));
  elements.placePanel.classList.add("is-visible");
  elements.hint.classList.add("is-hidden");
  elements.context.innerHTML = `
    <span class="context-overline">已选择地点</span>
    <strong>${place.historical_name}</strong>
    <span>${place.modern_name} · ${payload.total} 首</span>
  `;
  if (moveMap) map.flyTo([place.lat, place.lng], 7, { duration: 0.8 });
}

function fillDetail(poem) {
  const hasImage = Boolean(poem.image);
  elements.media.classList.toggle("is-placeholder", !hasImage);
  elements.image.hidden = !hasImage;
  if (hasImage) {
    elements.image.src = poem.image;
    elements.image.alt = `${poem.location?.site || poem.title}时期意境插画`;
  }
  elements.mediaPlaceholder.textContent = poem.title.slice(0, 12);
  elements.year.textContent = poem.year || poem.yearLabel ||
    (poem.yearStart ? `约 ${poem.yearStart}—${poem.yearEnd}` : "未系年");
  elements.place.textContent = poem.location
    ? `${poem.location.historical} · ${poem.location.site}`
    : "地点尚未考定";
  elements.meta.textContent =
    `${poem.author || "苏轼"} · ${poem.age ? `${poem.age} 虚岁 · ` : ""}${poem.form}`;
  elements.title.textContent = poem.title;
  elements.stage.textContent = poem.lifeStage || (poem.year ? `${poem.year} 年` : "未系年");
  elements.quote.textContent = poem.quote || poem.lines[0] || "";
  elements.meaning.textContent = poem.meaning || "这篇作品尚未完成逐篇白话解读。";
  elements.subtext.textContent = poem.subtext || "全集文本已收录，系年、地点与解读将按证据逐步补充。";
  elements.background.textContent = poem.background || "创作背景尚未可靠系定。";
  elements.source.textContent = `资料说明：${poem.sourceNote || "正文来自开放古诗词语料；待与权威校注本复核。"}`;
  elements.lines.innerHTML = poem.lines.map((line) => `<p>${line}</p>`).join("");
}

function selectPoem(poem, origin) {
  detailOrigin = origin;
  fillDetail(poem);
  setActiveTab("plain");
  elements.placePanel.classList.remove("is-visible");
  elements.corpusPanel.classList.remove("is-visible");
  elements.card.classList.add("is-visible");
}

function showAllLocations() {
  selectedPlaceKey = null;
  updatePlaceMarkers();
  elements.placePanel.classList.remove("is-visible");
  elements.card.classList.remove("is-visible");
  if (globalMode) {
    selectedGlobalPlaceId = null;
    loadGlobalPlaces();
    return;
  }
  if (currentDynasty !== "song") {
    elements.context.innerHTML = `
      <span class="context-overline">${dynastyNames[currentDynasty]}代作品库</span>
      <strong>作品已入库，作者行迹待补</strong>
      <span>可从右上角总库按作者、题目或诗句检索</span>
    `;
    elements.hint.classList.add("is-hidden");
    return;
  }
  const activePlaces = places.filter((place) => filteredPoems(place).length);
  if (activePlaces.length) {
    map.fitBounds(
      L.latLngBounds(activePlaces.map((place) => [place.lat, place.lng])),
      {
        paddingTopLeft: [150, 140],
        paddingBottomRight: [150, 190],
        maxZoom: 5,
        animate: true
      }
    );
  }
  const activeCount = activePlaces.reduce(
    (sum, place) => sum + filteredPoems(place).length,
    0
  );
  elements.context.innerHTML = `
    <span class="context-overline">地图总览 · ${startYear}—${endYear}</span>
    <strong>宋 · ${activePlaces.length} 个创作地点</strong>
    <span>${activeCount} 首已定位作品；全集 3,165 篇可检索</span>
  `;
  elements.hint.classList.remove("is-hidden");
}

function setActiveTab(tabName) {
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `tab-${tabName}`);
  });
}

function syncTimeline() {
  startYear = Number(elements.yearStart.value);
  endYear = Number(elements.yearEnd.value);
  if (startYear > endYear) {
    [startYear, endYear] = [endYear, startYear];
    elements.yearStart.value = startYear;
    elements.yearEnd.value = endYear;
  }
  const total = 1101 - 1037;
  const left = ((startYear - 1037) / total) * 100;
  const right = ((endYear - 1037) / total) * 100;
  elements.rangeProgress.style.left = `${left}%`;
  elements.rangeProgress.style.width = `${right - left}%`;
  elements.timeLabel.textContent =
    startYear === 1037 && endYear === 1101
      ? "1037—1101 · 苏轼一生"
      : `${startYear}—${endYear}`;
  if (selectedPlaceKey && filteredPoems(placeMap.get(selectedPlaceKey)).length) {
    selectPlace(selectedPlaceKey, false);
  } else {
    showAllLocations();
  }
}

function basicReading(poem) {
  const text = `${poem.title}${poem.body}`;
  const themes = [
    ["悼亡与追忆", /亡|哭|挽|墓|梦|祭|哀|悼/],
    ["离别与怀人", /送|别|寄|怀|忆|留别|赠/],
    ["山水与行旅", /山|水|江|湖|溪|海|游|舟|行|登|寺/],
    ["四时与物候", /春|夏|秋|冬|雪|雨|月|花|梅|竹|荷/],
    ["仕途与身世", /狱|谪|官|朝|诏|御史|罪|归田/],
    ["佛道与哲思", /佛|禅|僧|道士|罗汉|观音|经/]
  ];
  const theme = themes.find(([, pattern]) => pattern.test(text))?.[0] || "人生感怀";
  const first = poem.body.match(/[^。！？]+[。！？]?/)?.[0] || poem.body.slice(0, 50);
  return {
    plain: `这篇作品从“${first.slice(0, 48)}”写起，主要围绕${theme}展开。可先关注作者怎样从眼前景物或具体事件，转入自己的情绪与判断。`,
    insight: "用人话说，它不只是记录景物，也是在借景、叙事或用典整理当时的感受。结尾往往是理解全篇态度的关键。",
    caveat: "这是根据题目与正文关键词生成的基础导读，不替代权威注本的逐句笺释。"
  };
}

function corpusItem(poem) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "corpus-item";
  button.innerHTML = `
    <span>
      <strong>${poem.title}</strong>
      <small>${poem.dynasty_raw} · ${poem.author} · ${genreNames[poem.genre] || poem.genre}</small>
      <q>${poem.body.slice(0, 80)}</q>
    </span>
    <span aria-hidden="true">›</span>
  `;
  button.addEventListener("click", () => {
    const suShi = poem.author === "苏轼"
      ? suShiByTitle.get(titleKey(poem.title))
      : null;
    const reading = suShi?.reading || basicReading(poem);
    const lines = poem.body.match(/[^。！？]+[。！？]?/g) || [poem.body];
    selectPoem(
      {
        id: poem.id,
        title: poem.title,
        author: poem.author,
        form: genreNames[poem.genre] || poem.genre,
        lines,
        quote: lines[0],
        lifeStage: poem.dynasty_raw,
        meaning: reading.plain,
        subtext: `${reading.insight} ${reading.caveat}`,
        background: suShi?.evidence || "当前语料未提供可靠的创作年份与背景。",
        sourceNote: `正文来源：${poem.source}。无生平或系年证据时不虚构地点。`
      },
      "corpus"
    );
  });
  return button;
}

async function renderCorpus({ append = false } = {}) {
  if (!append) {
    corpusOffset = 0;
    elements.corpusResults.replaceChildren();
  }
  const params = new URLSearchParams({
    dynasty: currentDynasty,
    limit: "40",
    offset: String(corpusOffset)
  });
  const query = elements.corpusSearch.value.trim();
  if (query) params.set("q", query);
  if (selectedAuthor) params.set("author", selectedAuthor);
  if (genreKeys[corpusType]) params.set("genre", genreKeys[corpusType]);

  elements.corpusCount.textContent = "正在查询…";
  const response = await fetch(`/api/poems?${params}`);
  const payload = await response.json();
  if (!response.ok) {
    elements.corpusCount.textContent = payload.error || "查询失败";
    return;
  }
  corpusTotal = payload.total;
  const nodes = payload.items.map(corpusItem);
  elements.corpusResults.append(...nodes);
  corpusOffset += payload.items.length;
  elements.corpusCount.textContent =
    `${dynastyNames[currentDynasty]} · ${selectedAuthor || "全部作者"} · ${corpusTotal.toLocaleString()} 篇`;
  elements.corpusMore.hidden = corpusOffset >= corpusTotal;
  if (globalMode && !append) loadGlobalPlaces();
}

async function loadAuthorSuggestions() {
  const requestId = ++authorRequestId;
  const params = new URLSearchParams({
    dynasty: currentDynasty,
    q: elements.authorSearch.value.trim(),
    limit: "30"
  });
  const response = await fetch(`/api/authors?${params}`);
  const payload = await response.json();
  if (requestId !== authorRequestId) return;
  elements.authorSuggestions.replaceChildren(
    ...(payload.items || []).map((author) => {
      const button = document.createElement("button");
      button.type = "button";
      button.innerHTML = `<span>${author.name}</span><small>${author.poem_count.toLocaleString()} 篇</small>`;
      button.addEventListener("click", () => {
        selectedAuthor = author.name;
        elements.authorSearch.value = author.name;
        elements.authorSuggestions.replaceChildren();
        updateCollectionHeader();
        renderCorpus();
      });
      return button;
    })
  );
}

async function openCorpus() {
  elements.placePanel.classList.remove("is-visible");
  elements.card.classList.remove("is-visible");
  elements.corpusPanel.classList.add("is-visible");
  elements.corpusTitle.textContent =
    `${dynastyNames[currentDynasty]}代${selectedAuthor ? ` · ${selectedAuthor}` : ""}`;
  elements.corpusSummary.textContent = "公版古典作品，支持作者、题目与正文检索";
  await renderCorpus();
  window.setTimeout(() => elements.corpusSearch.focus(), 250);
}

function updateCollectionHeader() {
  if (currentDynasty === "song" && !globalMode) {
    elements.collectionLabel.textContent = "北宋 · 苏轼诗词地图";
    elements.count.textContent = `全集 3,165 · 地图 ${mappedPoems.length}`;
    elements.mapTitleKicker.textContent = "中国东部 · 公元 1037—1101";
    elements.mapTitleText.textContent = "沿着行迹，阅读苏轼的一生";
    return;
  }
  const name = dynastyNames[currentDynasty];
  elements.collectionLabel.textContent =
    `${name}代 · ${selectedAuthor || "全部作者"}`;
  elements.count.textContent = `${dynastyCounts[currentDynasty].toLocaleString()} 篇`;
  elements.mapTitleKicker.textContent = `${name}代作品库`;
  elements.mapTitleText.textContent = "作者生平与地点资料持续补充中";
}

for (const place of places) {
  const marker = L.marker([place.lat, place.lng], {
    icon: placeIcon(place),
    title: `${place.title}诗词`
  }).addTo(map);
  marker.on("click", () => selectPlace(place.key, true));
  markerByPlace.set(place.key, marker);
}

const chronologicalPlaces = lifePlaces
  .filter((place) => placeMap.has(place.id))
  .map((place) => [place.lat, place.lon]);
L.polyline(chronologicalPlaces, {
  color: "#973d2c",
  weight: 2,
  opacity: 0.42,
  dashArray: "4 9",
  lineCap: "round",
  interactive: false
}).addTo(map);

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
});
document.querySelectorAll(".corpus-filter").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".corpus-filter").forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });
    corpusType = button.dataset.type;
    renderCorpus();
  });
});
document.querySelectorAll(".dynasty-button").forEach((button) => {
  button.addEventListener("click", () => {
    currentDynasty = button.dataset.dynasty;
    globalMode = true;
    selectedAuthor = "";
    elements.authorSearch.value = "";
    document.querySelectorAll(".dynasty-button").forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });
    document.querySelector(".timeline-main").classList.toggle(
      "is-disabled",
      globalMode
    );
    elements.timeLabel.textContent = "全库作品多数尚无可靠系年";
    updateCollectionHeader();
    updatePlaceMarkers();
    showAllLocations();
    openCorpus();
  });
});

elements.closePlace.addEventListener("click", showAllLocations);
elements.closeDetail.addEventListener("click", () => {
  elements.card.classList.remove("is-visible");
  if (detailOrigin === "corpus") openCorpus();
  else if (detailOrigin === "global-place" && selectedGlobalPlaceId) {
    const place = globalPlaces.find((item) => item.id === selectedGlobalPlaceId);
    if (place) selectGlobalPlace(place, false);
  }
  else if (selectedPlaceKey) selectPlace(selectedPlaceKey, false);
});
elements.reset.addEventListener("click", showAllLocations);
elements.openCorpus.addEventListener("click", openCorpus);
elements.closeCorpus.addEventListener("click", () => {
  elements.corpusPanel.classList.remove("is-visible");
});
elements.corpusSearch.addEventListener("input", () => {
  window.clearTimeout(authorTimer);
  authorTimer = window.setTimeout(() => renderCorpus(), 250);
});
elements.authorSearch.addEventListener("input", () => {
  selectedAuthor = "";
  window.clearTimeout(authorTimer);
  authorTimer = window.setTimeout(loadAuthorSuggestions, 220);
});
elements.authorSearch.addEventListener("focus", loadAuthorSuggestions);
elements.corpusMore.addEventListener("click", () => renderCorpus({ append: true }));
elements.yearStart.addEventListener("input", syncTimeline);
elements.yearEnd.addEventListener("input", syncTimeline);
elements.resetTime.addEventListener("click", () => {
  elements.yearStart.value = 1037;
  elements.yearEnd.value = 1101;
  syncTimeline();
});

syncTimeline();
