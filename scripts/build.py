#!/usr/bin/env python3
"""Build VM 2026 tippekonkurranse data from CSV files."""

from __future__ import annotations

import csv
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UNDERLAG = ROOT / "Underlag"
FASIT_PATH = ROOT / "Final" / "VM 2026 - konkurranse - Fasit.csv"
ALIASES_PATH = Path(__file__).resolve().parent / "team_aliases.json"
WEB_DIR = ROOT / "web"
DATA_JS_PATH = WEB_DIR / "data.js"

SCORING = {
    "group_outcome": 5,
    "group_exact": 25,
    "r32": 10,
    "r16": 15,
    "qf": 20,
    "sf": 25,
    "finalists": 40,
    "winner": 50,
    "top_scorer_per_goal": 8,
    "top_scoring_team_per_goal": 5,
    "worst_defense_per_goal": 5,
    "first_red_card": 40,
    "most_red_cards_per_card": 10,
}

KNOCKOUT_SECTIONS = [
    ("32-delsfinale", "r32", 32, 10),
    ("åttedelsfinalistar", "r16", 16, 15),
    ("kvartfinalistar", "qf", 8, 20),
    ("semifinalistar", "sf", 4, 25),
    ("finalistar", "finalists", 2, 40),
    ("vinnar", "winner", 1, 50),
]

BONUS_QUESTIONS = [
    ("top_scorer", "TOPPSCORAR", "top_scorer_per_goal", "per_goal_player"),
    ("top_scoring_team", "Mestskorande lag", "top_scoring_team_per_goal", "per_goal_team_scored"),
    ("worst_defense", "Mest innslupne mål / verste forsvar", "worst_defense_per_goal", "per_goal_team_conceded"),
    ("first_red_card", "Kva spelar får det første raude kortet i VM?", "first_red_card", "exact_player"),
    ("most_red_cards", "Kva lag får flest raude kort?", "most_red_cards_per_card", "most_red_team"),
]

BONUS_LABELS = {label.lower(): qid for qid, label, _, _ in BONUS_QUESTIONS}


def read_csv(path: Path) -> list[list[str]]:
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            with path.open(encoding=encoding, newline="") as handle:
                return list(csv.reader(handle))
        except UnicodeDecodeError:
            continue
    raise UnicodeDecodeError("csv", b"", 0, 1, f"Kunne ikkje lese {path}")


def parse_int(value: str | None) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text == "-":
        return None
    try:
        return int(text)
    except ValueError:
        return None


