import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Document, Packer, Paragraph, HeadingLevel } from "docx";
import {
  draftSchema,
  emptySections,
  chatStages,
  nextChatStage,
  sections,
  validateDraft,
  type ChatReply,
  type FieldProposal,
  type RichtlinieDraft,
} from "@richtlinie/shared";

const app = Fastify({ logger: true, bodyLimit: 200_000 });
await app.register(cors, { origin: true });
const dataPath = resolve(process.cwd(), "data/drafts.json");
const ownerId = "prototype-user";
let drafts: RichtlinieDraft[] = [];
try {
  drafts = draftSchema
    .array()
    .parse(JSON.parse(await readFile(dataPath, "utf8")));
  drafts = drafts.map((draft) => ({
    ...draft,
    validation: validateDraft(draft),
  }));
} catch {
  drafts = [];
}
async function persist() {
  await mkdir(dirname(dataPath), { recursive: true });
  await writeFile(dataPath, JSON.stringify(drafts, null, 2));
}
function get(id: string) {
  const d = drafts.find((x) => x.id === id && x.ownerId === ownerId);
  if (!d)
    throw Object.assign(new Error("Entwurf nicht gefunden"), {
      statusCode: 404,
    });
  return d;
}
function touch(d: RichtlinieDraft) {
  d.updatedAt = new Date().toISOString();
  d.version++;
  d.validation = validateDraft(d);
  void persist();
}

