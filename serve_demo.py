#!/usr/bin/env python3
"""Serve the demo and Cursor-generated artwork from one local origin."""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import URLError
from urllib.parse import parse_qs, unquote, urlparse
from urllib.request import Request, urlopen


DEMO_DIR = Path(__file__).resolve().parent
CORPUS_DB = DEMO_DIR / "corpus.db"
DEFAULT_ASSET_DIR = Path(
    "/Users/liping/.cursor/projects/"
    "Users-liping-Documents-Work-lemnali-agent/assets"
)


class DemoHandler(SimpleHTTPRequestHandler):
    asset_dir: Path
    tile_cache: dict[tuple[int, int, int], bytes] = {}

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.serve_api(parsed.path, parse_qs(parsed.query))
            return
        tile_match = re.fullmatch(r"/tiles/(\d+)/(\d+)/(\d+)\.png", parsed.path)
        if tile_match:
            self.serve_map_tile(*(int(value) for value in tile_match.groups()))
            return
        super().do_GET()

    def db(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            f"file:{CORPUS_DB}?mode=ro",
            uri=True,
            timeout=10,
        )
        connection.row_factory = sqlite3.Row
        return connection

    def send_json(self, payload: object, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def serve_api(self, route: str, query: dict[str, list[str]]) -> None:
        if not CORPUS_DB.exists():
            self.send_json({"error": "语料索引仍在构建"}, 503)
            return
        try:
            if route == "/api/stats":
                with self.db() as db:
                    rows = db.execute("SELECT key, value FROM meta").fetchall()
                self.send_json({row["key"]: json.loads(row["value"]) for row in rows})
                return
            if route == "/api/authors":
                self.serve_authors(query)
                return
            if route == "/api/poems":
                self.serve_poems(query)
                return
            if route == "/api/places":
                self.serve_places(query)
                return
            match = re.fullmatch(r"/api/poem/([a-z]+-[0-9a-f]+-\d+)", route)
            if match:
                with self.db() as db:
                    row = db.execute(
                        "SELECT * FROM poems WHERE id = ?",
                        (match.group(1),),
                    ).fetchone()
                self.send_json(dict(row) if row else {"error": "作品不存在"}, 200 if row else 404)
                return
            self.send_json({"error": "接口不存在"}, 404)
        except (sqlite3.Error, ValueError) as error:
            self.send_json({"error": str(error)}, 500)

    def serve_authors(self, query: dict[str, list[str]]) -> None:
        dynasty = query.get("dynasty", [""])[0]
        keyword = query.get("q", [""])[0].strip()
        limit = min(max(int(query.get("limit", ["50"])[0]), 1), 200)
        conditions = []
        params: list[object] = []
        if dynasty:
            conditions.append("dynasty = ?")
            params.append(dynasty)
        if keyword:
            conditions.append("name LIKE ?")
            params.append(f"%{keyword}%")
        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        params.append(limit)
        with self.db() as db:
            rows = db.execute(
                f"""
                SELECT id, name, dynasty, poem_count, genres
                FROM authors {where}
                ORDER BY poem_count DESC
                LIMIT ?
                """,
                params,
            ).fetchall()
        self.send_json(
            {
                "items": [
                    {
                        **dict(row),
                        "genres": json.loads(row["genres"]),
                    }
                    for row in rows
                ]
            }
        )

    def serve_poems(self, query: dict[str, list[str]]) -> None:
        dynasty = query.get("dynasty", [""])[0]
        author = query.get("author", [""])[0]
        genre = query.get("genre", [""])[0]
        place_id = query.get("place_id", [""])[0]
        keyword = query.get("q", [""])[0].strip()
        limit = min(max(int(query.get("limit", ["30"])[0]), 1), 100)
        offset = max(int(query.get("offset", ["0"])[0]), 0)
        conditions = []
        params: list[object] = []
        if dynasty:
            conditions.append("p.dynasty = ?")
            params.append(dynasty)
        if author:
            conditions.append("p.author = ?")
            params.append(author)
        if genre:
            conditions.append("p.genre = ?")
            params.append(genre)
        if place_id:
            conditions.append(
                "EXISTS (SELECT 1 FROM poem_places pp "
                "WHERE pp.poem_id = p.id AND pp.place_id = ?)"
            )
            params.append(place_id)

        use_fts = len(keyword) >= 3
        if use_fts:
            conditions.insert(0, "poem_fts MATCH ?")
            params.insert(0, f'"{keyword.replace(chr(34), chr(34) * 2)}"')
            source = "poem_fts JOIN poems p ON p.rowid = poem_fts.rowid"
        else:
            source = "poems p"
            if keyword:
                conditions.append("(p.title LIKE ? OR p.author LIKE ? OR p.body LIKE ?)")
                params.extend(
                    [f"%{keyword}%", f"%{keyword}%", f"%{keyword}%"]
                )
        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        with self.db() as db:
            total = db.execute(
                f"SELECT COUNT(*) FROM {source} {where}",
                params,
            ).fetchone()[0]
            rows = db.execute(
                f"""
                SELECT p.id, p.title, p.author, p.dynasty, p.dynasty_raw,
                       p.genre, p.body, p.source, p.canonical
                FROM {source} {where}
                ORDER BY p.canonical DESC, p.rowid
                LIMIT ? OFFSET ?
                """,
                [*params, limit, offset],
            ).fetchall()
        self.send_json(
            {
                "total": total,
                "offset": offset,
                "limit": limit,
                "items": [dict(row) for row in rows],
            }
        )

    def serve_places(self, query: dict[str, list[str]]) -> None:
        dynasty = query.get("dynasty", [""])[0]
        author = query.get("author", [""])[0]
        genre = query.get("genre", [""])[0]
        keyword = query.get("q", [""])[0].strip()
        conditions = []
        params: list[object] = []
        if dynasty:
            conditions.append("p.dynasty = ?")
            params.append(dynasty)
        if author:
            conditions.append("p.author = ?")
            params.append(author)
        if genre:
            conditions.append("p.genre = ?")
            params.append(genre)

        if len(keyword) >= 3:
            conditions.insert(0, "poem_fts MATCH ?")
            params.insert(0, f'"{keyword.replace(chr(34), chr(34) * 2)}"')
            poem_source = "poem_fts JOIN poems p ON p.rowid = poem_fts.rowid"
        else:
            poem_source = "poems p"
            if keyword:
                conditions.append("(p.title LIKE ? OR p.author LIKE ? OR p.body LIKE ?)")
                params.extend([f"%{keyword}%", f"%{keyword}%", f"%{keyword}%"])
        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        with self.db() as db:
            rows = db.execute(
                f"""
                SELECT l.id, l.historical_name, l.modern_name, l.lat, l.lng,
                       COUNT(DISTINCT p.id) AS poem_count
                FROM {poem_source}
                JOIN poem_places pp ON pp.poem_id = p.id
                JOIN places l ON l.id = pp.place_id
                {where}
                GROUP BY l.id
                ORDER BY poem_count DESC, l.historical_name
                """,
                params,
            ).fetchall()
        self.send_json({"items": [dict(row) for row in rows]})

    def serve_map_tile(self, zoom: int, x: int, y: int) -> None:
        cache_key = (zoom, x, y)
        tile = self.tile_cache.get(cache_key)
        if tile is None:
            sources = [
                f"https://tile.openstreetmap.org/{zoom}/{x}/{y}.png",
                (
                    "https://server.arcgisonline.com/ArcGIS/rest/services/"
                    f"World_Topo_Map/MapServer/tile/{zoom}/{y}/{x}"
                ),
            ]
            for source in sources:
                try:
                    request = Request(
                        source,
                        headers={"User-Agent": "SuShiPoetryMapDemo/1.0"},
                    )
                    with urlopen(request, timeout=8) as response:
                        tile = response.read()
                    if tile:
                        self.tile_cache[cache_key] = tile
                        break
                except (OSError, URLError):
                    continue

        if not tile:
            self.send_error(502, "地图瓦片暂时不可用")
            return

        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(tile)))
        self.send_header("Cache-Control", "public, max-age=86400")
        self.end_headers()
        self.wfile.write(tile)

    def translate_path(self, path: str) -> str:
        clean_path = unquote(urlparse(path).path)
        if clean_path.startswith("/generated-assets/"):
            filename = Path(clean_path).name
            return str(self.asset_dir / filename)
        relative = clean_path.lstrip("/") or "index.html"
        return str(DEMO_DIR / relative)

    def end_headers(self) -> None:
        if not self.path.startswith("/tiles/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Su Shi poetry map demo.")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument(
        "--asset-dir",
        type=Path,
        default=Path(os.environ.get("POETRY_MAP_ASSET_DIR", DEFAULT_ASSET_DIR)),
    )
    args = parser.parse_args()

    DemoHandler.asset_dir = args.asset_dir.expanduser().resolve()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), DemoHandler)
    print(f"苏轼诗词地图：http://127.0.0.1:{args.port}", flush=True)
    print(f"配图目录：{DemoHandler.asset_dir}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
