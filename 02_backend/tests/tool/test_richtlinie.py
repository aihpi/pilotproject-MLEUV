"""Der Zusammenbau der Richtlinie — die Teile, die ohne Modell auskommen.

Der Text selbst wird formuliert und ist damit Sache der Eval. Was hier geprüft wird, ist
das, was gerechnet und nicht erzeugt wird: welche Werte überhaupt hineindürfen, woher sie
kamen, und ob der fertige Text sich auf seine Quellen zurückführen lässt.

Die Gegenprüfung ist der eigentliche Gegenstand. Sie ist die Stelle, an der ein
dazugedichteter Satz auffällt — und dazugedichtete Sätze sind in einem Rechtstext der
teuerste Fehler, den dieses Werkzeug machen kann.
"""
import richtlinie


def entwurf(felder, vermerk=None, befunde=None):
    return {
        "sections": {"1": {"fields": felder}},
        "vermerk": vermerk or [],
        "validation": {"issues": befunde or []},
    }


def feld(wert, bestaetigt=True, **rest):
    return {"value": wert, "confirmedByUser": bestaetigt, **rest}


class TestBestaetigteWerte:
    def test_nur_bestaetigte_kommen_in_den_text(self):
        """Ein Vorschlag, den niemand angenommen hat, ist keine Regelung."""
        d = entwurf({"a": feld("ja"), "b": feld("nein", bestaetigt=False)})
        assert [w["feld"] for w in richtlinie.bestaetigte_werte(d, 1)] == ["a"]

    def test_leere_werte_fallen_weg(self):
        d = entwurf({"a": feld("ja"), "leer": feld(""), "nichts": feld(None),
                     "liste": feld([])})
        assert [w["feld"] for w in richtlinie.bestaetigte_werte(d, 1)] == ["a"]

    def test_herkunft_wird_mitgeführt(self):
        d = entwurf({"a": feld("ja", source="user-chat", musterbaustein="1.1",
                               fundstelle="RL X, Nummer 1.1")})
        w = richtlinie.bestaetigte_werte(d, 1)[0]
        assert w["herkunft"] == "user-chat"
        assert w["musterbaustein"] == "1.1"
        assert w["fundstelle"] == "RL X, Nummer 1.1"

    def test_unbekannter_abschnitt_ergibt_leere_liste(self):
        assert richtlinie.bestaetigte_werte(entwurf({"a": feld("ja")}), 7) == []


class TestBegruendungen:
    def test_pruefungen_des_abschnitts_haengen_am_wert(self):
        """Das Modell verlangt je Entscheidung, „welche rechtliche Prüfung durchgeführt wurde"."""
        d = entwurf({"a": feld("ja")},
                    vermerk=[{"sectionId": "1", "regel": "bagatellgrenze"},
                             {"sectionId": "5", "regel": "vollfinanzierung"}])
        b = richtlinie.begruendungen(d, 1)[0]
        assert b["pruefungen"] == ["bagatellgrenze"]  # nicht die des fremden Abschnitts

    def test_befunde_haengen_am_richtigen_feld(self):
        d = entwurf({"a": feld("ja"), "b": feld("auch")},
                    befunde=[{"sectionId": "1", "fieldId": "b", "regel": "testregel"}])
        nach_feld = {b["feld"]: b["hinweise"] for b in richtlinie.begruendungen(d, 1)}
        assert nach_feld["a"] == []
        assert nach_feld["b"] == ["testregel"]