app.get("/api/health", async () => ({ ok: true, mode: "prototype" }));
app.get("/api/session", async () => ({
  user: {
    id: ownerId,
    name: "Dr. Alex Beispiel",
    roles: ["Fachbereich", "Haushalt", "Recht"],
  },
  auth: "prototype-oidc",
}));
app.get("/api/drafts", async () => drafts.filter((d) => d.ownerId === ownerId));
app.post("/api/drafts", async (req, reply) => {
  const body = req.body as Partial<RichtlinieDraft> & {
    profile?: RichtlinieDraft["profile"];
  };
  const now = new Date().toISOString();
  const draft: RichtlinieDraft = {
    id: randomUUID(),
    ownerId,
    title: "Neue Förderrichtlinie",
    profile: body.profile ?? {
      jurisdiction: "land",
      gak: false,
      stateAid: true,
      fundingType: "project",
    },
    sections: emptySections(),
    validation: { valid: false, issues: [] },
    status: "draft",
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  draft.validation = validateDraft(draft);
  drafts.unshift(draft);
  await persist();
  return reply.code(201).send(draft);
});
app.get("/api/drafts/:id", async (req) =>
  get((req.params as { id: string }).id),
);
app.patch("/api/drafts/:id", async (req) => {
  const d = get((req.params as { id: string }).id);
  const body = req.body as Partial<RichtlinieDraft> & {
    expectedVersion?: number;
  };
  if (body.expectedVersion && body.expectedVersion !== d.version)
    throw Object.assign(
      new Error(
        "Der Entwurf wurde zwischenzeitlich geändert. Bitte laden Sie neu.",
      ),
      { statusCode: 409 },
    );
  if (body.title !== undefined) d.title = body.title;
  if (body.profile) d.profile = body.profile;
  if (body.sections) d.sections = { ...d.sections, ...body.sections };
  if (body.status) d.status = body.status;
  touch(d);
  return d;
});
app.post("/api/drafts/:id/validate", async (req) => {
  const d = get((req.params as { id: string }).id);
  d.validation = validateDraft(d);
  return d.validation;
});

app.post("/api/drafts/:id/chat/messages", async (req): Promise<ChatReply> => {
  const d = get((req.params as { id: string }).id);
  const { message } = req.body as { message: string };
  if (!message?.trim())
    throw Object.assign(new Error("Bitte geben Sie eine Nachricht ein."), {
      statusCode: 400,
    });
  const stage = nextChatStage(d) ?? chatStages[0]!;
  const def = sections.find((s) => s.id === stage.sectionId)!;
  const targets = stage.fieldIds
    .map((id) => def.fields.find((f) => f.id === id)!)
    .filter(Boolean);
  const proposals: FieldProposal[] = targets.map((f, index) => ({
    sectionId: stage.sectionId,
    fieldId: f.id,
    label: f.label,
    value: index === 0 ? message.trim() : message.trim(),
    confidence: 0.82,
    evidence: message.trim(),
  }));
  const nextIndex = Math.min(
    chatStages.indexOf(stage) + 1,
    chatStages.length - 1,
  );
  const next = chatStages[nextIndex];
  return {
    message: `Ich habe Ihre Angabe dem Abschnitt „${def.title}“ zugeordnet. Bitte prüfen Sie den Vorschlag, bevor er übernommen wird.`,
    extraction: {
      id: randomUUID(),
      messageId: randomUUID(),
      proposals,
      followUpQuestions: next ? [next.question] : [],
      conflicts: [],
    },
    progress: Math.round(
      ((chatStages.indexOf(stage) + 1) / chatStages.length) * 100,
    ),
  };
});
app.post("/api/drafts/:id/extractions/:extractionId/confirm", async (req) => {
  const d = get((req.params as { id: string }).id);
  const { proposals } = req.body as { proposals: FieldProposal[] };
  for (const p of proposals) {
    d.sections[p.sectionId] ??= { fields: {} };
    d.sections[p.sectionId]!.fields[p.fieldId] = {
      value: p.value,
      status: "confirmed",
      source: "ai-extracted",
      confidence: p.confidence,
      evidence: p.evidence,
      confirmedByUser: true,
    };
    if (p.fieldId === "title") {
      d.title = p.value;
    }
  }
  touch(d);
  return {
    draft: d,
    nextQuestion:
      nextChatStage(d)?.question ??
      "Die geführte Erhebung ist abgeschlossen. Prüfen Sie nun den strukturierten Entwurf.",
  };
});
app.post("/api/drafts/:id/extractions/:extractionId/reject", async () => ({
  ok: true,
}));
app.get("/api/drafts/:id/preview", async (req) => {
  const d = get((req.params as { id: string }).id);
  return {
    title: d.title,
    sections: sections.map((s) => ({
      id: s.id,
      title: s.title,
      paragraphs: s.fields
        .map((f) => ({
          label: f.label,
          value: d.sections[s.id]?.fields[f.id]?.value,
        }))
        .filter((x) => x.value != null && x.value !== ""),
    })),
  };
});
app.post("/api/drafts/:id/export", async (req, reply) => {
  const d = get((req.params as { id: string }).id);
  const children = [
    new Paragraph({ text: d.title, heading: HeadingLevel.TITLE }),
    ...sections.flatMap((s) => {
      const vals = s.fields
        .map((f) => ({ f, v: d.sections[s.id]?.fields[f.id]?.value }))
        .filter((x) => x.v != null && x.v !== "");
      return vals.length
        ? [
            new Paragraph({
              text: `${s.id}. ${s.title}`,
              heading: HeadingLevel.HEADING_1,
            }),
            ...vals.map(
              ({ f, v }) =>
                new Paragraph({
                  text: `${f.label}: ${Array.isArray(v) ? v.join(", ") : String(v)}`,
                }),
            ),
          ]
        : [];
    }),
  ];
  const buffer = await Packer.toBuffer(
    new Document({ sections: [{ children }] }),
  );
  return reply
    .header(
      "content-type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    .header(
      "content-disposition",
      `attachment; filename="richtlinie-${d.id}.docx"`,
    )
    .send(buffer);
});

app.setErrorHandler((error, _req, reply) => {
  const safe = error as { statusCode?: number; message?: string };
  return reply
    .code(safe.statusCode ?? 500)
    .send({ message: safe.message ?? "Interner Serverfehler" });
});
await app.listen({ port: Number(process.env.PORT ?? 4317), host: "0.0.0.0" });
