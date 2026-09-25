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


FELD_MEHRFACH = {
    "id": "recipients", "label": "Zuwendungsempfänger", "kind": "checkbox",
    "options": [
        {"value": "natural", "label": "Natürliche Personen"},
        {"value": "private", "label": "Juristische Personen des privaten Rechts"},
        {"value": "municipal", "label": "Kommunen und kommunale Einrichtungen"},
    ],
}


class TestMehrfachauswahl:
    """Der Empfängerkreis, an dem der kommunale Höchstsatz hängt.

    Im Durchlauf vom 22.09.2026 blieb das Feld dreimal leer, obwohl die Bearbeiterin die
    Gruppen wörtlich genannt hatte — einmal kam `municipal` zurück, zweimal nichts. Das
    Gespräch kam dadurch nicht weiter, und die 80-Prozent-Regel hatte nie ihre Eingangsgröße.

    Zwei Ursachen, beide hier abgedeckt: das Feld war dem Modell als Einfachauswahl
    beschrieben, und es sah nur die Kennungen, nicht die Beschriftungen.
    """

    def test_liste_bleibt_liste(self):
        v = {"feld": "recipients", "wert": ["municipal", "private"],
             "quelle": "eingabe", "konfidenz": 0.9}
        vorschlag._pruefen(v, FELD_MEHRFACH, [])
        assert v["wert"] == ["municipal", "private"]
        assert v["status"] == "suggested"

    def test_einzelwert_wird_zur_liste(self):
        v = {"feld": "recipients", "wert": "municipal", "quelle": "eingabe", "konfidenz": 0.9}
        vorschlag._pruefen(v, FELD_MEHRFACH, [])
        assert v["wert"] == ["municipal"]

    def test_beschriftung_statt_kennung_wird_verstanden(self):
        """Das Modell antwortet mitunter mit dem, was es vorlesen würde."""
        v = {"feld": "recipients", "wert": ["Kommunen und kommunale Einrichtungen"],
             "quelle": "eingabe", "konfidenz": 0.9}
        vorschlag._pruefen(v, FELD_MEHRFACH, [])
        assert v["wert"] == ["municipal"]

    def test_ein_unbekannter_eintrag_verwirft_nicht_die_uebrigen(self):
        v = {"feld": "recipients", "wert": ["municipal", "Vereine"],
             "quelle": "eingabe", "konfidenz": 0.9}
        befunde = vorschlag._pruefen(v, FELD_MEHRFACH, [])
        assert v["wert"] == ["municipal"]
        assert v["status"] == "suggested"
        assert any("gehört nicht zur Auswahl" in b for b in befunde)

    def test_nur_unbekanntes_ist_ungueltig(self):
        v = {"feld": "recipients", "wert": ["Vereine"], "quelle": "eingabe", "konfidenz": 0.9}
        vorschlag._pruefen(v, FELD_MEHRFACH, [])
        assert v["status"] == "invalid"

    def test_doppelte_nennung_zaehlt_einmal(self):
        v = {"feld": "recipients",
             "wert": ["municipal", "Kommunen und kommunale Einrichtungen"],
             "quelle": "eingabe", "konfidenz": 0.9}
        vorschlag._pruefen(v, FELD_MEHRFACH, [])
        assert v["wert"] == ["municipal"]


class TestFelderText:
    def test_mehrfachauswahl_wird_als_liste_angekuendigt(self):
        text = vorschlag._felder_text([FELD_MEHRFACH])
        assert "Mehrfachauswahl" in text
        assert "genau eine" not in text

    def test_einfachauswahl_bleibt_einfach(self):
        text = vorschlag._felder_text([FELD_AUSWAHL])
        assert "genau eine" in text
        assert "Mehrfachauswahl" not in text

    def test_beschriftungen_stehen_im_prompt(self):
        """Ohne sie muss das Modell „Kommunen" auf `municipal` raten."""
        text = vorschlag._felder_text([FELD_MEHRFACH])
        assert "Kommunen und kommunale Einrichtungen" in text
        assert "municipal" in text