class TestTextpruefung:
    bausteine = [{"nummer": "1.1", "text": "Das Land Brandenburg gewährt nach Maßgabe "
                                           "dieser Richtlinie Zuwendungen zur Förderung."}]
    werte = [{"feld": "goal", "wert": "Verbesserung des Tierschutzes im Land Brandenburg"}]

    def test_satz_aus_den_quellen_ist_unauffaellig(self):
        text = ("Das Land Brandenburg gewährt nach Maßgabe dieser Richtlinie Zuwendungen "
                "zur Förderung.")
        assert richtlinie.pruefe_text(text, self.bausteine, self.werte) == []

    def test_dazugedichteter_satz_wird_gemeldet(self):
        """Der Fehler, um dessentwillen die Prüfung existiert."""
        text = ("Antragsberechtigt sind ausschließlich eingetragene Vereine mit Sitz in "
                "Potsdam sowie kommunale Eigenbetriebe der Landeshauptstadt.")
        befunde = richtlinie.pruefe_text(text, self.bausteine, self.werte)
        assert len(befunde) == 1
        assert "ohne Rückhalt" in befunde[0]

    def test_offener_platzhalter_wird_gemeldet(self):
        text = "Der Zuschuss beträgt bis zu XX Prozent der zuwendungsfähigen Kosten."
        befunde = richtlinie.pruefe_text(text, self.bausteine, self.werte)
        assert any("Platzhalter" in b for b in befunde)

    def test_spitze_klammern_gelten_auch_als_platzhalter(self):
        text = "Die Anträge werden durch die Bewilligungsbehörde <Bezeichnung> entschieden."
        assert any("Platzhalter" in b
                   for b in richtlinie.pruefe_text(text, self.bausteine, self.werte))

    def test_kurze_zeilen_werden_nicht_geprueft(self):
        """Überschriften und Formeln wie „Im Auftrag" sagen bei einem Wortvergleich nichts."""
        assert richtlinie.pruefe_text("Im Auftrag", self.bausteine, self.werte) == []

    def test_leerer_text_ist_kein_befund(self):
        assert richtlinie.pruefe_text("", self.bausteine, self.werte) == []


class TestAbschnittOhneAngaben:
    def test_ohne_bestaetigte_werte_wird_nichts_geschrieben(self):
        """Ein Abschnitt allein aus Musterbausteinen wäre die Musterrichtlinie, nicht diese.

        Und er sähe fertig aus, ohne es zu sein — der gefährlichere der beiden Fehler.
        Deshalb kein Modellaufruf: die Funktion kehrt vorher um.
        """
        text, nachweis = richtlinie.abschnitt_bauen(entwurf({}), 1)
        assert text == ""
        assert nachweis["uebersprungen"]
        assert nachweis["modelle"] == []


class TestVerworfeneOptionen:
    """Der Fehler aus dem ersten vollständigen Lauf.

    Gewählt war Anteilfinanzierung, im Text stand ein Satz zur Festbetragsfinanzierung —
    gedeckt durch einen Musterbaustein und deshalb für `pruefe_text` unsichtbar.
    """
    felder = [{"id": "financingType", "options": [
        {"value": "share", "label": "Anteilfinanzierung"},
        {"value": "fixed", "label": "Festbetragsfinanzierung"},
        {"value": "full", "label": "Vollfinanzierung"}]}]
    werte = [{"feld": "financingType", "wert": "share"}]

    def test_verworfene_option_im_text_wird_gemeldet(self):
        text = "Für Festbetragsfinanzierung gilt: Der Zuschuss beträgt je Einheit."
        befunde = richtlinie.pruefe_verworfene_optionen(text, self.felder, self.werte)
        assert len(befunde) == 1
        assert "Festbetragsfinanzierung" in befunde[0]
        assert "Anteilfinanzierung" in befunde[0]      # was stattdessen gilt

    def test_gewaehlte_option_ist_unauffaellig(self):
        text = "Die Zuwendung wird als Anteilfinanzierung gewährt."
        assert richtlinie.pruefe_verworfene_optionen(text, self.felder, self.werte) == []

    def test_mehrfachauswahl_wird_elementweise_behandelt(self):
        felder = [{"id": "recipients", "options": [
            {"value": "private", "label": "Juristische Personen des privaten Rechts"},
            {"value": "municipal", "label": "Kommunen und kommunale Einrichtungen"},
            {"value": "research", "label": "Hochschulen und Forschungseinrichtungen"}]}]
        werte = [{"feld": "recipients", "wert": ["private", "municipal"]}]
        text = "Antragsberechtigt sind Kommunen und kommunale Einrichtungen."
        assert richtlinie.pruefe_verworfene_optionen(text, felder, werte) == []
        text2 = "Auch Hochschulen und Forschungseinrichtungen sind antragsberechtigt."
        assert len(richtlinie.pruefe_verworfene_optionen(text2, felder, werte)) == 1

    def test_kurze_beschriftungen_loesen_nicht_aus(self):
        """„Ja", „Nein", „Land" träfen in jedem zweiten Satz zufällig."""
        felder = [{"id": "x", "options": [{"value": "a", "label": "Ja"},
                                          {"value": "b", "label": "Nein"}]}]
        text = "Nein, das ist hier nicht gemeint, und ja auch nicht."
        assert richtlinie.pruefe_verworfene_optionen(text, felder, [{"feld": "x", "wert": "a"}]) == []

    def test_ohne_felddefinitionen_entfaellt_die_pruefung(self):
        assert richtlinie.pruefe_verworfene_optionen("beliebig", None, self.werte) == []


