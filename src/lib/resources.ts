import { z } from "zod";
export const resourceLinksSchema = z
  .array(
    z
      .object({
        id: z.uuid(),
        url: z
          .string()
          .max(2048)
          .refine((value) => {
            try {
              const url = new URL(value);
              return (
                /^https:\/\/[A-Za-z0-9]/.test(value) &&
                url.protocol === "https:" &&
                !url.username &&
                !url.password &&
                !/[\s\\]/.test(value) &&
                /^[A-Za-z0-9.-]+$/.test(url.hostname)
              );
            } catch {
              return false;
            }
          }, "Enter a valid HTTPS URL without credentials."),
      })
      .strict(),
  )
  .max(20)
  .refine(
    (links) => new Set(links.map((l) => l.id)).size === links.length,
    "Link identifiers must be unique.",
  );
export type ResourceLink = z.infer<typeof resourceLinksSchema>[number];