class TestKonfidenzOhneDeckung:
    """Die Selbstauskunft des Modells trägt nicht, wo die Eingabe schweigt.

    Durchlauf vom 22.09.2026: im Freitextfeld „Beihilferechtliche Rechtsgrundlage" stand
    „Die Förderung stellt Beihilfen im Sinne von Artikel 107 Absatz 1 AEUV dar" — mit 0,9
    Konfidenz, ohne ein Wort dazu in der Eingabe. Gekappt wurden bis dahin nur Auswahlfelder.
    """

    def test_freitext_ohne_deckung_wird_gekappt(self):
        v = {"feld": "stateAidBasis", "wert": "Die Förderung stellt eine Beihilfe dar.",
             "quelle": "musterbaustein", "konfidenz": 0.9}
        befunde = vorschlag._pruefen(
            v, {"id": "stateAidBasis", "label": "Beihilferechtliche Rechtsgrundlage",
                "kind": "textarea"},
            [], eingabe="Wir wollen Tierheime fördern.")
        assert v["konfidenz"] <= vorschlag.KONFIDENZ_ABGELEITET
        assert any("aus dem Regelfall abgeleitet" in b for b in befunde)

    def test_gedeckter_freitext_behaelt_die_konfidenz(self):
        eingabe = "Wir wollen den Tierschutz im Land Brandenburg verbessern."
        v = {"feld": "goal", "wert": "Verbesserung des Tierschutzes im Land Brandenburg",
             "quelle": "eingabe", "konfidenz": 0.95,
             "deckung": "Wir wollen den Tierschutz im Land Brandenburg verbessern."}
        vorschlag._pruefen(v, FELD_TEXT, [], eingabe=eingabe)
        assert v["konfidenz"] == 0.95


class TestListeAusModellantwort:
    """JSON in JSON — der Weg, auf dem die Mehrfachauswahl dreimal verlorenging.

    Verlangt war eine JSON-Liste, geliefert wurde sie als Zeichenkette:
    '["municipal","private"]'. Daraus wurde ein einziger Eintrag, der zu keiner Option
    passte, und der ganze Empfängerkreis fiel als ungültig durch — obwohl das Modell die
    richtige Antwort gegeben hatte.
    """

    def test_json_liste_als_zeichenkette(self):
        assert vorschlag._als_liste('["municipal","private"]') == ["municipal", "private"]

    def test_echte_liste_bleibt(self):
        assert vorschlag._als_liste(["a", "b"]) == ["a", "b"]

    def test_aufzaehlung_in_einer_zeile(self):
        assert vorschlag._als_liste("municipal, private") == ["municipal", "private"]
        assert vorschlag._als_liste("municipal und private") == ["municipal", "private"]

    def test_einzelwert(self):
        assert vorschlag._als_liste("municipal") == ["municipal"]

    def test_nichts_ergibt_nichts(self):
        assert vorschlag._als_liste(None) == []
        assert vorschlag._als_liste("") == []

    def test_kaputtes_json_faellt_auf_die_trennung_zurueck(self):
        assert vorschlag._als_liste('["municipal", private]') == ['["municipal"', 'private]']

    def test_der_ganze_weg_bis_zum_feldwert(self):
        """Was am 22.09.2026 wirklich vom Dienst kam."""
        v = {"feld": "recipients", "wert": '["municipal","private"]',
             "quelle": "eingabe", "konfidenz": 0.99}
        vorschlag._pruefen(v, FELD_MEHRFACH, [])
        assert v["wert"] == ["municipal", "private"]
        assert v["status"] == "suggested"


