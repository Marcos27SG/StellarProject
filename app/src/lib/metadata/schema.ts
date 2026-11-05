// Off-chain campaign metadata (the document `metadata_uri` points to or inlines).
// Versioned by the `schema` field so future versions can be added without breaking old campaigns.

import { z } from "zod";
import type { AttributeField, CategoryDef, DeliveryMode } from "@/catalog";

export const METADATA_SCHEMA_V1 = "despensa.campaign/v1" as const;

const deliveryModes = ["pickup", "home_delivery", "recurring_pickup", "handover"] as const satisfies readonly DeliveryMode[];

const imageRef = z
  .string()
  .max(300)
  .refine((s) => /^(https:\/\/|ipfs:\/\/)/.test(s), "Las imágenes deben ser https:// o ipfs://");

export const campaignMetadataV1 = z.object({
  schema: z.literal(METADATA_SCHEMA_V1),
  category: z.string().min(1).max(64),
  description: z.string().max(2000).default(""),
  images: z.array(imageRef).max(8).default([]),
  attributes: z.record(z.string(), z.union([z.string().max(300), z.number(), z.boolean()])).default({}),
  producer: z
    .object({
      displayName: z.string().max(80),
      location: z.string().max(80).optional(),
      whatsapp: z.string().max(20).optional(),
    })
    .default({ displayName: "" }),
  delivery: z
    .object({
      mode: z.enum(deliveryModes),
      points: z
        .array(
          z.object({
            name: z.string().max(80),
            address: z.string().max(120).optional(),
            schedule: z.string().max(80).optional(),
          }),
        )
        .max(5)
        .optional(),
    })
    .optional(),
  documents: z
    .array(z.object({ label: z.string().max(60), url: z.string().url().max(300) }))
    .max(5)
    .optional(),
});

export type CampaignMetadataV1 = z.infer<typeof campaignMetadataV1>;
/** Union of every supported version. Today there is one. */
export type CampaignMetadata = CampaignMetadataV1;

/** Parses any supported version. Throws a ZodError on invalid input. */
export function parseMetadata(input: unknown): CampaignMetadata {
  return campaignMetadataV1.parse(input);
}

/** Minimal document used for legacy (plain-text) campaigns and validation failures. */
export function fallbackMetadata(description = ""): CampaignMetadata {
  return {
    schema: METADATA_SCHEMA_V1,
    category: "generic",
    description,
    images: [],
    attributes: {},
    producer: { displayName: "" },
  };
}

// ------------------------------------------------------------ attributes vs category schema

export interface AttributeIssue {
  key: string;
  message: string;
}

function checkAttribute(field: AttributeField, value: unknown): string | null {
  if (value === undefined || value === "") return field.required ? "Campo obligatorio." : null;
  switch (field.type) {
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? null : "Debe ser un número.";
    case "boolean":
      return typeof value === "boolean" ? null : "Debe ser sí o no.";
    case "select":
      return field.options?.some((o) => o.value === value) ? null : "Opción no válida.";
    case "url":
      return typeof value === "string" && /^(https:\/\/|ipfs:\/\/)/.test(value) ? null : "Debe ser un enlace https:// o ipfs://.";
    case "date":
      return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? null : "Fecha no válida.";
    default:
      return typeof value === "string" ? null : "Debe ser texto.";
  }
}

/** Validates `attributes` against a category's AttributeField list (used by the create wizard). */
export function validateAttributes(
  category: CategoryDef,
  attributes: Record<string, string | number | boolean>,
): AttributeIssue[] {
  const issues: AttributeIssue[] = [];
  for (const field of category.attributes) {
    const msg = checkAttribute(field, attributes[field.key]);
    if (msg) issues.push({ key: field.key, message: msg });
  }
  return issues;
}

/** Human-readable value for an attribute ("Entera", "85 m²", "Sí"). Unknown keys render as-is. */
export function formatAttribute(field: AttributeField | undefined, value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (field?.type === "select") return field.options?.find((o) => o.value === value)?.label ?? String(value);
  const text = typeof value === "number" ? value.toLocaleString("es-BO") : value;
  return field?.unit ? `${text} ${field.unit}` : text;
}
