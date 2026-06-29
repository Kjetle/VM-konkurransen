#!/usr/bin/env python3
"""Compute Round of 32 teams from group stage results."""

from __future__ import annotations

import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build import FASIT_PATH, canonical_team, normalize_key, parse_competition_csv

GROUPS = [f"Group {c}" for c in "ABCDEFGHIJKL"]

THIRD_PLACE_RANK = {
    normalize_key(canonical_team("Congo DR")): 1,
    normalize_key(canonical_team("Sweden")): 2,
    normalize_key(canonical_team("Ghana")): 3,
    normalize_key(canonical_team("Ecuador")): 4,
    normalize_key(canonical_team("Bosnia and Herzegovina")): 5,
    normalize_key(canonical_team("Algeria")): 6,
    normalize_key(canonical_team("Paraguay")): 7,
    normalize_key(canonical_team("Senegal")): 8,
}


def compute_r32_teams() -> list[str]:
    fasit = parse_competition_csv(FASIT_PATH)
    matches = [m for m in fasit["group_matches"] if m["h"] is not None and m["b"] is not None]

    teams: dict[str, dict] = {}
    for m in matches:
        for side in ("home", "away"):
            name = m[side]
            if name not in teams:
                teams[name] = {"team": name, "group": m["group"], "p": 0, "gf": 0, "ga": 0}

    for m in matches:
        home, away = m["home"], m["away"]
        hs, away_score = m["h"], m["b"]
        teams[home]["gf"] += hs
        teams[home]["ga"] += away_score
        teams[away]["gf"] += away_score
        teams[away]["ga"] += hs
        if hs > away_score:
            teams[home]["p"] += 3
        elif hs < away_score:
            teams[away]["p"] += 3
        else:
            teams[home]["p"] += 1
            teams[away]["p"] += 1

    by_group: dict[str, list[dict]] = {g: [] for g in GROUPS}
    for row in teams.values():
        row["gd"] = row["gf"] - row["ga"]
        by_group[row["group"]].append(row)

    top24: list[str] = []
    third_rows: list[dict] = []
    for group in GROUPS:
        rows = sorted(by_group[group], key=lambda x: (-x["p"], -x["gd"], -x["gf"], x["team"]))
        top24.extend([rows[0]["team"], rows[1]["team"]])
        third_rows.append(rows[2])

    qualified_third = sorted(
        [row for row in third_rows if normalize_key(canonical_team(row["team"])) in THIRD_PLACE_RANK],
        key=lambda x: THIRD_PLACE_RANK[normalize_key(canonical_team(x["team"]))],
    )
    return top24 + [row["team"] for row in qualified_third]


def update_fasit_csv(teams: list[str]) -> None:
    rows = list(csv.reader(FASIT_PATH.open(encoding="utf-8-sig", newline="")))
    out: list[list[str]] = []
    in_r32 = False
    for row in rows:
        if row and "32-delsfinale" in row[0].lower():
            in_r32 = True
            out.append(row)
            continue
        if in_r32 and row and row[0].strip().isdigit():
            slot = int(row[0]) - 1
            if 0 <= slot < len(teams):
                padded = row + [""] * max(0, 8 - len(row))
                padded[1] = teams[slot]
                out.append(padded[: max(len(row), 8)])
            else:
                out.append(row)
            continue
        if in_r32 and row and row[0].startswith("Åttedelsfinalistar"):
            in_r32 = False
        out.append(row)

    with FASIT_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
        csv.writer(handle).writerows(out)


def main() -> None:
    teams = compute_r32_teams()
    if len(teams) != 32:
        raise SystemExit(f"Forventa 32 lag, fekk {len(teams)}")
    for idx, team in enumerate(teams, start=1):
        print(f"{idx:2}. {team}")
    update_fasit_csv(teams)
    print(f"\nOppdaterte 32-delsfinale i {FASIT_PATH}")


if __name__ == "__main__":
    main()
