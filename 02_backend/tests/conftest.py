"""Gemeinsame Vorrichtungen für die Tests.

Grundsatz: **kein Netz, kein Modell, kein Qdrant.** Diese Tests sollen in Sekunden
durchlaufen, sonst führt sie niemand aus. Alles, was ein Modell braucht — vor allem die
Qualität der Vorschläge — ist Sache der Eval in `eval/`, nicht dieser Sammlung.

Zweiter Grundsatz: **keine Abhängigkeit von lokalen Dateien.** Die Musterbausteine und das
Register-Overlay sind von git ausgenommen, weil sie Inhalte aus vertraulichen Ordnern führen.
Die Tests bauen ihre Daten deshalb selbst; sonst scheitert die Sammlung bei jedem, der das
Repo frisch klont.
"""
import sys
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parent.parent / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))


@pytest.fixture
def musterbausteine_fest(monkeypatch):
    """Ersetzt musterbausteine.laden() durch eine feste, erfundene Vorlage.

    Nachgebildet ist die Eigenart, an der der Beihilfe-Filter zweimal gescheitert ist:
    Ableitungen wie „Beihilferecht", und ein Landesrecht-Satz, an dessen Ende die Überschrift
    des Folgeabschnitts klebt (Artefakt der Zeilenzusammenführung aus dem PDF).
    """
    import musterbausteine

    daten = {
        1: [
            {"nummer": "1.1",
             "text": "Rechtsgrundlage Das Land Brandenburg gewährt nach Maßgabe dieser "
                     "Richtlinie und der Verwaltungsvorschriften zu § 44 der LHO Zuwendungen.",
             "hinweis": "Bei VV kein Verweis auf § 44 LHO."},
            {"nummer": "1.2.n", "text": "Rechtsgrundlage nach dem Beihilferecht",
             "hinweis": None},
            {"nummer": "1.2.n", "text": "AGVO Die nach dieser Richtlinie gewährten Förderungen",
             "hinweis": None},
            {"nummer": "1.n", "text": "Zweck der Förderung", "hinweis":
             "Die Darstellung des Zwecks erfolgt durch das Fachreferat."},
        ],
        8: [
            # Landesrecht — die angeklebte Überschrift steht jenseits von Zeichen 80.
            {"nummer": "8.1",
             # Erfundener Satz mit dem Bauplan des echten: Landesrecht voran, die
             # angeklebte Beihilfe-Überschrift erst jenseits von Zeichen 80.
             "text": "Diese Förderrichtlinie tritt am Tag nach ihrer Bekanntmachung in Kraft "
                     "und endet mit Ablauf der festgelegten Frist. Laufzeit im Beihilfebereich",
             "hinweis": None},
            {"nummer": "8.2", "text": "AGVO Die Laufzeit dieser Förderrichtlinie ist befristet.",
             "hinweis": None},
        ],
    }
    monkeypatch.setattr(musterbausteine, "laden", lambda *a, **k: daten)
    return daten


@pytest.fixture
def block():
    """Ein Kontextblock in der Form, die satzfilter und vorschlag erwarten."""
    def bauen(text, fundstelle="ANBest-P, Nummer 5.1 (S. 4)", kennung="0001"):
        return {"id": kennung, "fundstelle": fundstelle, "roh": text, "kurz": None,
                "gefiltert": False, "indizes": []}
    return bauen
