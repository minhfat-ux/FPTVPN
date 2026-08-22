#!/usr/bin/env python3
"""
Small local RAG helper for this repo.

It uses SQLite FTS5, so it works offline without Chroma/FAISS/LangChain or an
embedding model. The index DB is written under .privatevpn/tmp/ by default.
"""

from __future__ import annotations

import argparse
import os
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = ROOT / ".privatevpn" / "tmp" / "rag.sqlite"
INCLUDED_SUFFIXES = {
    ".swift",
    ".js",
    ".ts",
    ".json",
    ".md",
    ".yml",
    ".yaml",
    ".plist",
    ".entitlements",
    ".sh",
    ".txt",
}
EXCLUDED_DIRS = {
    ".git",
    ".tmp",
    "secrets",
    "node_modules",
    "Products",
    "DerivedData",
    "PrivateVPN.xcodeproj",
    ".build",
    ".swiftpm",
}


def iter_files(root: Path):
    for current_root, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS and not d.startswith("._")]
        current = Path(current_root)
        for name in files:
            if name.startswith("._"):
                continue
            path = current / name
            if path.suffix not in INCLUDED_SUFFIXES:
                continue
            if path.stat().st_size > 1_000_000:
                continue
            yield path


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="ignore")


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(db_path)
    con.execute("pragma journal_mode=wal")
    return con


def rebuild(db_path: Path) -> None:
    con = connect(db_path)
    con.execute("drop table if exists docs")
    con.execute("create virtual table docs using fts5(path, title, body)")

    rows = []
    for path in iter_files(ROOT):
        rel = path.relative_to(ROOT).as_posix()
        rows.append((rel, path.name, read_text(path)))

    con.executemany("insert into docs(path, title, body) values (?, ?, ?)", rows)
    con.commit()
    con.close()
    print(f"indexed {len(rows)} files -> {db_path.relative_to(ROOT)}")


def search(db_path: Path, query: str, limit: int) -> None:
    con = connect(db_path)
    exists = con.execute(
        "select name from sqlite_master where type='table' and name='docs'"
    ).fetchone()
    if not exists:
        rebuild(db_path)
        con = connect(db_path)

    sql = """
        select
            path,
            snippet(docs, 2, '[', ']', ' ... ', 18) as snippet,
            bm25(docs) as rank
        from docs
        where docs match ?
        order by rank
        limit ?
    """
    try:
        rows = con.execute(sql, (query, limit)).fetchall()
    except sqlite3.OperationalError as error:
        raise SystemExit(f"invalid query: {error}") from error

    if not rows:
        print("no matches")
        return

    for index, (path, snippet, _rank) in enumerate(rows, start=1):
        print(f"{index}. {path}")
        print(f"   {snippet}")
    con.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Local SQLite FTS RAG helper")
    parser.add_argument("query", nargs="*", help="Search query")
    parser.add_argument("--rebuild", action="store_true", help="Rebuild index")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="SQLite index path")
    parser.add_argument("--limit", type=int, default=8, help="Max search results")
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.is_absolute():
        db_path = ROOT / db_path

    if args.rebuild:
        rebuild(db_path)

    if args.query:
        search(db_path, " ".join(args.query), args.limit)
    elif not args.rebuild:
        parser.print_help()


if __name__ == "__main__":
    main()
