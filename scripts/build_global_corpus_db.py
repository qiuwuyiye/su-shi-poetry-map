#!/usr/bin/env python3
"""Build a queryable SQLite index for the public-domain classical corpus."""

from __future__ import annotations

import glob
import json
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / ".source" / "shiyun-corpus" / "data"
OUTPUT = ROOT / "corpus.db"


def poem_files() -> list[str]:
    return sorted(glob.glob(str(SOURCE / "poems.*.jsonl")))


def main() -> None:
    if OUTPUT.exists():
        OUTPUT.unlink()

    db = sqlite3.connect(OUTPUT)
    db.executescript(
        """
        PRAGMA journal_mode = OFF;
        PRAGMA synchronous = OFF;
        PRAGMA temp_store = MEMORY;
        PRAGMA cache_size = -200000;

        CREATE TABLE poems (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          author TEXT NOT NULL,
          dynasty TEXT NOT NULL,
          dynasty_raw TEXT NOT NULL,
          genre TEXT NOT NULL,
          body TEXT NOT NULL,
          source TEXT NOT NULL,
          canonical INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE authors (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          dynasty TEXT NOT NULL,
          poem_count INTEGER NOT NULL,
          genres TEXT NOT NULL
        );

        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        """
    )

    total = 0
    dynasty_counts: dict[str, int] = {}
    genre_counts: dict[str, int] = {}
    batch: list[tuple] = []

    for filename in poem_files():
        with open(filename, encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                item = json.loads(line)
                provenance = item.get("provenance") or {}
                batch.append(
                    (
                        f'{item["dynasty"]}-{item["id"]}-{total}',
                        item.get("title") or "无题",
                        item["author"],
                        item["dynasty"],
                        item.get("dynasty_raw") or item["dynasty"],
                        item["genre"],
                        item["body"],
                        provenance.get("source") or "",
                        0 if item.get("canonical") is False else 1,
                    )
                )
                total += 1
                dynasty = item["dynasty"]
                genre = item["genre"]
                dynasty_counts[dynasty] = dynasty_counts.get(dynasty, 0) + 1
                genre_counts[genre] = genre_counts.get(genre, 0) + 1
                if len(batch) >= 5000:
                    db.executemany(
                        "INSERT INTO poems VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        batch,
                    )
                    batch.clear()
        print(f"Imported {Path(filename).name}: {total:,}", flush=True)

    if batch:
        db.executemany("INSERT INTO poems VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", batch)

    author_batch = []
    with open(SOURCE / "poets.jsonl", encoding="utf-8") as handle:
        for author_index, line in enumerate(handle, start=1):
            item = json.loads(line)
            author_batch.append(
                (
                    f'{item["dynasty"]}-{item["id"]}-{author_index}',
                    item["name"],
                    item["dynasty"],
                    item["poemCount"],
                    json.dumps(item.get("genres") or [], ensure_ascii=False),
                )
            )
    db.executemany("INSERT INTO authors VALUES (?, ?, ?, ?, ?)", author_batch)

    db.executescript(
        """
        CREATE INDEX idx_poems_dynasty_author
          ON poems(dynasty, author, genre);
        CREATE INDEX idx_authors_dynasty_count
          ON authors(dynasty, poem_count DESC);
        CREATE INDEX idx_authors_name
          ON authors(name);

        CREATE VIRTUAL TABLE poem_fts USING fts5(
          title, author, body,
          content='poems',
          content_rowid='rowid',
          tokenize='trigram'
        );
        INSERT INTO poem_fts(poem_fts) VALUES('rebuild');
        """
    )

    metadata = {
        "total": total,
        "authors": len(author_batch),
        "dynasty_counts": dynasty_counts,
        "genre_counts": genre_counts,
        "source": "Cohenjikan/shiyun-corpus public PD layer",
    }
    db.executemany(
        "INSERT INTO meta VALUES (?, ?)",
        [(key, json.dumps(value, ensure_ascii=False)) for key, value in metadata.items()],
    )
    db.commit()
    db.execute("PRAGMA optimize")
    db.close()
    print(json.dumps(metadata, ensure_ascii=False, indent=2), flush=True)

    # The place index depends on the stable poem IDs created above.
    from build_place_index import main as build_place_index

    build_place_index()


if __name__ == "__main__":
    main()
