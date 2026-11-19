import { z } from "zod";

export const CHECKLIST = [
  {
    id: "water",
    category: "Essentials",
    label: "Drinking water",
    detail: "Pack water for everyone in your household.",
  },
  {
    id: "food",
    category: "Essentials",
    label: "Ready-to-eat food",
    detail: "Choose food that needs no cooking or refrigeration.",
  },
  {
    id: "medicine",
    category: "Essentials",
    label: "Personal medication",
    detail: "Keep prescribed medication and a first-aid kit together.",
  },
  {
    id: "light",
    category: "Equipment",
    label: "Torch & spare batteries",
    detail: "Keep a working light within easy reach.",
  },
  {
    id: "power",
    category: "Equipment",
    label: "Charged power bank",
    detail: "Pack a charging cable and check your power bank.",
  },
  {
    id: "documents",
    category: "Your household",
    label: "Important documents",
    detail: "Store copies of IDs and essential records in a waterproof pouch.",
  },
  {
    id: "contacts",
    category: "Your household",
    label: "Emergency contacts",
    detail: "Write down household contacts and a meeting place.",
  },
  {
    id: "needs",
    category: "Your household",
    label: "Individual needs",
    detail: "Include supplies for children, older adults, and pets.",
  },
] as const;

export const SafetyPlanSchema = z.object({
  checked: z.array(z.enum(CHECKLIST.map((item) => item.id))).default([]),
  meetingPlace: z.string().max(500).default(""),
  householdNotes: z.string().max(2000).default(""),
  contacts: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(100),
        phone: z
          .string()
          .trim()
          .min(3)
          .max(40)
          .regex(/^[+\d\s().-]+$/, "Enter a valid phone number."),
      }),
    )
    .max(30)
    .default([]),
});
export type SafetyPlan = z.infer<typeof SafetyPlanSchema>;
export const EMPTY_PLAN: SafetyPlan = {
  checked: [],
  meetingPlace: "",
  householdNotes: "",
  contacts: [],
};
export const PLAN_KEY = "crisismap:safety-plan:v1";

export const RESOURCE_CATEGORIES = [
  "Shelter",
  "Medical",
  "Food & water",
  "Supplies",
  "Other",
] as const;
export const ResourceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  category: z.enum(RESOURCE_CATEGORIES),
  address: z.string().trim().min(1).max(300),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[+\d\s().-]*$/, "Enter a valid phone number."),
  notes: z.string().trim().max(1000),
  availability: z.enum(["Unknown", "Available", "Limited", "Unavailable"]),
  updatedAt: z.string().datetime(),
});
export type Resource = z.infer<typeof ResourceSchema>;
export const ResourcesSchema = z.array(ResourceSchema).max(250);
export const RESOURCES_KEY = "crisismap:resources:v1";

export function downloadText(
  filename: string,
  text: string,
  type = "text/plain",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatSafetyPlan(plan: SafetyPlan) {
  return [
    "CRISISMAP — MY HOUSEHOLD SAFETY PLAN",
    "",
    "Meeting place",
    plan.meetingPlace || "Not set",
    "",
    "Emergency contacts",
    ...plan.contacts.map((contact) => `${contact.name}: ${contact.phone}`),
    "",
    "Household notes",
    plan.householdNotes || "None",
    "",
    "Emergency kit",
    ...CHECKLIST.map(
      (item) =>
        `${plan.checked.includes(item.id) ? "[x]" : "[ ]"} ${item.label}`,
    ),
    "",
    "Personal plan saved on this device. Check local authority instructions during an emergency.",
  ].join("\n");
}