class TestZahlenvergleich:
    """Fehlalarm aus dem ersten vollständigen Lauf.

    Gemeldet wurde „Die maximale Fördersumme beträgt 500 000 Euro" als unbelegt, obwohl
    500000 ein bestätigter Wert war — getrennt durch ein schmales geschütztes Leerzeichen.
    Ein Fehlalarm ausgerechnet an der Stelle, an der die Prüfung Vertrauen schaffen soll.
    """
    bausteine = [{"nummer": "5.5", "text": "Die maximale Fördersumme beträgt höchstens "
                                           "Euro und wird nicht überschritten."}]
    werte = [{"feld": "maximum", "wert": 500000}]

    def test_tausendertrennung_gilt_als_dieselbe_zahl(self):
        text = "Die maximale Fördersumme beträgt 500 000 Euro und wird nicht überschritten."
        assert richtlinie.pruefe_text(text, self.bausteine, self.werte) == []

    def test_auch_mit_punkt_als_trennzeichen(self):
        text = "Die maximale Fördersumme beträgt 500.000 Euro und wird nicht überschritten."
        assert richtlinie.pruefe_text(text, self.bausteine, self.werte) == []

    def test_eine_andere_zahl_bleibt_eine_andere(self):
        """Die Normalisierung darf nicht so weit gehen, dass sie Zahlen gleichmacht."""
        assert richtlinie._norm("500 000") == richtlinie._norm("500000")
        assert richtlinie._norm("500 000") != richtlinie._norm("400000")