def strip_accents(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def normalize_key(text: str) -> str:
    text = strip_accents(text.strip().lower())
    text = re.sub(r"[^a-z0-9æøå ]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def clean_guess_text(text: str) -> str:
    text = text.strip()
    text = re.split(r"[.;|]", text, maxsplit=1)[0]
    text = re.sub(r"\s+\d+\s*goals?$", "", text, flags=re.IGNORECASE)
    return text.strip()


def load_aliases() -> tuple[dict[str, str], dict[str, str]]:
    with ALIASES_PATH.open(encoding="utf-8") as handle:
        data = json.load(handle)
    teams = {normalize_key(k): v for k, v in data.get("teams", {}).items()}
    players = {normalize_key(k): v for k, v in data.get("players", {}).items()}
    return teams, players


TEAM_ALIASES, PLAYER_ALIASES = load_aliases()


def canonical_team(name: str) -> str:
    if not name or not name.strip():
        return ""
    cleaned = clean_guess_text(name)
    key = normalize_key(cleaned)
    return TEAM_ALIASES.get(key, cleaned)


def canonical_player(name: str) -> str:
    if not name or not name.strip() or name.strip() == "-":
        return ""
    cleaned = clean_guess_text(name)
    key = normalize_key(cleaned)
    if key in PLAYER_ALIASES:
        return PLAYER_ALIASES[key]
    if " på " in cleaned.lower():
        cleaned = cleaned.split(" på ", 1)[0].strip()
        key = normalize_key(cleaned)
        if key in PLAYER_ALIASES:
            return PLAYER_ALIASES[key]
    return cleaned


def teams_match(guess: str, answer: str) -> bool:
    if not guess or not answer:
        return False
    g = normalize_key(canonical_team(guess))
    a = normalize_key(canonical_team(answer))
    if not g or not a:
        return False
    return g == a or g in a or a in g


def players_match(guess: str, answer: str) -> bool:
    if not guess or not answer:
        return False
    g = normalize_key(canonical_player(guess))
    a = normalize_key(canonical_player(answer))
    if not g or not a:
        return False
    if g == a:
        return True
    g_parts = g.split()
    a_parts = a.split()
    if g_parts and g_parts[-1] == a:
        return True
    if a_parts and a_parts[-1] == g:
        return True
    return g in a or a in g


def sign_from_scores(home: int, away: int) -> str:
    if home > away:
        return "H"
    if home < away:
        return "B"
    return "U"


def detect_knockout_section(first_cell: str) -> tuple[str, str, int, int] | None:
    lower = first_cell.lower()
    for marker, slug, slots, points in KNOCKOUT_SECTIONS:
        if marker in lower:
            return slug, first_cell, slots, points
    return None


def parse_competition_csv(path: Path) -> dict:
    rows = read_csv(path)
    result = {
        "group_matches": [],
        "knockout": {},
        "bonus": {},
        "stats": {
            "player_goals": {},
            "team_goals_scored": {},
            "team_goals_conceded": {},
            "team_red_cards": {},
            "first_red_card_player": "",
            "most_red_cards_team": "",
            "most_red_cards_count": None,
        },
    }

    section = None
    current_knockout = None

    for row in rows:
        if not row or all(not cell.strip() for cell in row):
            continue

        first = row[0].strip()
        lower_first = first.lower()

        if first == "Dato" and len(row) >= 4 and row[2].strip() == "Heimelag":
            section = "group"
            continue

        if "bonusspørsmål" in lower_first:
            section = "bonus"
            continue

        if lower_first in {"statistikk", "bonusstatistikk"}:
            section = "stats"
            continue

        knockout_info = detect_knockout_section(first)
        if knockout_info:
            slug, label, slots, points = knockout_info
            section = "knockout"
            current_knockout = slug
            result["knockout"][slug] = {
                "label": label,
                "slots": slots,
                "points": points,
                "teams": [""] * slots,
            }
            continue

        if section == "group" and re.fullmatch(r"\d{4}-\d{2}-\d{2}", first):
            home = row[2].strip()
            away = row[3].strip()
            h = parse_int(row[5]) if len(row) > 5 else None
            b = parse_int(row[6]) if len(row) > 6 else None
            sign = row[7].strip().upper() if len(row) > 7 and row[7].strip() else None
            if sign not in {"H", "U", "B"} and h is not None and b is not None:
                sign = sign_from_scores(h, b)
            result["group_matches"].append(
                {
                    "id": f"{first}|{home}|{away}",
                    "date": first,
                    "group": row[1].strip(),
                    "home": home,
                    "away": away,
                    "stadium": row[4].strip() if len(row) > 4 else "",
                    "h": h,
                    "b": b,
                    "sign": sign,
                }
            )
            continue

        if section == "knockout" and current_knockout and first.isdigit():
            slot = int(first) - 1
            team = row[1].strip() if len(row) > 1 else ""
            teams = result["knockout"][current_knockout]["teams"]
            if 0 <= slot < len(teams):
                teams[slot] = team
            continue

        if section == "bonus" and first not in {"Spørsmål"}:
            qid = BONUS_LABELS.get(lower_first)
            if not qid:
                continue
            tips = row[1].strip() if len(row) > 1 else ""
            col2 = row[2].strip() if len(row) > 2 else ""
            col3 = row[3].strip() if len(row) > 3 else ""
            # Deltakarar: Tips i kolonne 1. Fasit-fil: svar i Fasit-kolonne (2), evt. tal der.
            if col2 and not col2.lower().startswith(("8p", "5p", "40p", "10p", "2p", "0.5p")):
                answer = col2
                numeric = parse_int(tips) if tips.isdigit() else parse_int(col3)
            else:
                answer = tips
                numeric = parse_int(col2) if col2.isdigit() else None
            result["bonus"][qid] = {"answer": answer, "numeric": numeric}
            continue

        if section == "stats":
            stat_type = lower_first
            name = row[1].strip() if len(row) > 1 else ""
            value = parse_int(row[2]) if len(row) > 2 else None
            if stat_type == "player_goals" and name and value is not None:
                result["stats"]["player_goals"][normalize_key(canonical_player(name))] = value
            elif stat_type == "team_goals_scored" and name and value is not None:
                result["stats"]["team_goals_scored"][normalize_key(canonical_team(name))] = value
            elif stat_type == "team_goals_conceded" and name and value is not None:
                result["stats"]["team_goals_conceded"][normalize_key(canonical_team(name))] = value
            elif stat_type == "team_red_cards" and name and value is not None:
                result["stats"]["team_red_cards"][normalize_key(canonical_team(name))] = value
            elif stat_type == "first_red_card" and name:
                result["stats"]["first_red_card_player"] = name
            elif stat_type == "most_red_cards" and name:
                result["stats"]["most_red_cards_team"] = name
                result["stats"]["most_red_cards_count"] = value

    return result


def format_score(h: int | None, b: int | None, sign: str | None) -> str:
    if h is None or b is None:
        return "—"
    suffix = f" ({sign})" if sign else ""
    return f"{h}-{b}{suffix}"


def score_group_match(guess: dict, answer: dict) -> dict:
    if answer["h"] is None or answer["b"] is None:
        return {
            "points": 0,
            "status": "ventar",
            "utfall": "Ventar på fasit",
            "correct": None,
        }

    guess_sign = guess.get("sign") or sign_from_scores(guess["h"], guess["b"])
    answer_sign = answer.get("sign") or sign_from_scores(answer["h"], answer["b"])

    if guess["h"] == answer["h"] and guess["b"] == answer["b"]:
        return {
            "points": SCORING["group_exact"],
            "status": "rett",
            "utfall": "Rett resultat",
            "correct": True,
        }
    if guess_sign == answer_sign:
        return {
            "points": SCORING["group_outcome"],
            "status": "delvis",
            "utfall": "Rett utfall",
            "correct": True,
        }
    return {
        "points": 0,
        "status": "feil",
        "utfall": "Feil",
        "correct": False,
    }


def lookup_player_goals(name: str, stats: dict) -> int | None:
    key = normalize_key(canonical_player(name))
    if not key:
        return None
    return stats["player_goals"].get(key, 0)


def lookup_team_goals_scored(name: str, stats: dict) -> int | None:
    key = normalize_key(canonical_team(name))
    if not key:
        return None
    return stats["team_goals_scored"].get(key, 0)


def lookup_team_goals_conceded(name: str, stats: dict) -> int | None:
    key = normalize_key(canonical_team(name))
    if not key:
        return None
    return stats["team_goals_conceded"].get(key, 0)


def lookup_team_red_cards(name: str, stats: dict) -> int | None:
    key = normalize_key(canonical_team(name))
    if not key:
        return None
    return stats["team_red_cards"].get(key, 0)


def score_bonus_question(qid: str, guess: str, fasit: dict, stats: dict) -> dict:
    guess = clean_guess_text(guess)
    if not guess or guess == "-":
        return {"points": 0, "status": "tomt", "utfall": "Ikke fylt ut", "correct": None}

    bonus_answer = fasit.get("bonus", {}).get(qid, {})
    answer_text = bonus_answer.get("answer", "")
    answer_numeric = bonus_answer.get("numeric")

    if qid == "top_scorer":
        goals = lookup_player_goals(guess, stats)
        if goals is None:
            return {"points": 0, "status": "ventar", "utfall": "Ventar på statistikk", "correct": None}
        points = goals * SCORING["top_scorer_per_goal"]
        return {
            "points": points,
            "status": "rett" if points else "feil",
            "utfall": f"{goals} mål × 8p",
            "correct": points > 0,
        }

    if qid == "top_scoring_team":
        goals = lookup_team_goals_scored(guess, stats)
        if goals is None:
            return {"points": 0, "status": "ventar", "utfall": "Ventar på statistikk", "correct": None}
        points = goals * SCORING["top_scoring_team_per_goal"]
        return {
            "points": points,
            "status": "rett" if points else "feil",
            "utfall": f"{goals} mål × 5p",
            "correct": points > 0,
        }

    if qid == "worst_defense":
        conceded = lookup_team_goals_conceded(guess, stats)
        if conceded is None and answer_numeric is not None and teams_match(guess, answer_text):
            conceded = answer_numeric
        if conceded is None:
            return {"points": 0, "status": "ventar", "utfall": "Ventar på statistikk", "correct": None}
        points = conceded * SCORING["worst_defense_per_goal"]
        return {"points": points, "status": "rett" if points else "feil", "utfall": f"{conceded} innslupne × 5p", "correct": points > 0}

    if qid == "first_red_card":
        actual = stats.get("first_red_card_player") or answer_text
        if not actual:
            return {"points": 0, "status": "ventar", "utfall": "Ventar på fasit", "correct": None}
        if players_match(guess, actual):
            return {"points": SCORING["first_red_card"], "status": "rett", "utfall": "Rett spelar", "correct": True}
        return {"points": 0, "status": "feil", "utfall": "Feil spelar", "correct": False}

    if qid == "most_red_cards":
        count = lookup_team_red_cards(guess, stats)
        if count is None:
            return {"points": 0, "status": "ventar", "utfall": "Ventar på statistikk", "correct": None}
        points = count * SCORING["most_red_cards_per_card"]
        return {
            "points": points,
            "status": "rett" if points else "feil",
            "utfall": f"{count} kort × 10p",
            "correct": points > 0,
        }

    return {"points": 0, "status": "ventar", "utfall": "Ukjent", "correct": None}


def build_participant(name: str, path: Path, fasit: dict) -> dict:
    data = parse_competition_csv(path)
    group_rows = []
    group_points = 0
    group_played = 0

    answer_by_id = {m["id"]: m for m in fasit["group_matches"]}
    guess_by_id = {m["id"]: m for m in data["group_matches"]}

    for match in fasit["group_matches"]:
        guess = guess_by_id.get(match["id"], {})
        answer = answer_by_id[match["id"]]
        scored = score_group_match(
            {
                "h": guess.get("h"),
                "b": guess.get("b"),
                "sign": guess.get("sign"),
            },
            answer,
        )
        if answer["h"] is not None and answer["b"] is not None:
            group_played += 1
        group_points += scored["points"]
        group_rows.append(
            {
                "id": match["id"],
                "date": match["date"],
                "group": match["group"],
                "match": f"{match['home']} – {match['away']}",
                "guess": format_score(guess.get("h"), guess.get("b"), guess.get("sign")),
                "answer": format_score(answer["h"], answer["b"], answer["sign"]),
                "points": scored["points"],
                "status": scored["status"],
                "utfall": scored["utfall"],
                "correct": scored["correct"],
            }
        )

    knockout_rows = []
    knockout_points = 0
    for _, slug, slots, points in KNOCKOUT_SECTIONS:
        fasit_round = fasit["knockout"].get(slug, {"teams": [""] * slots, "label": slug})
        guess_round = data["knockout"].get(slug, {"teams": [""] * slots, "label": slug})
        label = fasit_round.get("label", slug)
        for idx in range(slots):
            guess_team = guess_round["teams"][idx] if idx < len(guess_round["teams"]) else ""
            answer_team = fasit_round["teams"][idx] if idx < len(fasit_round["teams"]) else ""
            if not answer_team:
                status = "ventar"
                correct = None
                pts = 0
                utfall = "Ventar på fasit"
            elif teams_match(guess_team, answer_team):
                status = "rett"
                correct = True
                pts = points
                utfall = "Rett lag"
            else:
                status = "feil"
                correct = False
                pts = 0
                utfall = "Feil"
            knockout_points += pts
            knockout_rows.append(
                {
                    "round": slug,
                    "roundLabel": label,
                    "slot": idx + 1,
                    "guess": guess_team or "—",
                    "answer": answer_team or "—",
                    "points": pts,
                    "status": status,
                    "utfall": utfall,
                    "correct": correct,
                }
            )

    bonus_rows = []
    bonus_points = 0
    for qid, label, _, _ in BONUS_QUESTIONS:
        guess_text = data["bonus"].get(qid, {}).get("answer", "")
        scored = score_bonus_question(qid, guess_text, fasit, fasit["stats"])
        bonus_points += scored["points"]
        fasit_answer = fasit["bonus"].get(qid, {}).get("answer", "")
        bonus_rows.append(
            {
                "id": qid,
                "question": label,
                "guess": guess_text or "—",
                "answer": fasit_answer or "—",
                "points": scored["points"],
                "status": scored["status"],
                "utfall": scored["utfall"],
                "correct": scored["correct"],
            }
        )

    return {
        "name": name,
        "scores": {
            "group": group_points,
            "knockout": knockout_points,
            "bonus": bonus_points,
            "total": group_points + knockout_points + bonus_points,
            "groupPlayed": group_played,
            "groupTotal": len(fasit["group_matches"]),
        },
        "groupMatches": group_rows,
        "knockout": knockout_rows,
        "bonus": bonus_rows,
    }


def build_fasit_view(fasit: dict) -> dict:
    group_rows = []
    for match in fasit["group_matches"]:
        group_rows.append(
            {
                "date": match["date"],
                "group": match["group"],
                "match": f"{match['home']} – {match['away']}",
                "result": format_score(match["h"], match["b"], match["sign"]),
                "played": match["h"] is not None and match["b"] is not None,
            }
        )

    knockout = []
    for _, slug, slots, points in KNOCKOUT_SECTIONS:
        round_data = fasit["knockout"].get(slug, {"teams": [""] * slots, "label": slug})
        knockout.append(
            {
                "slug": slug,
                "label": round_data.get("label", slug),
                "points": points,
                "teams": [
                    {"slot": idx + 1, "team": round_data["teams"][idx] or "—"}
                    for idx in range(slots)
                ],
            }
        )

    bonus = []
    for qid, label, _, _ in BONUS_QUESTIONS:
        entry = fasit["bonus"].get(qid, {})
        bonus.append(
            {
                "id": qid,
                "question": label,
                "answer": entry.get("answer", "") or "—",
                "numeric": entry.get("numeric"),
            }
        )

    return {"groupMatches": group_rows, "knockout": knockout, "bonus": bonus}


def discover_participants() -> list[tuple[str, Path]]:
    participants = []
    for path in sorted(UNDERLAG.glob("*_All_Matches.csv")):
        name = path.stem.replace("_All_Matches", "")
        participants.append((name, path))
    return participants


def main() -> None:
    if not FASIT_PATH.exists():
        raise SystemExit(f"Fasit-fil manglar: {FASIT_PATH}")

    fasit = parse_competition_csv(FASIT_PATH)
    participants = []
    for name, path in discover_participants():
        participants.append(build_participant(name, path, fasit))

    participants.sort(key=lambda item: (-item["scores"]["total"], item["name"].lower()))

    payload = {
        "meta": {
            "title": "VM 2026 – tippekonkurranse",
            "updated": datetime.now(timezone.utc).isoformat(),
            "scoring": SCORING,
        },
        "fasit": build_fasit_view(fasit),
        "participants": participants,
        "knockoutSections": [
            {"slug": slug, "label": marker, "slots": slots, "points": points}
            for marker, slug, slots, points in KNOCKOUT_SECTIONS
        ],
        "bonusQuestions": [
            {"id": qid, "label": label}
            for qid, label, _, _ in BONUS_QUESTIONS
        ],
    }

    WEB_DIR.mkdir(parents=True, exist_ok=True)
    js_content = "window.APP_DATA = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n"
    DATA_JS_PATH.write_text(js_content, encoding="utf-8")
    print(f"Bygde {DATA_JS_PATH} med {len(participants)} deltakarar.")


if __name__ == "__main__":
    main()
