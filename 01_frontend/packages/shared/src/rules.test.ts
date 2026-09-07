import { describe, expect, it } from "vitest";
import {
  emptySections,
  nextChatStage,
  sections,
  validateDraft,
  type RichtlinieDraft,
} from "./index";
const base: RichtlinieDraft = {
  id: "1",
  ownerId: "u",
  title: "",
  profile: {
    jurisdiction: "land",
    gak: false,
    stateAid: false,
    fundingType: "project",
  },
  sections: emptySections(),
  validation: { valid: false, issues: [] },
  status: "draft",
  version: 1,
  createdAt: "",
  updatedAt: "",
};
describe("rules", () => {
  it("finds required fields", () =>
    expect(validateDraft(base).issues.length).toBeGreaterThan(10));
  it("activates GAK warning", () =>
    expect(
      validateDraft({
        ...base,
        profile: { ...base.profile, gak: true, jurisdiction: "bund" },
      }).issues.some((i) => i.severity === "warning"),
    ).toBe(true));
  it("contains the revised ELER choices", () => {
    const legalBasis = sections[1]!.fields.find(
      (field) => field.id === "legalBasis",
    )!;
    expect(legalBasis.options?.map((option) => option.label)).toEqual([
      "Zuwendung nach § 44 LHO",
      "Billigkeitsleistung nach § 53 LHO",
      "Verwaltungsvorschriften",
    ]);
    const procedure = sections.find((section) => section.id === "7")!;
    expect(procedure.fields.some((field) => field.id === "data")).toBe(false);
    expect(
      procedure.fields.find((field) => field.id === "applicationType")?.options,
    ).toHaveLength(3);
    expect(
      procedure.fields.find((field) => field.id === "payment")?.options,
    ).toHaveLength(2);
  });
  it("keeps the visible chat question aligned with its target fields", () => {
    expect(nextChatStage(base)?.fieldIds).toEqual(["title"]);
    const titleConfirmed: RichtlinieDraft = {
      ...base,
      sections: {
        ...base.sections,
        "0": {
          fields: {
            title: {
              value: "Tierschutzförderrichtlinie",
              status: "confirmed",
              source: "user-chat",
              confirmedByUser: true,
            },
          },
        },
      },
    };
    const next = nextChatStage(titleConfirmed);
    expect(next?.fieldIds).toEqual(["goal", "purpose"]);
    expect(next?.question).toContain("Ziel der Förderung");
    expect(next?.question).toContain("Zuwendungszweck");
  });
});