class TestUeberschriften:
    """Die Musterrichtlinie ist eine Tabelle; ihre Spalte „Textbausteine" enthält zweierlei.

    Gliederungspunkte und Mustersätze standen im Prompt nebeneinander und sahen gleich aus.
    Das Ergebnis war im Text zu besichtigen: „Finanzierungsart: Anteilfinanzierung. Form
    der Zuwendung: Zuschuss." — das Modell gab Überschriften als Sätze wieder.
    """

    def test_kurzer_eintrag_ohne_satzende_ist_ueberschrift(self):
        assert richtlinie.ist_ueberschrift({"nummer": "5.2", "text": "Finanzierungsart"})

    def test_ganzer_satz_ist_keine_ueberschrift(self):
        assert not richtlinie.ist_ueberschrift(
            {"nummer": "5.5.n", "text": "Der Zuschuss beträgt bis zu XX Prozent der "
                                        "zuwendungsfähigen Kosten."})

    def test_langer_eintrag_ohne_satzende_bleibt_satzrahmen(self):
        """Ein abgeschnittener Mustersatz ist keine Überschrift, nur unvollständig."""
        lang = "Die Zuwendung wird als Anteilfinanzierung gewährt und " + "x" * 60
        assert not richtlinie.ist_ueberschrift({"nummer": "5.n", "text": lang})

    def test_nummer_entscheidet_nicht(self):
        """Das `.n`-Suffix trennt die beiden nicht — 9 von 19 Einträgen ohne `.n` sind Sätze."""
        assert richtlinie.ist_ueberschrift({"nummer": "5.4.n", "text": "Höhe der Zuwendung"})
        assert not richtlinie.ist_ueberschrift(
            {"nummer": "5.1", "text": "Es handelt sich um eine Projektförderung nach "
                                      "Nummer 2.1 der VV zu § 44 LHO."})

    def test_gliederung_wird_getrennt_ausgewiesen(self):
        text = richtlinie._bausteine_text([
            {"nummer": "5.2", "text": "Finanzierungsart"},
            {"nummer": "5.2.n", "text": "Die Zuwendung wird als Anteilfinanzierung gewährt."},
        ])
        assert "GLIEDERUNG" in text
        assert "KEINE Sätze" in text
        # Der Satzrahmen steht weiterhin als Musterbaustein da, nicht in der Gliederung.
        assert "[Musterbaustein 5.2.n]" in text
        assert "[Musterbaustein 5.2]" not in text

    def test_ohne_gliederung_keine_leere_ueberschrift(self):
        text = richtlinie._bausteine_text(
            [{"nummer": "1.1", "text": "Das Land gewährt Zuwendungen nach dieser Richtlinie."}])
        assert "GLIEDERUNG" not in text


class TestFehlendeWerte:
    """Der Gegenwächter — gegen den gefährlicheren der beiden Fehler.

    Als die Regel „ein Musterbaustein ohne Angabe bleibt weg" eingeführt wurde, verschwand
    der bestätigte Fördersatz von 60 Prozent lautlos aus Abschnitt 5. Ein Widerspruch im
    Text fällt beim Lesen auf, eine fehlende Regelung nicht.
    """
    felder = [{"id": "fundingRate", "label": "Fördersatz in Prozent"},
              {"id": "financingType", "label": "Finanzierungsart", "options": [
                  {"value": "share", "label": "Anteilfinanzierung"}]},
              {"id": "eligibleCosts", "label": "Zuwendungsfähige Ausgaben"}]
    werte = [{"feld": "fundingRate", "wert": 60},
             {"feld": "financingType", "wert": "share"},
             {"feld": "eligibleCosts", "wert": "Baukosten und Ausstattung von Tierheimgebäuden"}]

    def test_fehlende_zahl_wird_gemeldet(self):
        text = "Die Bagatellgrenze beträgt 5000 Euro."
        befunde = richtlinie.pruefe_fehlende_werte(text, self.felder, self.werte)
        assert any("Fördersatz" in b for b in befunde)

    def test_fehlende_auswahl_wird_gemeldet(self):
        text = "Die Bagatellgrenze beträgt 5000 Euro."
        befunde = richtlinie.pruefe_fehlende_werte(text, self.felder, self.werte)
        assert any("Finanzierungsart" in b for b in befunde)

    def test_vollstaendiger_text_ist_unauffaellig(self):
        text = ("Die Zuwendung wird als Anteilfinanzierung gewährt. Der Zuschuss beträgt "
                "bis zu 60 Prozent. Zuwendungsfähig sind Baukosten und Ausstattung von "
                "Tierheimgebäuden.")
        assert richtlinie.pruefe_fehlende_werte(text, self.felder, self.werte) == []

    def test_umformulierter_freitext_gilt_als_vorhanden(self):
        """Ein Wert wird beim Formulieren umgeschrieben; seine Substantive überleben das."""
        felder = [{"id": "goal", "label": "Förderziel"}]
        werte = [{"feld": "goal", "wert": "Verbesserung des Tierschutzes in Brandenburg"}]
        text = ("Zweck der Förderung ist es, den Tierschutz in Brandenburg nachhaltig zu "
                "verbessern und die Haltungsbedingungen zu heben.")
        assert richtlinie.pruefe_fehlende_werte(text, felder, werte) == []

    def test_zahl_mit_tausendertrennung_gilt_als_vorhanden(self):
        felder = [{"id": "maximum", "label": "Höchstbetrag in Euro"}]
        werte = [{"feld": "maximum", "wert": 500000}]
        text = "Der Zuschuss beträgt höchstens 500.000 Euro je Vorhaben."
        assert richtlinie.pruefe_fehlende_werte(text, felder, werte) == []


