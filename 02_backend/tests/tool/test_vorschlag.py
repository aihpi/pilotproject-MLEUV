"""Nachprüfungen an den Feldvorschlägen.

Jeder Test hier hängt an einem Fehler, der beim Bauen wirklich passiert ist. Die Qualität
der Vorschläge selbst prüft das nicht — dafür braucht es ein Modell, und das ist Sache der
Eval.
"""
import vorschlag


class TestNormalisierung:
    def test_kyrillischer_zwilling_wird_erkannt(self):
        """Ein Probelauf lieferte „lhо44" mit kyrillischem о (U+043E).

        Optisch nicht von „lho44" zu unterscheiden, gegen die Optionsliste aber ungültig —
        und NFKC allein normalisiert es nicht weg, weil beide Zeichen kanonisch verschieden
        sind.
        """
        getarnt = "lhо44"
        assert getarnt != "lho44"
        assert vorschlag.normalisieren(getarnt) == "lho44"

    def test_unauffaellige_werte_bleiben(self):
        assert vorschlag.normalisieren("  administrative  ") == "administrative"
        assert vorschlag.normalisieren(None) == ""


class TestBeihilfeFilter:
    """Der Filter trennt Landesrecht (im PoC) von EU-Beihilferecht (außerhalb)."""

    def test_ableitungen_werden_erfasst(self, musterbausteine_fest):
        """„Beihilferecht" rutschte durch, solange das Muster auf eine Wortgrenze endete."""
        nummern = [t["nummer"] for t in vorschlag.rahmen(1)]
        assert nummern == ["1.1", "1.n"]

    def test_landesrecht_mit_angeklebter_ueberschrift_bleibt(self, musterbausteine_fest):
        """Baustein 8 fiel komplett leer, als über den ganzen Text gesucht wurde.

        An seinem einzigen Landesrecht-Satz klebt die Überschrift des Folgeabschnitts
        („… Geltungsdauer im Beihilfebereich") — ein Artefakt der Zeilenzusammenführung aus
        dem PDF. Geprüft wird deshalb nur der Textanfang.
        """
        drin = vorschlag.rahmen(8)
        assert [t["nummer"] for t in drin] == ["8.1"]
        assert "Beihilfebereich" in drin[0]["text"]  # der Auslöser steckt noch im Text

    def test_ohne_filter_bleibt_alles(self, musterbausteine_fest):
        assert len(vorschlag.rahmen(1, nur_landesrecht=False)) == 4


class TestBelegpruefung:
    """Ein Zitat, das nicht in den Fundstellen steht, ist erfunden."""

    def test_woertliches_zitat_ist_gedeckt(self, block):
        b = [block("Die Zuwendung ist auf einen Höchstbetrag zu begrenzen.")]
        assert vorschlag._beleg_gedeckt("Zuwendung ist auf einen Höchstbetrag", b)

    def test_zitat_aus_dem_musterbaustein_zaehlt_auch(self, block):
        """Ein Beleg darf aus den Fundstellen ODER aus einem Musterbaustein stammen.

        Anfangs prüfte ich nur gegen die Fundstellen — dann gilt ein Satzrahmen-Zitat als
        erfunden, obwohl es aus einer zulässigen Quelle kommt.
        """
        b = [block("Etwas ganz anderes steht hier.")]
        rahmen = "[Musterbaustein 1.1]\nDas Land Brandenburg gewährt nach Maßgabe dieser Richtlinie"
        assert not vorschlag._beleg_gedeckt("Das Land Brandenburg gewährt nach Maßgabe", b)
        assert vorschlag._beleg_gedeckt("Das Land Brandenburg gewährt nach Maßgabe", b, rahmen)

    def test_erfundenes_zitat_faellt_auf(self, block):
        b = [block("Die Zuwendung ist auf einen Höchstbetrag zu begrenzen.")]
        assert not vorschlag._beleg_gedeckt("Der Fördersatz beträgt stets 90 Prozent.", b)

    def test_umbrueche_und_grossschreibung_stoeren_nicht(self, block):
        b = [block("Die Zuwendung ist\n  auf einen Höchstbetrag zu begrenzen.")]
        assert vorschlag._beleg_gedeckt("die zuwendung ist auf einen höchstbetrag", b)


FELD_AUSWAHL = {
    "id": "legalBasis", "label": "Rechtsgrundlage", "kind": "radio",
    "options": [{"value": "lho44", "label": "Zuwendung nach § 44 LHO"},
                {"value": "lho53", "label": "Billigkeitsleistung nach § 53 LHO"},
                {"value": "administrative", "label": "Verwaltungsvorschriften"}],
}
FELD_TEXT = {"id": "goal", "label": "Förderziel", "kind": "textarea"}


