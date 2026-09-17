"""Prüf-Modus: einen fertigen Entwurf gegen die Musterstruktur halten.

Geprüft werden die beiden Stufen, die ohne Modell auskommen — das Zerlegen und die
Vollständigkeit. Die dritte Stufe zieht Feldwerte aus dem Text und ist damit Sache der Eval.
"""
import pruefmodus


ENTWURF = """Richtlinie des Ministeriums über irgendwas

1 Zuwendungszweck, Rechtsgrundlage
Das Land Brandenburg gewährt nach Maßgabe dieser Richtlinie Zuwendungen.

2 Gegenstand der Förderung
Gefördert werden Kastrationen von Katzen.

3 Zuwendungsempfänger
Antragsberechtigt sind gemeinnützige Vereine.

4 Zuwendungsvoraussetzungen
Es dürfen keine Bedenken bestehen.

5 Art und Umfang, Höhe der Zuwendung
Finanzierungsart: Festbetragsfinanzierung. Die Bagatellgrenze beträgt 1000 Euro.

6 Sonstige Zuwendungsbestimmungen
Der Landesrechnungshof ist prüfberechtigt.

7 Verfahren
Anträge sind schriftlich einzureichen.

8 Geltungsdauer
Die Richtlinie tritt am 1. Januar 2026 in Kraft.
"""


class TestZerlegen:
    def test_alle_acht_bausteine(self):
        g = pruefmodus.abschnitte_finden(ENTWURF)
        assert sorted(g) == [1, 2, 3, 4, 5, 6, 7, 8]

    def test_titel_wird_mitgefuehrt(self):
        """Die Richtlinien im Korpus benennen ihre Abschnitte verschieden, nummerieren aber
        alle gleich — deshalb wird über die Nummer getrennt und der Titel nur mitgeführt."""
        g = pruefmodus.abschnitte_finden(ENTWURF)
        assert g[3]["titel"] == "Zuwendungsempfänger"      # nicht „Zuwendungsempfangende"

    def test_text_gehoert_zum_richtigen_baustein(self):
        g = pruefmodus.abschnitte_finden(ENTWURF)
        assert "Kastrationen" in g[2]["text"]
        assert "Kastrationen" not in g[3]["text"]

    def test_letzter_baustein_reicht_bis_zum_ende(self):
        g = pruefmodus.abschnitte_finden(ENTWURF)
        assert "1. Januar 2026" in g[8]["text"]

    def test_vorspann_gehoert_zu_keinem_baustein(self):
        g = pruefmodus.abschnitte_finden(ENTWURF)
        assert all("Ministeriums über irgendwas" not in d["text"] for d in g.values())

    def test_nummerierung_muss_aufsteigen(self):
        """Eine zweite „1" weiter hinten ist eine Aufzählung, keine Überschrift."""
        mit_liste = ENTWURF + "\n1 Erster Punkt einer Aufzählung\nText dazu.\n"
        g = pruefmodus.abschnitte_finden(mit_liste)
        assert sorted(g) == [1, 2, 3, 4, 5, 6, 7, 8]

    def test_punkt_nach_der_ziffer_ist_wahlweise(self):
        g = pruefmodus.abschnitte_finden("1. Zuwendungszweck\nText.\n2. Gegenstand\nText.\n")
        assert sorted(g) == [1, 2]


class TestVollstaendigkeit:
    def test_fehlender_baustein_ist_ein_fehler(self):
        ohne7 = ENTWURF.replace("7 Verfahren\nAnträge sind schriftlich einzureichen.\n", "")
        befunde = pruefmodus.vollstaendigkeit(pruefmodus.abschnitte_finden(ohne7))
        fehlt = [b for b in befunde if b["art"] == "baustein_fehlt"]
        # 7 fehlt, und weil danach nicht mehr aufsteigend nummeriert wird, auch 8.
        assert 7 in [b["baustein"] for b in fehlt]
        assert all(b["schwere"] == "fehler" for b in fehlt)

    def test_vollstaendiger_entwurf_hat_keine_fehler(self):
        befunde = pruefmodus.vollstaendigkeit(pruefmodus.abschnitte_finden(ENTWURF))
        assert [b for b in befunde if b["schwere"] == "fehler"] == []

    def test_gliederungspunkte_sind_hinweise_keine_fehler(self):
        """Ein Wortvergleich kann eine Regelung übersehen, die andere Wörter benutzt."""
        befunde = pruefmodus.vollstaendigkeit(pruefmodus.abschnitte_finden(ENTWURF))
        offen = [b for b in befunde if b["art"] == "gliederungspunkt_offen"]
        assert all(b["schwere"] == "hinweis" for b in offen)

    def test_leerer_entwurf_meldet_alle_acht(self):
        befunde = pruefmodus.vollstaendigkeit({})
        fehlt = [b for b in befunde if b["art"] == "baustein_fehlt"]
        assert len(fehlt) == len(pruefmodus.BAUSTEINE)