class TestKeinFehlalarmAusDemSatzrahmen:
    """Was schon im Musterbaustein steht, ist kein Hinweis auf eine Entscheidung.

    Erster Lauf über die Oberfläche: gewählt war „Zuwendung nach § 44 LHO", der Text enthielt
    die Standardformel „… und der Verwaltungsvorschriften zu § 44 LHO", und gemeldet wurde
    ein Widerspruch zur Option „Verwaltungsvorschriften".
    """
    felder = [{"id": "legalBasis", "options": [
        {"value": "lho44", "label": "Zuwendung nach § 44 LHO"},
        {"value": "administrative", "label": "Verwaltungsvorschriften"}]}]
    werte = [{"feld": "legalBasis", "wert": "lho44"}]
    text = ("Das Land Brandenburg gewährt nach Maßgabe dieser Richtlinie und der "
            "Verwaltungsvorschriften zu § 44 LHO Zuwendungen.")

    def test_formel_aus_dem_satzrahmen_loest_nicht_aus(self):
        bausteine = [{"nummer": "1.1", "text": self.text}]
        assert richtlinie.pruefe_verworfene_optionen(
            self.text, self.felder, self.werte, bausteine) == []

    def test_ohne_satzrahmen_wird_weiterhin_gemeldet(self):
        """Der Wächter darf nicht durch das blosse Weglassen der Bausteine stumm werden."""
        assert len(richtlinie.pruefe_verworfene_optionen(
            self.text, self.felder, self.werte, [])) == 1

    def test_eigene_behauptung_bleibt_ein_befund(self):
        """Steht die verworfene Option ausserhalb des Rahmens, ist sie eine Entscheidung."""
        bausteine = [{"nummer": "1.1", "text": "Das Land gewährt Zuwendungen."}]
        eigen = "Diese Förderung erfolgt auf Grundlage von Verwaltungsvorschriften."
        assert len(richtlinie.pruefe_verworfene_optionen(
            eigen, self.felder, self.werte, bausteine)) == 1


class TestSelbstbezeichnung:
    """Der Fehler aus dem ersten Word-Export.

    Gewählt war „Zuwendung nach § 44 LHO", im Text stand „nach Maßgabe dieser
    Verwaltungsvorschrift". Die Musterrichtlinie führt beide Varianten, der falsche Text war
    also durch einen Musterbaustein gedeckt — für die anderen Wächter unsichtbar.
    """
    zuwendung = [{"feld": "legalBasis", "wert": "lho44"}]
    vv = [{"feld": "legalBasis", "wert": "administrative"}]

    def test_falsche_selbstbezeichnung_wird_gemeldet(self):
        text = "Das Land gewährt nach Maßgabe dieser Verwaltungsvorschrift Finanzierungen."
        befunde = richtlinie.pruefe_selbstbezeichnung(text, self.zuwendung)
        assert len(befunde) == 1
        assert "Richtlinie" in befunde[0]

    def test_richtige_selbstbezeichnung_ist_unauffaellig(self):
        text = "Das Land gewährt nach Maßgabe dieser Richtlinie Zuwendungen."
        assert richtlinie.pruefe_selbstbezeichnung(text, self.zuwendung) == []

    def test_standardformel_bleibt_zulaessig(self):
        """„der Verwaltungsvorschriften zu § 44 LHO" steht in jeder Richtlinie."""
        text = ("Das Land gewährt nach Maßgabe dieser Richtlinie und der "
                "Verwaltungsvorschriften zu § 44 LHO Zuwendungen.")
        assert richtlinie.pruefe_selbstbezeichnung(text, self.zuwendung) == []

    def test_umgekehrter_fall(self):
        text = "Nach Maßgabe dieser Richtlinie werden Finanzierungen gewährt."
        befunde = richtlinie.pruefe_selbstbezeichnung(text, self.vv)
        assert len(befunde) == 1
        assert "Verwaltungsvorschrift" in befunde[0]

    def test_ohne_rechtsgrundlage_keine_aussage(self):
        text = "Nach Maßgabe dieser Verwaltungsvorschrift."
        assert richtlinie.pruefe_selbstbezeichnung(text, []) == []


