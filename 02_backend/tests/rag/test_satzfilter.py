"""Satzauswahl und Belegprüfung.

Der Satzfilter wählt aus abgerufenen Blöcken die tragenden Sätze. Der Modellaufruf selbst
wird hier nicht geprüft — wohl aber alles darum herum, und das ist der Teil, der die
Belegkette trägt: Satztrennung, Zusammensetzen, und die Gegenprobe, ob ein Zitat wirklich in
der Quelle steht.
"""
import satzfilter


class TestSatztrennung:
    def test_trennt_an_satzzeichen(self):
        saetze = satzfilter.saetze_teilen(
            "Die Zuwendung wird gewährt. Ein Anspruch besteht nicht. Die Behörde entscheidet.")
        assert len(saetze) == 3
        assert saetze[1].startswith("Ein Anspruch")

    def test_abkuerzungen_trennen_nicht(self):
        """„Ziff. 1.5" und „z. B." dürfen keinen Satz beenden — sonst zerfällt der Beleg."""
        saetze = satzfilter.saetze_teilen(
            "Nach Ziff. 1.5 der VV zu § 44 LHO gilt eine Grenze. Ausnahmen sind möglich.")
        assert len(saetze) == 2
        assert "Ziff. 1.5" in saetze[0]

    def test_leerer_text(self):
        assert satzfilter.saetze_teilen("") == []


class TestZusammensetzen:
    def test_luecken_werden_gekennzeichnet(self):
        """Wer Sätze auslässt, muss es zeigen — sonst liest sich der Auszug als Fließtext."""
        saetze = ["Erstens.", "Zweitens.", "Drittens.", "Viertens."]
        assert satzfilter.zusammensetzen(saetze, [0, 3]) == "Erstens. (...) Viertens."

    def test_luecklos_ohne_marke(self):
        saetze = ["Erstens.", "Zweitens."]
        assert "(...)" not in satzfilter.zusammensetzen(saetze, [0, 1])

    def test_nichts_gewaehlt_ergibt_nur_die_luecke(self):
        """Bewusst „(...)" und nicht der leere Text — von Spark 1:1 übernommen.

        In der Kette tritt der Fall nicht auf: ein Block ohne gewählten Satz belegt nichts
        und wird vorher aussortiert. Festgehalten, damit die Übernahme nicht versehentlich
        „aufgeräumt" wird.
        """
        assert satzfilter.zusammensetzen(["Erstens."], []) == "(...)"


class TestBelegpruefung:
    """Die Gegenprobe ohne Modellaufruf: steht das Zitat wörtlich in der Quelle?"""

    def test_woertliches_zitat(self):
        payload = {"text": "Die Zuwendung ist bei der Bewilligung auf einen Höchstbetrag "
                           "zu begrenzen."}
        assert satzfilter.beleg_pruefen("auf einen Höchstbetrag zu begrenzen", payload)

    def test_erfundenes_zitat(self):
        payload = {"text": "Die Zuwendung ist auf einen Höchstbetrag zu begrenzen."}
        assert not satzfilter.beleg_pruefen("Der Fördersatz beträgt 90 Prozent.", payload)

    def test_unterschiedliche_leerzeichen_stoeren_nicht(self):
        """Aus dem PDF kommen Zeilenumbrüche und doppelte Leerzeichen mitten im Satz."""
        payload = {"text": "Die  Zuwendung\nist auf einen Höchstbetrag zu begrenzen."}
        assert satzfilter.beleg_pruefen("Die Zuwendung ist auf einen Höchstbetrag", payload)


class TestKennungFinden:
    """Das Modell gibt Blockkennungen zurück — manchmal leicht daneben."""

    def test_genaue_kennung(self):
        assert satzfilter.kennung_finden("0002", ["0001", "0002"]) == "0002"

    def test_unbekannte_kennung_wird_nicht_geraten(self):
        assert satzfilter.kennung_finden("0099", ["0001", "0002"]) is None
