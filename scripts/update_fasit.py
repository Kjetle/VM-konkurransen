#!/usr/bin/env python3
"""One-off helper to populate fasit CSV with current tournament data."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "Underlag" / "VM 2026 - konkurranse - csv.csv"
DST = ROOT / "Final" / "VM 2026 - konkurranse - Fasit.csv"

RESULTS = {
    "2026-06-11|Mexico|South Africa": (2, 0, "H"),
    "2026-06-11|Korea Republic|Czechia": (2, 1, "H"),
    "2026-06-12|Canada|Bosnia and Herzegovina": (1, 1, "U"),
    "2026-06-12|USA|Paraguay": (4, 1, "H"),
    "2026-06-13|Qatar|Switzerland": (1, 1, "U"),
    "2026-06-13|Haiti|Scotland": (0, 1, "B"),
    "2026-06-13|Brazil|Morocco": (1, 1, "U"),
    "2026-06-13|Australia|Türkiye": (2, 0, "H"),
    "2026-06-14|Germany|Curaçao": (7, 1, "H"),
}

STATS_LINES = [
    "Bonusspørsmål,,,,,,,",
    "Spørsmål,Tips,Fasit,Poengregel,,,,",
    "TOPPSCORAR,,Folarin Balogun,8p per mål. Straffekonk tel ikkje,,,,",
    "Mestskorande lag,,Germany,5p per mål. Straffekonk tel ikkje,,,,",
    "Mest innslupne mål / verste forsvar,,Curaçao,5p per mål. Straffekonk tel ikkje,,,,",
    "Kva spelar får det første raude kortet i VM?,,Sphephelo Sithole,40p rett spelar,,,,",
    "Kva lag får flest raude kort?,,South Africa,10p for kvart kort,,,,",
    ",,,,,,,",
    "Statistikk,,,,,,,",
    "player_goals,Folarin Balogun,2",
    "player_goals,Kai Havertz,2",
    "player_goals,Raul Jimenez,1",
    "player_goals,Julian Quinones,1",
    "player_goals,Hwang In-beom,1",
    "player_goals,Oh Hyeon-gyu,1",
    "player_goals,Ladislav Krejci,1",
    "player_goals,Jovo Lukic,1",
    "player_goals,Cyle Larin,1",
    "player_goals,Gio Reyna,1",
    "player_goals,Mauricio,1",
    "player_goals,Breel Embolo,1",
    "player_goals,Ismael Saibari,1",
    "player_goals,Vinicius Junior,1",
    "player_goals,John McGinn,1",
    "player_goals,Nestory Irankunda,1",
    "player_goals,Connor Metcalfe,1",
    "player_goals,Felix Nmecha,1",
    "player_goals,Nico Schlotterbeck,1",
    "player_goals,Jamal Musiala,1",
    "player_goals,Nathaniel Brown,1",
    "player_goals,Deniz Undav,1",
    "player_goals,Livano Comenencia,1",
    "team_goals_scored,Germany,7",
    "team_goals_scored,USA,4",
    "team_goals_scored,Mexico,2",
    "team_goals_scored,Korea Republic,2",
    "team_goals_scored,Australia,2",
    "team_goals_scored,Canada,1",
    "team_goals_scored,Bosnia and Herzegovina,1",
    "team_goals_scored,Czechia,1",
    "team_goals_scored,Paraguay,1",
    "team_goals_scored,Qatar,1",
    "team_goals_scored,Switzerland,1",
    "team_goals_scored,Brazil,1",
    "team_goals_scored,Morocco,1",
    "team_goals_scored,Scotland,1",
    "team_goals_scored,Curaçao,1",
    "team_goals_conceded,Curaçao,7",
    "team_goals_conceded,Paraguay,4",
    "team_goals_conceded,South Africa,2",
    "team_goals_conceded,Czechia,2",
    "team_goals_conceded,Türkiye,2",
    "team_goals_conceded,Haiti,1",
    "team_goals_conceded,Mexico,1",
    "team_goals_conceded,Korea Republic,1",
    "team_goals_conceded,Canada,1",
    "team_goals_conceded,Bosnia and Herzegovina,1",
    "team_goals_conceded,Qatar,1",
    "team_goals_conceded,Switzerland,1",
    "team_goals_conceded,Brazil,1",
    "team_goals_conceded,Morocco,1",
    "team_goals_conceded,Scotland,1",
    "team_goals_conceded,Australia,1",
    "team_goals_conceded,Germany,1",
    "team_red_cards,South Africa,2",
    "team_red_cards,Mexico,1",
    "first_red_card,Sphephelo Sithole,",
    "most_red_cards,South Africa,2",
]


def read_text(path: Path) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            continue
    raise UnicodeDecodeError("file", b"", 0, 1, f"Kunne ikkje lese {path}")


def main() -> None:
    lines = read_text(SRC).splitlines()
    out: list[str] = []

    for line in lines:
        parts = line.split(",")
        if len(parts) >= 8:
            key = f"{parts[0]}|{parts[2]}|{parts[3]}"
            if key in RESULTS:
                h, b, sign = RESULTS[key]
                parts[5], parts[6], parts[7] = str(h), str(b), sign
                line = ",".join(parts)
        if line.startswith("Bonussp"):
            break
        out.append(line)

    out.extend(STATS_LINES)
    DST.write_text("\n".join(out) + "\n", encoding="utf-8-sig")
    print(f"Oppdaterte {DST}")


if __name__ == "__main__":
    main()
