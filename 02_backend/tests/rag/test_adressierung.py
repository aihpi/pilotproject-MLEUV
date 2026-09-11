"""Adressierung: jedem Chunk sagen, wo er steht — und wie er zitiert wird.

Ohne Qdrant: geprüft werden das Register samt lokalem Overlay und die Zitierform. Die
Nummernfortschreibung über ein ganzes Dokument braucht echte Payloads und bleibt hier außen
vor.
"""
import adressierung


class TestRegisterUndOverlay:
    """Einträge, deren Dateiname ein vertrauliches Dokument nennt, liegen außerhalb des Repos.

    `register()` mischt beide Dateien zusammen. Fehlt das Overlay — und wer das Repo klont,
    hat es nicht — fehlen nur diese Einträge, ohne Fehler.
    """

    def _schreiben(self, pfad, dateiname, kurzname):
        pfad.write_text(
            f"dokumente:\n"
            f"  - datei: \"{dateiname}\"\n"
            f"    kurzname: \"{kurzname}\"\n"
            f"    aliase: []\n"
            f"    art: richtlinie\n"
            f"    zitierweise: nummer\n",
            encoding="utf-8")

    def test_beide_dateien_duerfen_fehlen(self, tmp_path, monkeypatch):
        """Ohne Overlay-Vorrichtung schlug dieser Test an — und zu Recht.

        Er nahm an, dass ein fehlendes Hauptregister ein leeres Ergebnis liefert. Seit das
        Overlay dazugemischt wird, stimmt das nicht mehr: die lokalen Einträge kommen auch
        dann. Der Docstring der Funktion behauptete das Gegenteil und ist korrigiert.
        """
        monkeypatch.setattr(adressierung, "REGISTER_LOKAL", str(tmp_path / "auch_nicht.yaml"))
        assert adressierung.register(tmp_path / "gibtesnicht.yaml") == {}

    def test_overlay_traegt_auch_ohne_hauptregister(self, tmp_path, monkeypatch):
        lokal = tmp_path / "register_lokal.yaml"
        self._schreiben(lokal, "Vertrauliche Vorlage.pdf", "Vorlage")
        monkeypatch.setattr(adressierung, "REGISTER_LOKAL", str(lokal))
        assert list(adressierung.register(tmp_path / "fehlt.yaml")) == ["Vertrauliche Vorlage.pdf"]

    def test_overlay_wird_dazugemischt(self, tmp_path, monkeypatch):
        haupt = tmp_path / "register.yaml"
        lokal = tmp_path / "register_lokal.yaml"
        self._schreiben(haupt, "Oeffentliche RL.pdf", "Öffentliche RL")
        self._schreiben(lokal, "Vertrauliche Vorlage.pdf", "Vorlage")
        monkeypatch.setattr(adressierung, "REGISTER_LOKAL", str(lokal))

        reg = adressierung.register(haupt)
        assert set(reg) == {"Oeffentliche RL.pdf", "Vertrauliche Vorlage.pdf"}

    def test_ohne_overlay_bleibt_das_haupt_register(self, tmp_path, monkeypatch):
        haupt = tmp_path / "register.yaml"
        self._schreiben(haupt, "Oeffentliche RL.pdf", "Öffentliche RL")
        monkeypatch.setattr(adressierung, "REGISTER_LOKAL", str(tmp_path / "fehlt.yaml"))

        reg = adressierung.register(haupt)
        assert list(reg) == ["Oeffentliche RL.pdf"]


class TestAbkuerzungen:
    """Die Zielliste für die Verweisauflösung: Kurznamen und alle Aliase."""

    def test_aliase_zeigen_auf_den_kurznamen(self):
        reg = {"x.pdf": {"kurzname": "ANBest-P",
                         "aliase": ["Allgemeine Nebenbestimmungen für Zuwendungen"]}}
        namen = adressierung.abkuerzungen(reg)
        assert namen["ANBest-P"] == "ANBest-P"
        assert namen["Allgemeine Nebenbestimmungen für Zuwendungen"] == "ANBest-P"


class TestFundstelle:
    """Zitierform, wie sie im Vorschlag und im Prüfvermerk erscheint."""

    def test_mit_nummer_und_seite(self):
        pl = {"dokument": "ANBest-G", "nummer": "8.1", "seiten": [5]}
        assert adressierung.fundstelle(pl) == "ANBest-G, Nummer 8.1 (S. 5)"

    def test_ohne_nummer(self):
        pl = {"dokument": "ANBest-G", "nummer": None, "seiten": [5]}
        text = adressierung.fundstelle(pl)
        assert "ANBest-G" in text and "Nummer" not in text
