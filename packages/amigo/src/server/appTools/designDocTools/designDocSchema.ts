import { z } from "zod";

const MIN_PAGE_WIDTH = 240;
const MAX_PAGE_WIDTH = 2560;
const MIN_PAGE_HEIGHT = 200;
const MAX_PAGE_HEIGHT = 20000;
const MAX_SECTION_DIMENSION = 12000;
const MAX_NODE_DIMENSION = 12000;
const MAX_ABSOLUTE_POSITION = 20000;

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
    letterSpacing: z.number().optional(),
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

type RecursiveDesignNode = z.infer<typeof BaseNodeSchema> & { children?: RecursiveDesignNode[] };

const BaseNodeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(["container", "text", "button", "image", "shape"]),
    x: z
      .number()
      .min(-MAX_ABSOLUTE_POSITION, `x 不能小于 -${MAX_ABSOLUTE_POSITION}`)
      .max(MAX_ABSOLUTE_POSITION, `x 不能大于 ${MAX_ABSOLUTE_POSITION}`),
    y: z
      .number()
      .min(-MAX_ABSOLUTE_POSITION, `y 不能小于 -${MAX_ABSOLUTE_POSITION}`)
      .max(MAX_ABSOLUTE_POSITION, `y 不能大于 ${MAX_ABSOLUTE_POSITION}`),
    width: z
      .number()
      .positive("width 必须大于 0")
      .max(MAX_NODE_DIMENSION, `width 不能大于 ${MAX_NODE_DIMENSION}`),
    height: z
      .number()
      .positive("height 必须大于 0")
      .max(MAX_NODE_DIMENSION, `height 不能大于 ${MAX_NODE_DIMENSION}`),
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

export const DesignNodeSchema: z.ZodType<RecursiveDesignNode> = BaseNodeSchema.extend({
  children: z.lazy(() => DesignNodeSchema.array()).optional(),
});

export const DesignDocPageSchema = z
  .object({
    name: z.string().min(1),
    path: z.string().min(1).optional(),
    theme: z.string().min(1).optional(),
    width: z
      .number()
      .min(MIN_PAGE_WIDTH, `page.width 不能小于 ${MIN_PAGE_WIDTH}`)
      .max(MAX_PAGE_WIDTH, `page.width 不能大于 ${MAX_PAGE_WIDTH}`),
    minHeight: z
      .number()
      .min(MIN_PAGE_HEIGHT, `page.minHeight 不能小于 ${MIN_PAGE_HEIGHT}`)
      .max(MAX_PAGE_HEIGHT, `page.minHeight 不能大于 ${MAX_PAGE_HEIGHT}`),
    background: HexColorSchema,
  })
  .strict();

export const DesignDocTokensSchema = z
  .object({
    colors: z.record(z.string(), HexColorSchema).default({}),
    spacing: z.record(z.string(), z.number().min(0)).default({}),
    radius: z.record(z.string(), z.number().min(0)).default({}),
    typography: z.record(z.string(), TypographyTokenSchema).default({}),
  })
  .strict();

export const DesignDocSectionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    kind: z.string().min(1),
    x: z
      .number()
      .min(0)
      .max(MAX_ABSOLUTE_POSITION, `section.x 不能大于 ${MAX_ABSOLUTE_POSITION}`)
      .optional(),
    y: z.number().min(0).max(MAX_ABSOLUTE_POSITION, `section.y 不能大于 ${MAX_ABSOLUTE_POSITION}`),
    width: z
      .number()
      .positive("section.width 必须大于 0")
      .max(MAX_SECTION_DIMENSION, `section.width 不能大于 ${MAX_SECTION_DIMENSION}`)
      .optional(),
    height: z.number().positive(),
    background: HexColorSchema.optional(),
    layout: LayoutSchema,
    nodes: z.array(DesignNodeSchema),
  })
  .strict()
  .superRefine((section, ctx) => {
    if (section.height > MAX_SECTION_DIMENSION) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["height"],
        message: `section.height 不能大于 ${MAX_SECTION_DIMENSION}`,
      });
    }
  });

export const ExecutableDesignDocSchema = z
  .object({
    page: DesignDocPageSchema,
    designTokens: DesignDocTokensSchema,
    sections: z.array(DesignDocSectionSchema).min(1),
  })
  .strict();

export type DesignNode = z.infer<typeof DesignNodeSchema>;
export type ExecutableDesignDoc = z.infer<typeof ExecutableDesignDocSchema>;
export type DesignDocPage = z.infer<typeof DesignDocPageSchema>;
export type DesignDocTokens = z.infer<typeof DesignDocTokensSchema>;
export type DesignDocSection = z.infer<typeof DesignDocSectionSchema>;

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
