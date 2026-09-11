"""Bildung der Suchanfragen aus dem, was im Werkzeug ankommt.

Im Werkzeug kommt keine Frage an, sondern eine Situation: die Nutzerin ist in einem Abschnitt
und hat einen Entwurfssatz getippt. Dieses Modul macht daraus mehrere Teilanfragen. Es ist
reine Textverarbeitung — kein Netz nötig.
"""
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
