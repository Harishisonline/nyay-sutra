"""The statute corpus: 12 Acts, their sections, and the browse-by-topic categories."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache

from app.config import API_ROOT

CORPUS_PATH = API_ROOT / "app" / "data" / "seed_corpus.json"


@dataclass(frozen=True)
class Act:
    id: str
    short_name: str
    full_name: str
    jurisdiction: str
    state: str | None
    enacted_year: int
    repealed_year: int | None
    official_url: str | None
    categories: tuple[str, ...]


@dataclass(frozen=True)
class Section:
    act_id: str
    section: str
    title: str
    body: str
    keywords: str
    categories: tuple[str, ...]

    @property
    def key(self) -> str:
        return f"{self.act_id}::{self.section}"

    def passage(self, act: Act) -> str:
        """Text that gets embedded. Title, act and body, plus native-language keywords."""
        return f"{act.full_name}, Section {self.section}: {self.title}. {self.body} {self.keywords}"


@dataclass(frozen=True)
class CategoryInfo:
    id: str
    title: str
    summary: str
    icon: str
    sample_questions: tuple[str, ...]


@dataclass
class Corpus:
    version: str
    acts: dict[str, Act]
    sections: list[Section]
    categories: list[CategoryInfo]
    _by_key: dict[str, Section] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self._by_key = {s.key: s for s in self.sections}

    def get(self, act_id: str, section: str) -> Section | None:
        return self._by_key.get(f"{act_id}::{normalise_section(section)}")

    def act(self, act_id: str) -> Act:
        return self.acts[act_id]

    def sections_in(self, category: str) -> list[Section]:
        return [s for s in self.sections if category in s.categories]


def normalise_section(section: str) -> str:
    cleaned = section.strip().removeprefix("Section").removeprefix("section").removeprefix("s.").strip()
    return cleaned.replace(" ", "")


@lru_cache
def get_corpus() -> Corpus:
    raw = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))
    acts = {
        a["id"]: Act(
            id=a["id"],
            short_name=a["short_name"],
            full_name=a["full_name"],
            jurisdiction=a["jurisdiction"],
            state=a.get("state"),
            enacted_year=a["enacted_year"],
            repealed_year=a.get("repealed_year"),
            official_url=a.get("official_url"),
            categories=tuple(a.get("categories", [])),
        )
        for a in raw["acts"]
    }
    sections = [
        Section(
            act_id=s["act_id"],
            section=s["section"],
            title=s["title"],
            body=s["body"],
            keywords=s.get("keywords", ""),
            categories=tuple(s.get("categories", [])),
        )
        for s in raw["sections"]
    ]
    for s in sections:
        if s.act_id not in acts:
            raise ValueError(f"Section {s.key} references unknown act")
    categories = [
        CategoryInfo(
            id=c["id"],
            title=c["title"],
            summary=c["summary"],
            icon=c["icon"],
            sample_questions=tuple(c.get("sample_questions", [])),
        )
        for c in raw["categories"]
    ]
    return Corpus(version=raw["version"], acts=acts, sections=sections, categories=categories)