class TestAndereGliederung:
    """Die Musterstruktur gilt für Zuwendungsrichtlinien nach § 44 LHO.

    An der Teichwirtschaften-Richtlinie aufgefallen: eine Billigkeitsrichtlinie nach § 53
    nummeriert anders — „1 Leistungszweck", „2 Begriffsbestimmungen", „3 Gegenstand der
    Billigkeitsleistung". Das Werkzeug meldete „8 Bausteine gefunden, 0 Fehler" und verglich
    dann Abschnitt für Abschnitt das Falsche.
    """
    BILLIGKEIT = """1 Leistungszweck, Rechtsgrundlage
Das Land gewährt Billigkeitsleistungen.

2 Begriffsbestimmungen
Teichwirtschaft im Sinne dieser Richtlinie ist …

3 Gegenstand der Billigkeitsleistung
Ausgeglichen werden Schäden durch Fischotter.

4 Empfangende der Billigkeitsleistung
Antragsberechtigt sind Teichwirte.

5 Voraussetzungen für die Billigkeitsleistung
Der Schaden ist nachzuweisen.

6 Art, Umfang und Höhe der Billigkeitsleistung
Die Leistung beträgt höchstens 10000 Euro.

7 Verfahren
Anträge sind schriftlich einzureichen.

8 Sonstige Bestimmungen
Der Landesrechnungshof ist prüfberechtigt.
"""

    def test_fremde_gliederung_wird_erkannt(self):
        befunde = pruefmodus.vollstaendigkeit(
            pruefmodus.abschnitte_finden(self.BILLIGKEIT))
        assert befunde[0]["art"] == "andere_gliederung"
        assert befunde[0]["schwere"] == "fehler"
        assert "§ 53" in befunde[0]["text"]

    def test_dann_keine_einzelhinweise(self):
        """Einzelne Gliederungspunkte zu melden wäre irreführend: sie stehen woanders,
        nicht nirgends."""
        befunde = pruefmodus.vollstaendigkeit(
            pruefmodus.abschnitte_finden(self.BILLIGKEIT))
        assert [b for b in befunde if b["art"] == "gliederungspunkt_offen"] == []

    def test_passende_gliederung_laeuft_normal_durch(self):
        befunde = pruefmodus.vollstaendigkeit(pruefmodus.abschnitte_finden(ENTWURF))
        assert [b for b in befunde if b["art"] == "andere_gliederung"] == []

    def test_aehnlichkeit_ueber_tragende_woerter(self):
        assert pruefmodus._aehnlich("Zuwendungsvoraussetzungen", "Zuwendungsvoraussetzung")
        assert pruefmodus._aehnlich("Verfahren und Zuständigkeit", "Verfahren")
        assert not pruefmodus._aehnlich("Begriffsbestimmungen", "Gegenstand der Förderung")

    def test_bekannte_grenze_empfaenger_gegen_empfangende(self):
        """Eine Grenze des Wortanfang-Vergleichs, bewusst festgehalten.

        „Zuwendungsempfänger" und „Zuwendungsempfangende" meinen dasselbe, aber keiner ist
        Anfang des anderen — sie laufen ab „…empf" auseinander. Beide Schreibweisen kommen
        im Korpus vor.

        Nicht behoben: die Schranke müsste auf einen gemeinsamen Präfix von zwölf Zeichen
        gesenkt werden, und das wäre eine Abstimmung auf zwei Beispiele. Für den Zweck reicht
        es — die Prüfung entscheidet nur, ob ein Entwurf der Musterstruktur ÜBERHAUPT folgt,
        und dafür genügt die Hälfte der Überschriften. Beide Richtlinien des Korpus bestehen
        sie.
        """
        assert not pruefmodus._aehnlich("Zuwendungsempfänger", "Zuwendungsempfangende")
