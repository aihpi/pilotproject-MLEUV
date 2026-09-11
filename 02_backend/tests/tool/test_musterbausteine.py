"""Extraktion der Musterbausteine aus der Tabellenvorlage.

Ohne PDF: geprüft wird die Verarbeitung der Tabellenzeilen, nicht docling. Die Vorlage selbst
liegt in einem vertraulichen Ordner und steht keinem Klon zur Verfügung.
"""
import pandas as pd
import pytest

import musterbausteine as mb

SPALTEN = ["Nr.", "Textbausteine", "Hinweis an Ersteller der Richtlinie/VV (RL/VV)"]


class TestSpaltenerkennung:
    """Erkennung über die Bezeichnung, nicht die Position.

    Nach Position ging es nicht: docling erkannte auf einer Seite eine vierte, leere Spalte
    dazu, und auf einer anderen fehlte die Nummernspalte ganz. Bei einer Prüfung auf „genau
    drei Spalten" fielen beide Tabellen heraus — zusammen fünf Textbausteine und ein Titel.
    """

    def test_dreispaltig(self):
        df = pd.DataFrame(columns=SPALTEN)
        assert mb._spalten(df) == (0, 1, 2)

    def test_vierte_leere_spalte_stoert_nicht(self):
        df = pd.DataFrame(columns=SPALTEN + [""])
        assert mb._spalten(df) == (0, 1, 2)

    def test_fehlende_nummernspalte_ergibt_none(self):
        """Solche Zeilen sind zwangsläufig Fortsetzungen."""
        df = pd.DataFrame(columns=SPALTEN[1:])
        assert mb._spalten(df) == (None, 0, 1)

    def test_fremde_tabelle_wird_verworfen(self):
        df = pd.DataFrame(columns=["Notifizierung/Freistellung"])
        assert mb._spalten(df) is None


class TestGliederung:
    def test_nach_baustein_gruppiert_mit_titel_und_hinweis(self):
        eintraege = [
            {"nummer": "1.1", "baustein": 1, "text": "Erster", "hinweis": "Ein Hinweis"},
            {"nummer": "1.n", "baustein": 1, "text": "Zweiter", "hinweis": ""},
            {"nummer": "8.1", "baustein": 8, "text": "Achter", "hinweis": ""},
        ]
        titel = {1: ("Zuwendungszweck, Rechtsgrundlage", None),
                 8: ("Geltungsdauer", "Bei Verwaltungsvorschriften nicht über § 44 LHO.")}
        raus = mb.gliedern(eintraege, titel)

        assert [b["nummer"] for b in raus] == [1, 8]
        assert raus[0]["titel"] == "Zuwendungszweck, Rechtsgrundlage"
        assert len(raus[0]["textbausteine"]) == 2
        assert raus[0]["textbausteine"][0]["hinweis"] == "Ein Hinweis"
        assert raus[0]["textbausteine"][1]["hinweis"] is None   # leer wird zu None
        # Der Hinweis aus der verbundenen Überschriftszelle bleibt am Baustein hängen.
        assert "nicht über § 44 LHO" in raus[1]["hinweis"]


class TestErwartung:
    def test_selbstpruefung_deckt_alle_acht_bausteine_ab(self):
        """Die hinterlegte Zeilenzahl je Baustein ist die Selbstprüfung des Extraktionslaufs.

        Sie hat den ersten Lauf auffliegen lassen, der für Baustein 5 nur 10 statt 15 Zeilen
        fand. Ohne sie hätte ich 63 Bausteine für vollständig gehalten.
        """
        assert sorted(mb.ERWARTET) == [1, 2, 3, 4, 5, 6, 7, 8]
        assert sum(mb.ERWARTET.values()) == 68


class TestLaden:
    def test_fehlende_datei_ist_kein_fehler(self, tmp_path):
        """Wer das Repo klont, hat die erzeugte Datei nicht — dann fehlen nur die Bausteine."""
        assert mb.laden(tmp_path / "gibtesnicht.yaml") == {}

    def test_laden_gibt_bausteine_nach_nummer(self, tmp_path):
        datei = tmp_path / "mb.yaml"
        datei.write_text(
            "bausteine:\n"
            "  - nummer: 1\n"
            "    titel: Test\n"
            "    textbausteine:\n"
            "      - nummer: '1.1'\n"
            "        text: Erster\n"
            "        hinweis: null\n",
            encoding="utf-8")
        geladen = mb.laden(datei)
        assert list(geladen) == [1]
        assert geladen[1][0]["nummer"] == "1.1"