class TestNachpruefung:
    def test_getarnter_auswahlwert_wird_geheilt_und_gemeldet(self):
        v = {"feld": "legalBasis", "wert": "lhо44", "quelle": "eingabe", "konfidenz": 0.9}
        befunde = vorschlag._pruefen(v, FELD_AUSWAHL, [])
        assert v["wert"] == "lho44"          # kanonischer Wert eingesetzt
        assert v["status"] == "suggested"
        assert any("Normalisierung" in b for b in befunde)   # aber nicht stillschweigend

    def test_fremder_auswahlwert_wird_abgelehnt(self):
        v = {"feld": "legalBasis", "wert": "§ 23 LHO", "quelle": "eingabe", "konfidenz": 0.9}
        befunde = vorschlag._pruefen(v, FELD_AUSWAHL, [])
        assert v["status"] == "invalid"
        assert any("gehört nicht zur Auswahl" in b for b in befunde)

    def test_unklar_kappt_die_konfidenz(self):
        """Bei dünner Eingabe muss [Unklar] kommen — und darf nicht selbstbewusst sein."""
        v = {"feld": "goal", "wert": "[Unklar]", "quelle": "unklar", "konfidenz": 0.9}
        vorschlag._pruefen(v, FELD_TEXT, [])
        assert v["status"] == "unklar"
        assert v["konfidenz"] <= 0.3

    def test_ohne_deckung_wird_die_konfidenz_gekappt(self):
        """Gemessen: ohne jede Angabe zur Finanzierungsquelle kam „lho44" mit 0,95 zurück.

        Der Wert ist plausibel, die Konfidenz nicht. Maßstab ist deshalb die nachgeprüfte
        Deckung in der Eingabe — nicht die Selbstauskunft des Modells.
        """
        v = {"feld": "legalBasis", "wert": "lho44", "quelle": "musterbaustein",
             "musterbaustein": "1.1", "deckung": None, "konfidenz": 0.95}
        vorschlag._pruefen(v, FELD_AUSWAHL, [], eingabe="Wir hätten gern eine Richtlinie.")
        assert v["konfidenz"] == vorschlag.KONFIDENZ_ABGELEITET
        assert v["gedeckt_durch_eingabe"] is False

    def test_nachgewiesene_deckung_behaelt_die_konfidenz(self):
        """Die Vorgängerregel kappte nach der Quelle und traf damit auch diesen Fall.

        Der Wert ist aus dem Musterbaustein formuliert, aber die Angabe trägt ihn
        ausdrücklich. „Aus dem Rahmen formuliert" ist nicht dasselbe wie „geraten".
        """
        eingabe = "Reine Landesmittel, Zuwendung als Zuschuss."
        v = {"feld": "legalBasis", "wert": "lho44", "quelle": "musterbaustein",
             "musterbaustein": "1.1", "deckung": "Reine Landesmittel, Zuwendung",
             "konfidenz": 0.95}
        vorschlag._pruefen(v, FELD_AUSWAHL, [], eingabe=eingabe)
        assert v["gedeckt_durch_eingabe"] is True
        assert v["konfidenz"] == 0.95

    def test_erfundene_deckung_faellt_auf_und_kappt(self):
        """Behauptete Deckung wird zeichengenau gegen die Eingabe geprüft."""
        v = {"feld": "legalBasis", "wert": "lho44", "quelle": "eingabe",
             "deckung": "Die Förderung erfolgt aus Bundesmitteln nach der GAK.",
             "konfidenz": 0.95}
        befunde = vorschlag._pruefen(v, FELD_AUSWAHL, [],
                                     eingabe="Reine Landesmittel, Zuschuss.")
        assert v["gedeckt_durch_eingabe"] is False
        assert v["konfidenz"] == vorschlag.KONFIDENZ_ABGELEITET
        assert any("steht nicht in der Angabe" in b for b in befunde)

    def test_abgeschriebener_wert_wird_verworfen(self, block):
        """Der Fehler, der diese Naht zweimal getroffen hat.

        Beim ersten Mal ohne Rollentrennung im Prompt, beim zweiten Mal begünstigt durch die
        Belegpflicht: das Modell nimmt bevorzugt Werte, die es zitieren kann, und am
        leichtesten zitierbar ist die abgerufene FREMDE Richtlinie.
        """
        fremd = ("Die Förderung dient der Verbesserung des Tierschutzes und zielt darauf ab, "
                 "die Unterbringung von Fundtieren zu optimieren.")
        v = {"feld": "purpose", "wert": fremd, "quelle": "eingabe",
             "deckung": None, "konfidenz": 1.0}
        befunde = vorschlag._pruefen({**v}, {"id": "purpose", "label": "Zuwendungszweck"},
                                     [block(fremd)], eingabe="Wir wollen Tierheime fördern.")
        assert any("wörtlich aus einer Fundstelle" in b for b in befunde)

        geprueft = {**v}
        vorschlag._pruefen(geprueft, {"id": "purpose", "label": "Zuwendungszweck"},
                           [block(fremd)], eingabe="Wir wollen Tierheime fördern.")
        assert geprueft["wert"] == "[Unklar]"
        assert geprueft["konfidenz"] == 0.0

    def test_eigener_wert_bleibt_auch_wenn_die_fundstelle_aehnlich_ist(self, block):
        """Nur der wörtliche Übertrag ist verboten, nicht die inhaltliche Nähe."""
        v = {"feld": "purpose", "wert": "Förderung von Tierheimen im Land Brandenburg",
             "quelle": "eingabe", "deckung": "Tierheime im Land Brandenburg fördern",
             "konfidenz": 0.9}
        vorschlag._pruefen(v, {"id": "purpose", "label": "Zuwendungszweck"},
                           [block("Die Förderung dient der Verbesserung des Tierschutzes.")],
                           eingabe="Wir wollen Tierheime im Land Brandenburg fördern.")
        assert v["status"] == "suggested"
        assert v["konfidenz"] == 0.9

    def test_erfundenes_zitat_wird_entfernt(self, block):
        v = {"feld": "goal", "wert": "Tierschutz verbessern", "quelle": "eingabe",
             "konfidenz": 0.9, "belegzitat": "Der Fördersatz beträgt stets 90 Prozent."}
        befunde = vorschlag._pruefen(v, FELD_TEXT, [block("Etwas ganz anderes steht hier.")])
        assert v["belegzitat"] is None
        assert v["beleg_geprueft"] is False
        assert any("nicht in den Fundstellen" in b for b in befunde)