class TestSatzrahmenEntlastetNurDieRechtsgrundlage:
    """Der Wächter schwieg genau dort, wo er gebraucht wurde.

    Durchlauf vom 22.09.2026: bestätigt war Anteilfinanzierung, im Text stand der
    Musterbaustein zur Festbetragsfinanzierung samt Platzhaltern XX und YY — und kein Befund.
    Ursache war die Entlastung durch den Satzrahmen: die Musterrichtlinie führt zu Baustein 5
    alle Finanzierungsarten auf, also steht die verworfene Option dort immer.

    Für `legalBasis` bleibt die Entlastung richtig, siehe TestKeinFehlalarmAusDemSatzrahmen.
    """
    felder = [{"id": "financingType", "options": [
        {"value": "share", "label": "Anteilfinanzierung"},
        {"value": "fixed", "label": "Festbetragsfinanzierung"}]}]
    werte = [{"feld": "financingType", "wert": "share"}]
    bausteine = [{"nummer": "5.2", "text": "Finanzierungsart: Anteilfinanzierung, "
                                           "Fehlbedarfsfinanzierung, Festbetragsfinanzierung."}]

    def test_verworfene_option_aus_dem_rahmen_wird_gemeldet(self):
        text = "Der Zuschuss beträgt für Vorhaben nach YY XX Euro je Einheit (Festbetragsfinanzierung)."
        befunde = richtlinie.pruefe_verworfene_optionen(
            text, self.felder, self.werte, self.bausteine)
        assert len(befunde) == 1
        assert "Festbetragsfinanzierung" in befunde[0]
        assert "Anteilfinanzierung" in befunde[0]

    def test_gewaehlte_option_bleibt_unauffaellig(self):
        text = "Die Zuwendung wird als Anteilfinanzierung gewährt."
        assert richtlinie.pruefe_verworfene_optionen(
            text, self.felder, self.werte, self.bausteine) == []


