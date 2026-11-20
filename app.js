const poems = window.POEMS || [];
const markerById = new Map();
let selectedPoemId = null;

const elements = {
  list: document.querySelector("#poem-list"),
  count: document.querySelector("#poem-count"),
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
  close: document.querySelector("#close-detail"),
  reset: document.querySelector("#reset-view"),
  context: document.querySelector("#map-context"),
  hint: document.querySelector("#map-hint")
};

elements.count.textContent = `${poems.length} 首`;

const map = L.map("map", {
  zoomControl: false,
  minZoom: 4,
  maxZoom: 13,
  attributionControl: true
});

L.control.zoom({ position: "bottomright" }).addTo(map);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

function markerHtml(poem, active = false) {
  const [province, city] = poem.location.modern.match(/^(.{2})(.*)$/)?.slice(1) || [
    "",
    poem.location.modern
  ];
  return `
    <div class="poem-marker${active ? " is-active" : ""}">
      <span>${poem.year.toString().slice(-2)}</span>
      <div class="marker-label">
        <b>${poem.location.historical}</b>
        <small>${province} · ${city}</small>
      </div>
    </div>
  `;
}

function makeMarker(poem) {
  const icon = L.divIcon({
    className: "",
    html: markerHtml(poem),
    iconSize: [42, 42],
    iconAnchor: [21, 38]
  });

  const marker = L.marker([poem.location.lat, poem.location.lng], {
    icon,
    title: `${poem.title}，${poem.location.modern}`
  }).addTo(map);

  marker.on("click", () => selectPoem(poem.id, true));
  markerById.set(poem.id, marker);
}

function makeListItem(poem) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "poem-item";
  button.dataset.poemId = poem.id;
  button.innerHTML = `
    <span class="poem-item-top">
      <span class="poem-item-title">${poem.title}</span>
      <span class="poem-item-year">${poem.year}</span>
    </span>
    <span class="poem-item-bottom">
      <span>${poem.location.historical} · ${poem.location.modern}</span>
      <span>${poem.age} ${poem.ageType}</span>
    </span>
  `;
  button.addEventListener("click", () => selectPoem(poem.id, true));
  elements.list.appendChild(button);
}

function updateSelectionStyles() {
  document.querySelectorAll(".poem-item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.poemId === selectedPoemId);
  });

  poems.forEach((poem) => {
    const marker = markerById.get(poem.id);
    marker.setIcon(
      L.divIcon({
        className: "",
        html: markerHtml(poem, poem.id === selectedPoemId),
        iconSize: [42, 42],
        iconAnchor: [21, 38]
      })
    );
  });
}

function fillDetail(poem) {
  elements.image.src = poem.image;
  elements.image.alt = `${poem.title}意境插画`;
  elements.year.textContent = poem.year;
  elements.place.textContent = `${poem.location.historical} · ${poem.location.modern}`;
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

function selectPoem(id, moveMap = false) {
  const poem = poems.find((item) => item.id === id);
  if (!poem) return;

  selectedPoemId = poem.id;
  fillDetail(poem);
  updateSelectionStyles();
  setActiveTab("plain");
  elements.card.classList.add("is-visible");
  elements.hint.classList.add("is-hidden");
  elements.context.innerHTML = `
    <span class="context-overline">作品地点 · ${poem.location.accuracy}</span>
    <strong>中国 · ${poem.location.modern}</strong>
    <span>古称 ${poem.location.historical} · ${poem.location.lat.toFixed(3)}°N，${poem.location.lng.toFixed(3)}°E</span>
  `;

  if (moveMap) {
    const mobile = window.matchMedia("(max-width: 680px)").matches;
    map.flyTo(
      [poem.location.lat, poem.location.lng],
      mobile ? 7 : 8,
      { duration: 0.75 }
    );
    if (!mobile) {
      window.setTimeout(() => map.panBy([170, 0], { animate: true }), 800);
    }
  }
}

function showAllLocations() {
  const bounds = L.latLngBounds(
    poems.map((poem) => [poem.location.lat, poem.location.lng])
  );
  map.fitBounds(bounds, {
    paddingTopLeft: [110, 120],
    paddingBottomRight: [110, 120],
    maxZoom: 6,
    animate: true
  });
  elements.context.innerHTML = `
    <span class="context-overline">当前范围</span>
    <strong>中国 · 山东 ↘ 湖北</strong>
    <span>沿虚线查看苏轼的人生行旅</span>
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

poems.forEach((poem) => {
  makeListItem(poem);
  makeMarker(poem);
});

const route = L.polyline(
  poems.map((poem) => [poem.location.lat, poem.location.lng]),
  {
    color: "#973d2c",
    weight: 3,
    opacity: 0.7,
    dashArray: "5 10",
    lineCap: "round",
    interactive: false
  }
).addTo(map);
route.bringToBack();

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

elements.close.addEventListener("click", () => {
  elements.card.classList.remove("is-visible");
  selectedPoemId = null;
  updateSelectionStyles();
  showAllLocations();
});

elements.reset.addEventListener("click", showAllLocations);

map.on("click", () => {
  if (window.matchMedia("(max-width: 680px)").matches) {
    elements.card.classList.remove("is-visible");
  }
});

showAllLocations();
