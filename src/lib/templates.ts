/**
 * Board template definitions shared between dashboard (create from template) and board page (AI prompt).
 */
export const TEMPLATE_IDS = ["kanban", "swot", "retrospective", "user_journey", "pros_cons"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const TEMPLATE_PROMPTS: Record<string, string> = {
  kanban: "Create a kanban board with To Do, In Progress, and Done columns.",
  swot: "Create a SWOT analysis with four quadrants: Strengths, Weaknesses, Opportunities, Threats.",
  retrospective: "Set up a retrospective board with What went well, What to improve, and Action items.",
  user_journey: "Build a user journey map showing the user experience flow.",
  pros_cons: "Create a pros and cons grid to weigh options side by side.",
};

export interface TemplateMeta {
  id: TemplateId;
  label: string;
  desc: string;
}

export const TEMPLATE_LIST: TemplateMeta[] = [
  { id: "kanban", label: "Kanban", desc: "To Do, In Progress, Done" },
  { id: "swot", label: "SWOT", desc: "Strengths, Weaknesses, …" },
  { id: "retrospective", label: "Retrospective", desc: "What went well, what to improve" },
  { id: "user_journey", label: "User Journey", desc: "Map the user experience flow" },
  { id: "pros_cons", label: "Pros & Cons", desc: "Weigh options side by side" },
];

export function getTemplatePrompt(id: string): string {
  return TEMPLATE_PROMPTS[id] ?? `Create a ${id.replace(/_/g, " ")} board.`;
}