class TestDoppelteWerte:
    """Zwei Felder, ein Satz — im Durchlauf vom 22.09.2026 Förderziel und Zuwendungszweck.

    Bei einer langen Eingabe, die mehrere Bausteine auf einmal deckt, kopierte das Modell
    denselben Rohsatz in beide Felder, jeweils mit Konfidenz 0,99. Bei kurzen Eingaben waren
    dieselben Felder sauber getrennt — es ist eine Frage der Sorgfalt unter Last, und ein
    Zeichenvergleich fängt sie unabhängig davon ab.
    """

    satz = ("Wir wollen erreichen, dass es weniger freilebende Katzen im Land Brandenburg "
            "gibt und diese Tiere nicht länger unter Krankheiten und Unterernährung leiden.")

    def test_das_spaetere_feld_wird_verworfen(self):
        v = [{"feld": "goal", "wert": self.satz, "konfidenz": 0.99},
             {"feld": "purpose", "wert": self.satz, "konfidenz": 0.99}]
        befunde = vorschlag._doppelte_werte_verwerfen(v)
        assert v[0]["wert"] == self.satz                 # das erste bleibt
        assert v[1]["wert"] == vorschlag.UNKLAR          # das zweite nicht
        assert v[1]["status"] == "unklar"
        assert v[1]["konfidenz"] == 0.0
        assert any("wortgleich" in b and "goal" in b for b in befunde)

    def test_unterschiedliche_werte_bleiben(self):
        v = [{"feld": "goal", "wert": self.satz},
             {"feld": "purpose", "wert": "Gefördert wird die Kastration freilebender Katzen "
                                          "durch Tierärztinnen und Tierärzte im Land."}]
        assert vorschlag._doppelte_werte_verwerfen(v) == []
        assert v[1]["wert"] != vorschlag.UNKLAR

    def test_kurze_werte_duerfen_sich_wiederholen(self):
        """Zwei Datumsangaben, zweimal „ja", zweimal derselbe Ort — alles zulässig."""
        v = [{"feld": "validFrom", "wert": "2027-01-01"},
             {"feld": "validUntil", "wert": "2027-01-01"}]
        assert vorschlag._doppelte_werte_verwerfen(v) == []
        assert v[1]["wert"] == "2027-01-01"

    def test_listen_und_zahlen_bleiben_unberuehrt(self):
        v = [{"feld": "recipients", "wert": ["municipal"]},
             {"feld": "auditRights", "wert": ["municipal"]},
             {"feld": "fundingRate", "wert": 90},
             {"feld": "maximum", "wert": 90}]
        assert vorschlag._doppelte_werte_verwerfen(v) == []

    def test_unterschiedliche_schreibweise_zaehlt_als_gleich(self):
        v = [{"feld": "goal", "wert": self.satz},
             {"feld": "purpose", "wert": "  " + self.satz.upper() + " "}]
        assert len(vorschlag._doppelte_werte_verwerfen(v)) == 1


FELD_AUSZAHLUNG = {
    "id": "payment", "label": "Anforderungs- und Auszahlungsverfahren", "kind": "radio",
    "options": [
        {"value": "advance", "label": "Vorschussprinzip"},
        {"value": "refund", "label": "Erstattungsprinzip"},
    ],
}


