const poems = window.POEMS || [];
const placeMap = new Map();
const markerByPlace = new Map();
let selectedPlaceKey = null;

for (const poem of poems) {
  const key = poem.location.key || poem.location.modern;
  if (!placeMap.has(key)) {
    placeMap.set(key, {
      key,
      title: key === "huangzhou" ? "黄州" : poem.location.historical,
      modern: key === "huangzhou" ? "湖北黄冈" : poem.location.modern,
      region: poem.location.region,
      lat: poem.location.lat,
      lng: poem.location.lng,
      poems: []
    });
  }
  placeMap.get(key).poems.push(poem);
}

const places = [...placeMap.values()];
places.forEach((place) => place.poems.sort((a, b) => a.year - b.year));

const elements = {
  count: document.querySelector("#poem-count"),
  placePanel: document.querySelector("#place-panel"),
  placeRegion: document.querySelector("#place-region"),
  placeTitle: document.querySelector("#place-title"),
  placeSummary: document.querySelector("#place-summary"),
  placePoems: document.querySelector("#place-poems"),
  closePlace: document.querySelector("#close-place"),
  card: document.querySelector("#detail-card"),
  image: document.querySelector("#detail-image"),
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
  mapError: document.querySelector("#map-error")
};

elements.count.textContent = `${poems.length} 首 · ${places.length} 地`;

const map = L.map("map", {
  zoomControl: false,
  minZoom: 4,
  maxZoom: 14,
  attributionControl: true
});

L.control.zoom({ position: "bottomright" }).addTo(map);
const baseTiles = L.tileLayer("/tiles/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors · Esri fallback'
});
baseTiles.on("load", () => elements.mapError.classList.remove("is-visible"));
baseTiles.on("tileerror", () => elements.mapError.classList.add("is-visible"));
baseTiles.addTo(map);

function placeMarkerHtml(place, active = false) {
  return `
    <div class="poem-marker place-marker${active ? " is-active" : ""}">
      <span class="marker-count">${place.poems.length}</span>
      <div class="marker-label">
        <b>${place.title}</b>
        <small>${place.modern} · ${place.poems.length} 首</small>
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
    markerByPlace.get(place.key).setIcon(
      placeIcon(place, place.key === selectedPlaceKey)
    );
  }
}

function poemListItem(poem) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "place-poem-card";
  button.innerHTML = `
    <span class="place-poem-year">${poem.year}</span>
    <span class="place-poem-main">
      <strong>${poem.title}</strong>
      <small>${poem.age} ${poem.ageType} · ${poem.location.site}</small>
      <q>${poem.quote}</q>
    </span>
    <span class="place-poem-arrow" aria-hidden="true">›</span>
  `;
  button.addEventListener("click", () => selectPoem(poem.id));
  return button;
}

function selectPlace(key, moveMap = false) {
  const place = placeMap.get(key);
  if (!place) return;

  selectedPlaceKey = key;
  updatePlaceMarkers();
  elements.card.classList.remove("is-visible");
  elements.placeRegion.textContent = `中国 · ${place.region} · ${place.poems.length} 首作品`;
  elements.placeTitle.textContent = `${place.title}诗词`;
  elements.placeSummary.textContent =
    `${place.poems[0].year}—${place.poems.at(-1).year}，点击任一作品查看全文、年龄与创作背景。`;
  elements.placePoems.replaceChildren(...place.poems.map(poemListItem));
  elements.placePanel.classList.add("is-visible");
  elements.hint.classList.add("is-hidden");
  elements.context.innerHTML = `
    <span class="context-overline">已选择地点</span>
    <strong>${place.region} · ${place.title}</strong>
    <span>${place.modern} · 共收录 ${place.poems.length} 首</span>
  `;

  if (moveMap) {
    const mobile = window.matchMedia("(max-width: 680px)").matches;
    map.flyTo([place.lat, place.lng], mobile ? 7 : 8, { duration: 0.8 });
    if (!mobile) {
      window.setTimeout(() => map.panBy([190, 0], { animate: true }), 850);
    }
  }
}

function fillDetail(poem) {
  elements.image.src = poem.image;
  elements.image.alt = `${poem.location.site}时期意境插画`;
  elements.year.textContent = poem.year;
  elements.place.textContent = `${poem.location.historical} · ${poem.location.site}`;
  elements.meta.textContent = `苏轼 · ${poem.age} ${poem.ageType} · ${poem.form}`;
  elements.title.textContent = poem.title;
  elements.stage.textContent = poem.lifeStage;
  elements.quote.textContent = poem.quote;
  elements.meaning.textContent = poem.meaning;
  elements.subtext.textContent = poem.subtext;
  elements.background.textContent = poem.background;
  elements.source.textContent = `资料说明：${poem.sourceNote}`;
  elements.lines.innerHTML = poem.lines.map((line) => `<p>${line}</p>`).join("");
}

function selectPoem(id) {
  const poem = poems.find((item) => item.id === id);
  if (!poem) return;

  fillDetail(poem);
  setActiveTab("plain");
  elements.placePanel.classList.remove("is-visible");
  elements.card.classList.add("is-visible");
}

function showAllLocations() {
  selectedPlaceKey = null;
  updatePlaceMarkers();
  elements.placePanel.classList.remove("is-visible");
  elements.card.classList.remove("is-visible");
  map.fitBounds(
    L.latLngBounds(places.map((place) => [place.lat, place.lng])),
    {
      paddingTopLeft: [150, 140],
      paddingBottomRight: [150, 140],
      maxZoom: 6,
      animate: true
    }
  );
  elements.context.innerHTML = `
    <span class="context-overline">地图总览</span>
    <strong>中国 · ${places.length} 个创作地点</strong>
    <span>${poems.length} 首诗词，缩放地图继续探索</span>
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

for (const place of places) {
  const marker = L.marker([place.lat, place.lng], {
    icon: placeIcon(place),
    title: `${place.title}，${place.poems.length} 首诗词`
  }).addTo(map);
  marker.on("click", () => selectPlace(place.key, true));
  markerByPlace.set(place.key, marker);
}

L.polyline(
  places.map((place) => [place.lat, place.lng]),
  {
    color: "#973d2c",
    weight: 3,
    opacity: 0.65,
    dashArray: "5 10",
    lineCap: "round",
    interactive: false
  }
).addTo(map);

[
  { name: "山东省", lat: 36.55, lng: 117.2 },
  { name: "河南省", lat: 34.1, lng: 113.6 },
  { name: "安徽省", lat: 31.8, lng: 117.1 },
  { name: "湖北省", lat: 30.8, lng: 112.4 },
  { name: "江苏省", lat: 32.8, lng: 119.1 }
].forEach((place) => {
  L.marker([place.lat, place.lng], {
    interactive: false,
    icon: L.divIcon({
      className: "province-label",
      html: place.name,
      iconSize: [60, 22],
      iconAnchor: [30, 11]
    })
  }).addTo(map);
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
});

elements.closePlace.addEventListener("click", showAllLocations);
elements.closeDetail.addEventListener("click", () => {
  elements.card.classList.remove("is-visible");
  if (selectedPlaceKey) selectPlace(selectedPlaceKey, false);
});
elements.reset.addEventListener("click", showAllLocations);

showAllLocations();
