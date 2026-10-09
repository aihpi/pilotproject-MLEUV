"""Die Regelübersicht gegen den Code halten.

`regeln.yaml` sagt, welche Regel des Prozessmodells von welcher Prüfung getragen wird. Diese
Zuordnung ist von Hand gemacht und driftet sonst: Wer eine Prüfung umbenennt oder entfernt,
merkt an der Übersicht nichts — sie liegt in einem anderen Ordner und in einer anderen
Sprache. Dann behauptet das Repo eine Abdeckung, die es nicht mehr gibt.

Geprüft wird nur, was sich prüfen lässt: dass jede genannte Prüfkennung im Code vorkommt und
dass die Übersicht so viele Einträge hat wie der Rohauszug. Ob die ZUORDNUNG stimmt, kann
kein Test wissen — das bleibt Handarbeit.
"""
import os
import re

import pytest
import yaml

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGELN = os.path.join(BASE, "regeln.yaml")
SHARED = os.path.join(os.path.dirname(BASE), "01_frontend", "packages", "shared", "src",
                      "index.ts")

# Die Zahl der Regeldokumentationen im Prozessmodell. Steht hier und nicht in der Rohdatei,
# weil die nicht im Repo liegt — ein frischer Klon soll den Test trotzdem laufen lassen.
REGELN_IM_MODELL = 60

ERLAUBTE_STATUS = {"umgesetzt", "teilweise", "offen", "zurueckgestellt",
                   "kein_pruefpunkt"}


def regeln():
    with open(REGELN, encoding="utf-8") as f:
        return (yaml.safe_load(f) or {}).get("regeln") or []


def pruefkennungen():
    """Alle Kennungen, die der Code an `regel:` vergibt.

    Nicht nur `regel: "x"`: Eine Kennung kann aus einer Bedingung kommen
    (`regel: a ? "x" : "y"`), und genau zwei der umgesetzten tun das. Deshalb wird die ganze
    Zeile nach Zeichenketten abgesucht statt nach einem festen Muster.
    """
    with open(SHARED, encoding="utf-8") as f:
        zeilen = re.findall(r"regel:\s*(.+)", f.read())
    return {k for z in zeilen for k in re.findall(r'"([a-z][a-z_]{3,})"', z)}


class TestRegeluebersicht:
    def test_vollstaendig(self):
        assert len(regeln()) == REGELN_IM_MODELL

    def test_kennungen_eindeutig(self):
        ids = [r["id"] for r in regeln()]
        assert len(set(ids)) == len(ids)

    def test_status_bekannt(self):
        unbekannt = {r["status"] for r in regeln()} - ERLAUBTE_STATUS
        assert not unbekannt, f"unbekannter Status: {unbekannt}"

    @pytest.mark.skipif(not os.path.exists(SHARED), reason="packages/shared nicht vorhanden")
    def test_genannte_pruefungen_gibt_es(self):
        """Jede in der Übersicht genannte Prüfkennung muss im Code stehen."""
        bekannt = pruefkennungen()
        fehlend = sorted({r["umgesetzt_als"] for r in regeln() if r.get("umgesetzt_als")}
                         - bekannt)
        assert not fehlend, f"in regeln.yaml genannt, im Code nicht gefunden: {fehlend}"

    def test_umgesetzt_nennt_eine_pruefung(self):
        """„umgesetzt" ohne Kennung ist eine Behauptung ohne Beleg.

        Eine Ausnahme ist zugelassen und steht im Eintrag selbst: Regeln, die kein eigener
        Prüfpunkt sind, sondern der Adressat mehrerer — die Begründung gegenüber dem MdFE.
        """
        ohne = [r["id"] for r in regeln()
                if r["status"] == "umgesetzt" and not r.get("umgesetzt_als")
                and "Adressat" not in r.get("regel", "")]
        assert not ohne, f"als umgesetzt geführt, ohne Prüfung zu nennen: {ohne}"
