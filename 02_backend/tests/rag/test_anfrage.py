"""Bildung der Suchanfragen aus dem, was im Werkzeug ankommt.

Im Werkzeug kommt keine Frage an, sondern eine Situation: die Nutzerin ist in einem Abschnitt
und hat einen Entwurfssatz getippt. Dieses Modul macht daraus mehrere Teilanfragen. Es ist
reine Textverarbeitung — kein Netz nötig.
"""
import pytest

import anfrage


class TestZerlegen:
    """Der Vorspann trägt die Basisangaben und ist als Suchbegriff oft das Wertvollste."""

    def test_vorspann_und_rest_werden_getrennt(self):
        vorspann, rest = anfrage.zerlegen(
            "Abschnitt 6, Projektförderung an einen Verein, ANBest-P. Reicht das so?")
        assert vorspann == "Projektförderung an einen Verein, ANBest-P"
        assert rest == "Reicht das so?"

    def test_ohne_vorspann_bleibt_alles_rest(self):
        vorspann, rest = anfrage.zerlegen("Was gehört in den Zuwendungszweck?")
        assert vorspann == ""
        assert rest == "Was gehört in den Zuwendungszweck?"

    def test_leere_eingabe(self):
        assert anfrage.zerlegen(None) == ("", "")


class TestKern:
    def test_entwurfszitat_schlaegt_den_rest(self):
        """Steht ein Entwurfssatz in Anführungszeichen, ist er der suchbare Kern."""
        kern = anfrage.kern(
            'Abschnitt 1, Landesmittel. Entwurf: „Das Land gewährt Zuwendungen zur '
            'Förderung von Vorhaben der Tierheimförderung." Was fehlt?')
        assert "Tierheimförderung" in kern
        assert "Was fehlt" not in kern

    def test_fuellwoerter_fallen_weg(self):
        kern = anfrage.kern("Ist die Bagatellgrenze so zulässig?")
        assert "Bagatellgrenze" in kern
        for ballast in ("ist", "zulässig"):
            assert ballast not in kern.lower().split()


class TestAnfragen:
    def test_abschnittsthemen_kommen_dazu(self):
        """Ein Abschnitt hat mehrere Pflichtelemente; eine Suche holt sie nicht in einem Zug."""
        teile = anfrage.anfragen("Abschnitt 5, Festbeträge. Reicht das?", abschnitt_nr=5)
        assert len(teile) > len(anfrage.ABSCHNITT_THEMEN[5])
        for thema in anfrage.ABSCHNITT_THEMEN[5]:
            assert thema in teile

    def test_ohne_abschnitt_nur_der_text(self):
        teile = anfrage.anfragen("Bagatellgrenze bei Landesmitteln", abschnitt_nr=None)
        assert teile and all("Zuwendungsart" not in t for t in teile)

    def test_alle_acht_bausteine_haben_themen(self):
        """Die Schlüssel 1-8 entsprechen den Bausteinen der Richtlinie."""
        assert sorted(anfrage.ABSCHNITT_THEMEN) == [1, 2, 3, 4, 5, 6, 7, 8]
        assert all(anfrage.ABSCHNITT_THEMEN[n] for n in range(1, 9))


class TestMustersatzJeFeld:
    """Die zweite Teilanfrage der Suche je Feld. Die Fälle sind die echten Bezeichner des
    Bausteins 5, an denen die Auswahl am 28.10.2026 scheiterte."""

    @pytest.fixture
    def baustein5(self, monkeypatch):
        import musterbausteine
        daten = {5: [
            {"nummer": "5.1", "text": "Zuwendungsart: Projektförderung"},
            {"nummer": "5.2", "text": "Finanzierungsart: Anteil-/Voll- /Fehlbedarfsfinanzierung"},
            {"nummer": "5.3", "text": "Form der Zuwendung: Zuschuss/Zuweisung"},
            {"nummer": "5.4.n", "text": "Zuwendungsfähig sind (bspw.): Investitionskosten zur "
                                        "Umsetzung der Vorhaben"},
            {"nummer": "5.4.n", "text": "Bagatellgrenze: Die Bagatellgrenze für die Zuwendung "
                                        "beträgt abweichend von § 44 LHO XX Euro."},
        ]}
        monkeypatch.setattr(musterbausteine, "laden", lambda *a, **k: daten)

    def test_feld_bekommt_seinen_bezeichner(self, baustein5):
        assert anfrage.mustersaetze_zu("Finanzierungsart", 5)[0].startswith("Finanzierungsart:")
        assert anfrage.mustersaetze_zu("Form der Zuwendung", 5)[0].startswith("Form der Zuwendung")
        assert anfrage.mustersaetze_zu("Bagatellgrenze in Euro", 5)[0].startswith("Bagatellgrenze")

    def test_kompositum_gilt_nicht_als_treffer(self, baustein5):
        """„Finanzierungsform" darf nicht den Satz zur Finanzierungsart bekommen — der Fehler,
        wegen dessen diese Auswahl überhaupt geschrieben wurde."""
        assert anfrage.mustersaetze_zu("Finanzierungsform", 5) == []

    def test_gebeugte_form_zaehlt(self, baustein5):
        """"zuwendungsfähige" und "zuwendungsfähig" sind dasselbe Wort."""
        assert anfrage.mustersaetze_zu("Zuwendungsfähige Ausgaben oder Kosten", 5)

    def test_ohne_treffer_lieber_nichts(self, baustein5):
        """Kein Mustersatz ist besser als der beste von lauter unpassenden."""
        assert anfrage.mustersaetze_zu("Kumulierung mit anderen Fördermitteln", 5) == []


class TestRRF:
    def test_treffer_in_mehreren_listen_steigt(self):
        """Reciprocal Rank Fusion — dasselbe Verfahren wie im Hybrid-Retrieval."""
        class T:
            def __init__(self, i): self.id = i
        a, b, c = T("a"), T("b"), T("c")
        # b steht in beiden Listen, a und c je in einer
        zusammen = anfrage._rrf([[a, b], [b, c]])
        assert zusammen[0].id == "b"
        assert {t.id for t in zusammen} == {"a", "b", "c"}
