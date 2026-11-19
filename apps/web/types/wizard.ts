/**
 * Shared types for the report wizard flow
 */

export type DamageLevel = "MINIMAL" | "PARTIAL" | "COMPLETE";

export type InfraType =
  | "RESIDENTIAL"
  | "COMMERCIAL"
  | "GOVERNMENT"
  | "UTILITY"
  | "TRANSPORT_COMMUNICATION"
  | "COMMUNITY"
  | "PUBLIC_RECREATION"
  | "OTHER";

export type CrisisType =
  | "EARTHQUAKE"
  | "FLOOD"
  | "TSUNAMI"
  | "HURRICANE_CYCLONE"
  | "WILDFIRE"
  | "EXPLOSION"
  | "CHEMICAL_INCIDENT"
  | "CONFLICT"
  | "CIVIL_UNREST";

export type Step =
  | "camera"
  | "damage"
  | "infraType"
  | "crisisType"
  | "details"
  | "location"
  | "confirm"
  | "success";

/**
 * Canonical order of wizard steps.
 * All step navigation logic derives from this single source of truth.
 */
export const STEP_ORDER: Step[] = [
  "camera",
  "damage",
  "infraType",
  "crisisType",
  "details",
  "location",
  "confirm",
] as const;