class TestDeckungOhneBezug:
    """Die Deckung ist echt — trägt sie auch den Wert?

    Durchlauf vom 24.09.2026: unter „Anforderungs- und Auszahlungsverfahren:
    Erstattungsprinzip" stand die Deckung „Fördersatz beträgt 90 Prozent, als
    Anteilfinanzierung in Form eines Zuschusses". Ein echtes Zitat aus der Eingabe, das über
    Vorschuss oder Erstattung nichts sagt — und ein ungedeckter Wert, der sich als gedeckt
    ausgibt, entgeht auch dem aufmerksamen Gegenlesen.

    Kein Befund, nur eine Herabstufung: die Prüfung ist grob und würde sonst ausgerechnet die
    gut formulierten Umschreibungen anmahnen.
    """

    def test_deckung_ohne_bezug_wird_herabgestuft(self):
        eingabe = ("Der Fördersatz beträgt 90 Prozent, als Anteilfinanzierung in Form "
                   "eines Zuschusses.")
        v = {"feld": "payment", "wert": "refund", "quelle": "eingabe", "konfidenz": 0.9,
             "deckung": "Der Fördersatz beträgt 90 Prozent, als Anteilfinanzierung in Form "
                        "eines Zuschusses."}
        befunde = vorschlag._pruefen(v, FELD_AUSZAHLUNG, [], eingabe=eingabe)
        assert v["gedeckt_durch_eingabe"] is False
        assert any("ohne erkennbaren Bezug" in b for b in befunde)

    def test_echte_deckung_bleibt(self):
        eingabe = "Die Auszahlung erfolgt nach dem Erstattungsprinzip."
        v = {"feld": "payment", "wert": "refund", "quelle": "eingabe", "konfidenz": 0.9,
             "deckung": "Die Auszahlung erfolgt nach dem Erstattungsprinzip."}
        vorschlag._pruefen(v, FELD_AUSZAHLUNG, [], eingabe=eingabe)
        assert v["gedeckt_durch_eingabe"] is True

    def test_zahlen_zaehlen_als_bezug(self):
        """„90 Prozent" deckt einen Fördersatz von 90, auch ohne gemeinsames Wort."""
        feld = {"id": "fundingRate", "label": "Fördersatz in Prozent", "kind": "number"}
        eingabe = "Gewährt werden 90 Prozent der zuwendungsfähigen Ausgaben."
        v = {"feld": "fundingRate", "wert": 90, "quelle": "eingabe", "konfidenz": 0.9,
             "deckung": "Gewährt werden 90 Prozent der zuwendungsfähigen Ausgaben."}
        vorschlag._pruefen(v, feld, [], eingabe=eingabe)
        assert v["gedeckt_durch_eingabe"] is True

    def test_beschriftung_der_option_zaehlt(self):
        eingabe = "Vorgesehen ist das Vorschussprinzip."
        v = {"feld": "payment", "wert": "advance", "quelle": "eingabe", "konfidenz": 0.9,
             "deckung": "Vorgesehen ist das Vorschussprinzip."}
        vorschlag._pruefen(v, FELD_AUSZAHLUNG, [], eingabe=eingabe)
        assert v["gedeckt_durch_eingabe"] is True

    def test_ohne_deckung_bleibt_alles_wie_bisher(self):
        v = {"feld": "payment", "wert": "refund", "quelle": "musterbaustein", "konfidenz": 0.9}
        vorschlag._pruefen(v, FELD_AUSZAHLUNG, [], eingabe="Irgendwas anderes.")
        assert v["gedeckt_durch_eingabe"] is False


class TestBelegMitPlatzhalter:
    """Ein Belegzitat mit offener Lücke der Vorlage belegt nichts.

    Ein Beleg darf aus einem Musterbaustein stammen — der Satzrahmen ist oft die genauere
    Quelle. Steht darin aber noch der Platzhalter, kann er keinen konkreten Wert stützen. In
    der Messung vom 25.09.2026 waren das vier der neun nicht tragenden Belege: ein Mustersatz
    zur Bagatellgrenze mit offenem Betrag unter dem Wert 1000, eine Frist „bis zum XXX" unter
    einer Antragsfrist, und zweimal der Mustersatz zum Inkrafttreten mit zwei offenen Daten.
    Die Proben unten sind nachgebaut, nicht aus der Vorlage zitiert.
    """

    def test_platzhalter_wird_erkannt(self):
        for text in ("Der Mindestbetrag der Zuwendung beträgt XX Euro.",
                     "bis zum XXX",
                     "bei der zuständigen Stelle <Bezeichnung> einzureichen"):
            assert vorschlag._NOCH_PLATZHALTER.search(text), text

    def test_echter_rechtstext_bleibt_unberuehrt(self):
        """Enger gefasst als in richtlinie.py — sonst fällt gewöhnliches Amtsdeutsch durch."""
        for text in ("Der Fördersatz beträgt bis zu 90 Prozent der zuwendungsfähigen Ausgaben.",
                     # „ggf." gilt in der VORLAGE als Ausfüllhinweis, in einer echten
                     # Richtlinie ist es ein normales Wort.
                     "Die ggf. erforderlichen Unterlagen sind nachzureichen.",
                     "Zuwendungsempfangende nach Nummer 2.1 erhalten bis zu 800 000 Euro."):
            assert not vorschlag._NOCH_PLATZHALTER.search(text), text