class TestNachbesserung:
    """Ein Befund soll behoben werden, nicht nur gemeldet.

    Durchlauf vom 22.09.2026: die Wächter fanden alles Richtige — ein Abschnitt ohne den
    bestätigten Fördergegenstand, ein Festbetragssatz trotz Anteilfinanzierung — und der
    fehlerhafte Text blieb trotzdem stehen. Ein Befund, den nur ein Mensch beheben kann,
    verschiebt die Arbeit, statt sie abzunehmen.

    Geprüft wird hier die Mechanik, nicht die Formulierung: wie oft gefragt wird, was
    zurückgeht und welcher Versuch gewinnt.
    """

    felder = [{"id": "goal", "label": "Förderziel"}]
    entw = {"sections": {"1": {"fields": {
        "goal": {"value": "Verbesserung des Tierschutzes", "confirmedByUser": True}}}},
        "vermerk": [], "validation": {"issues": []}}

    def _lauf(self, monkeypatch, antworten):
        """Lässt `chat` die vorgegebenen Antworten liefern und merkt sich die Aufrufe."""
        aufrufe = []

        def falsches_chat(verlauf, **_):
            aufrufe.append(verlauf)
            return antworten[len(aufrufe) - 1], "testmodell"

        monkeypatch.setattr(richtlinie, "chat", falsches_chat)
        monkeypatch.setattr(richtlinie.vorschlag, "rahmen", lambda *a, **k: [])
        text, nachweis = richtlinie.abschnitt_bauen(
            self.entw, 1, "Förderziel", felder=self.felder)
        return text, nachweis, aufrufe

    def test_sauberer_text_wird_nicht_nachgefragt(self, monkeypatch):
        gut = '{"text": "Ziel ist die Verbesserung des Tierschutzes.", ' \
              '"verwendete_bausteine": [], "offene_platzhalter": []}'
        text, nachweis, aufrufe = self._lauf(monkeypatch, [gut])
        assert nachweis["befunde"] == []
        assert len(aufrufe) == 1                      # kein zweiter Aufruf
        assert "Verbesserung des Tierschutzes" in text

    def test_befund_loest_einen_zweiten_versuch_aus(self, monkeypatch):
        schlecht = '{"text": "Dieser Abschnitt regelt Verschiedenes zu dem Vorhaben und ' \
                   'seinen Zielen.", "verwendete_bausteine": [], "offene_platzhalter": []}'
        gut = '{"text": "Ziel ist die Verbesserung des Tierschutzes.", ' \
              '"verwendete_bausteine": [], "offene_platzhalter": []}'
        text, nachweis, aufrufe = self._lauf(monkeypatch, [schlecht, gut])
        assert len(aufrufe) == 2
        assert nachweis["befunde"] == []
        assert "Verbesserung des Tierschutzes" in text

    def test_die_beanstandung_geht_mit_zurueck(self, monkeypatch):
        schlecht = '{"text": "Dieser Abschnitt regelt Verschiedenes zu dem Vorhaben und ' \
                   'seinen Zielen.", "verwendete_bausteine": [], "offene_platzhalter": []}'
        _, _, aufrufe = self._lauf(monkeypatch, [schlecht, schlecht])
        nachfrage = aufrufe[1][-1]["content"]
        assert "beanstandet" in nachfrage
        assert "Förderziel" in nachfrage                 # der konkrete Befund
        assert "Erfinde nichts hinzu" in nachfrage       # und die Schranke dazu

    def test_hoechstens_ein_zweiter_versuch(self, monkeypatch):
        schlecht = '{"text": "Dieser Abschnitt regelt Verschiedenes zu dem Vorhaben und ' \
                   'seinen Zielen.", "verwendete_bausteine": [], "offene_platzhalter": []}'
        _, nachweis, aufrufe = self._lauf(monkeypatch, [schlecht, schlecht])
        assert len(aufrufe) == richtlinie.NACHBESSERUNG_VERSUCHE + 1
        assert nachweis["befunde"]                        # bleibt sichtbar, wenn es bleibt

    def test_der_bessere_versuch_gewinnt(self, monkeypatch):
        """Nachbessern darf nie verschlechtern."""
        gut = '{"text": "Ziel ist die Verbesserung des Tierschutzes.", ' \
              '"verwendete_bausteine": [], "offene_platzhalter": []}'
        schlechter = '{"text": "Die Förderung dient dem Erhalt historischer Stadtkerne ' \
                     'und ihrer baulichen Substanz.", "verwendete_bausteine": [], ' \
                     '"offene_platzhalter": []}'
        # Erster Versuch mit einem Befund, zweiter mit mehr — der erste muss gewinnen.
        text, nachweis, aufrufe = self._lauf(monkeypatch, [gut, schlechter])
        assert "Verbesserung des Tierschutzes" in text

    def test_kaputtes_json_im_zweiten_versuch_behaelt_den_ersten(self, monkeypatch):
        schlecht = '{"text": "Dieser Abschnitt regelt Verschiedenes zu dem Vorhaben und ' \
                   'seinen Zielen.", "verwendete_bausteine": [], "offene_platzhalter": []}'
        text, nachweis, _ = self._lauf(monkeypatch, [schlecht, "kein JSON"])
        assert "Verschiedenes" in text
        assert "fehler" not in nachweis
