"""Der Holdout: einzelne Quelldateien für die Suche ausblenden.

Anlass war ein Durchlauf am 17.09.2026. Nachgebaut wurde eine Richtlinie, die selbst im
Korpus liegt — das Werkzeug lieferte den Zuwendungszweck mit 94 Prozent Konfidenz und als
Beleg dieselbe Richtlinie. Es hatte abgeschrieben, nicht hergeleitet.

Dieselbe Mechanik braucht eine ehrliche Messung: ein Holdout heißt „miss so, als gäbe es
dieses Dokument nicht", und das soll ein Parameter sein und kein Indexumbau.
"""
import retrieval


def bedingungen(filt):
    """(must-Schlüssel, must_not-Schlüssel) eines Qdrant-Filters."""
    if filt is None:
        return [], []
    schluessel = lambda liste: sorted(c.key for c in (liste or []))
    return schluessel(filt.must), schluessel(filt.must_not)


class TestFilterbau:
    def test_ohne_alles_kein_filter(self):
        assert retrieval._gueltig_filter(False, None, None) is None

    def test_nur_holdout(self):
        must, must_not = bedingungen(retrieval._gueltig_filter(False, None, ["a.pdf"]))
        assert must == [] and must_not == ["quelle"]

    def test_holdout_neben_status_und_art(self):
        """Alle drei Bedingungen müssen nebeneinander bestehen, nicht einander verdrängen."""
        must, must_not = bedingungen(
            retrieval._gueltig_filter(True, ["richtlinie"], ["a.pdf"]))
        assert must == ["art"]
        assert must_not == ["quelle", "status"]

    def test_leere_liste_wirkt_nicht(self):
        """`[]` ist „nichts ausblenden", nicht „alles ausblenden"."""
        must, must_not = bedingungen(retrieval._gueltig_filter(True, None, []))
        assert must_not == ["status"]

    def test_mehrere_dateien_in_einer_bedingung(self):
        filt = retrieval._gueltig_filter(False, None, ["a.pdf", "b.pdf"])
        assert filt.must_not[0].match.any == ["a.pdf", "b.pdf"]


class TestVorgabeAusDerUmgebung:
    def test_ohne_angabe_gilt_die_umgebung(self, monkeypatch):
        """Die Node-Seite weiß vom Holdout nichts — ohne Vorgabe liefe ein Durchlauf im
        Browser weiter gegen den vollen Korpus."""
        monkeypatch.setattr(retrieval, "HOLDOUT_DATEIEN", ["vorgabe.pdf"])
        gesehen = {}
        monkeypatch.setattr(retrieval, "_gueltig_filter",
                            lambda *a, **k: gesehen.update(dateien=a[2]))
        monkeypatch.setattr(retrieval, "_c", lambda: (_ for _ in ()).throw(RuntimeError("stop")))
        try:
            retrieval.hybrid_search("x")
        except RuntimeError:
            pass
        assert gesehen["dateien"] == ["vorgabe.pdf"]

    def test_leere_liste_hebt_die_vorgabe_auf(self, monkeypatch):
        """Ein Aufrufer, der ausdrücklich nichts ausblenden will, muss das sagen können."""
        monkeypatch.setattr(retrieval, "HOLDOUT_DATEIEN", ["vorgabe.pdf"])
        gesehen = {}
        monkeypatch.setattr(retrieval, "_gueltig_filter",
                            lambda *a, **k: gesehen.update(dateien=a[2]))
        monkeypatch.setattr(retrieval, "_c", lambda: (_ for _ in ()).throw(RuntimeError("stop")))
        try:
            retrieval.hybrid_search("x", ohne_dateien=[])
        except RuntimeError:
            pass
        assert gesehen["dateien"] == []
