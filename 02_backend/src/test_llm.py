"""Schritt 3: prüfen, dass der Cluster antwortet, Chat und Embedding."""
from llm import chat, embed


def main():
    print("Chat-Test ...")
    antwort = chat([{"role": "user", "content": "Antworte mit genau einem Wort: OK"}])
    print("  Antwort:", antwort)

    print("Embedding-Test ...")
    vektor = embed("Ein Testsatz für ein Embedding.")[0]
    print("  Dimension:", len(vektor))
    print("Fertig. Trage EMBEDDING_MODEL passend ein; die Dimension muss nicht manuell gesetzt werden.")


if __name__ == "__main__":
    main()
