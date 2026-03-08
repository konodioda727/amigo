import { z } from "zod";

const HexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "必须是十六进制颜色值");

const InsetsSchema = z
  .object({
    top: z.number().min(0),
    right: z.number().min(0),
    bottom: z.number().min(0),
    left: z.number().min(0),
  })
  .strict();

const FillSchema = z
  .object({
    type: z.enum(["solid", "image"]),
    color: HexColorSchema.optional(),
    opacity: z.number().min(0).max(1).optional(),
    assetUrl: z.string().url().optional(),
  })
  .strict();

const StrokeSchema = z
  .object({
    color: HexColorSchema,
    width: z.number().min(0),
    opacity: z.number().min(0).max(1).optional(),
  })
  .strict();

const LayoutSchema = z
  .object({
    mode: z.enum(["absolute", "stack", "grid"]).default("absolute"),
    direction: z.enum(["horizontal", "vertical"]).optional(),
    gap: z.number().min(0).optional(),
    padding: InsetsSchema.optional(),
    columns: z.number().int().positive().optional(),
    alignX: z.enum(["start", "center", "end", "stretch"]).optional(),
    alignY: z.enum(["start", "center", "end", "stretch"]).optional(),
  })
  .strict();

const TypographyTokenSchema = z
  .object({
    fontFamily: z.string().min(1),
    fontSize: z.number().positive(),
    fontWeight: z.number().int().positive(),
    lineHeight: z.number().int().positive(),
    letterSpacing: z.number().optional(),
  })
  .strict();

const NodeStyleSchema = z
  .object({
    fill: FillSchema.optional(),
    fills: z.array(FillSchema).optional(),
    stroke: StrokeSchema.optional(),
    radius: z.number().min(0).optional(),
    opacity: z.number().min(0).max(1).optional(),
    textColor: HexColorSchema.optional(),
    fontToken: z.string().min(1).optional(),
    fontSize: z.number().positive().optional(),
    fontWeight: z.number().int().positive().optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    shadow: z
      .object({
        x: z.number(),
        y: z.number(),
        blur: z.number().min(0),
        color: HexColorSchema,
        opacity: z.number().min(0).max(1).optional(),
      })
      .optional(),
  })
  .strict();

type DesignNode = z.infer<typeof BaseNodeSchema> & { children?: DesignNode[] };

const BaseNodeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(["container", "text", "button", "image", "shape"]),
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
    zIndex: z.number().int().optional(),
    text: z.string().optional(),
    assetUrl: z.string().url().optional(),
    imageFit: z.enum(["cover", "contain", "fill"]).optional(),
    shapeKind: z.enum(["rect", "ellipse", "line"]).optional(),
    layout: LayoutSchema.optional(),
    style: NodeStyleSchema.optional(),
    props: z.record(z.string(), z.any()).optional(),
  })
  .strict();

export const DesignNodeSchema: z.ZodType<DesignNode> = BaseNodeSchema.extend({
  children: z.lazy(() => DesignNodeSchema.array()).optional(),
});

export const ExecutableDesignDocSchema = z
  .object({
    page: z
      .object({
        name: z.string().min(1),
        path: z.string().min(1).optional(),
        width: z.number().positive(),
        minHeight: z.number().positive(),
        background: HexColorSchema,
      })
      .strict(),
    designTokens: z
      .object({
        colors: z.record(z.string(), HexColorSchema).default({}),
        spacing: z.record(z.string(), z.number().min(0)).default({}),
        radius: z.record(z.string(), z.number().min(0)).default({}),
        typography: z.record(z.string(), TypographyTokenSchema).default({}),
      })
      .strict(),
    sections: z
      .array(
        z
          .object({
            id: z.string().min(1),
            name: z.string().min(1),
            kind: z.string().min(1),
            y: z.number().min(0),
            height: z.number().positive(),
            background: HexColorSchema.optional(),
            layout: LayoutSchema,
            nodes: z.array(DesignNodeSchema),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export type ExecutableDesignDoc = z.infer<typeof ExecutableDesignDocSchema>;

export const validateExecutableDesignDoc = (document: Record<string, unknown>) => {
  const result = ExecutableDesignDocSchema.safeParse(document);
  if (result.success) {
    return {
      valid: true as const,
      document: result.data,
      errors: [] as string[],
    };
  }

  return {
    valid: false as const,
    document: null,
    errors: result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "document";
      return `${path}: ${issue.message}`;
    }),
  };
};
