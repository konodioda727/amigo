import type { ToolParamDefinition } from "@amigo-llm/types/src/tool";
import { ensureArray } from "@/utils/array";
import { logger } from "@/utils/logger";

type GenericToolParamDefinition = ToolParamDefinition<any>;

const inferParamType = (param: GenericToolParamDefinition): "string" | "array" | "object" => {
  if (param?.type === "string" || param?.type === "array" || param?.type === "object") {
    return param.type;
  }
  if (Array.isArray(param?.params) && param.params.length > 0) {
    return "object";
  }
  return "string";
};

const buildObjectSchemaFromParams = (
  params: GenericToolParamDefinition[],
  options?: {
    includeDescriptions?: boolean;
  },
): Record<string, unknown> => {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const param of params) {
    const type = inferParamType(param);
    properties[param.name] = buildSchemaForParamDefinition(
      {
        ...param,
        type,
      },
      options,
    );

    if (!param.optional) {
      required.push(param.name);
    }
  }

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
};

const buildArrayItemsSchema = (
  param: GenericToolParamDefinition,
  options?: {
    includeDescriptions?: boolean;
  },
): Record<string, unknown> => {
  const children = Array.isArray(param?.params) ? param.params : [];
  if (children.length === 0) {
    return { type: "string" };
  }

  if (children.length === 1) {
    const child = children[0]!;
    const childType = inferParamType(child);

    if (childType === "string") {
      return {
        type: "string",
        ...(options?.includeDescriptions !== false && child.description
          ? { description: child.description }
          : {}),
      };
    }

    if (childType === "array") {
      return {
        type: "array",
        items: buildArrayItemsSchema(child, options),
        ...(options?.includeDescriptions !== false && child.description
          ? { description: child.description }
          : {}),
      };
    }

    if (Array.isArray(child.params) && child.params.length > 0) {
      return buildObjectSchemaFromParams(child.params, options);
    }
  }

  return buildObjectSchemaFromParams(children, options);
};

const buildSchemaForParamDefinition = (
  param: GenericToolParamDefinition,
  options?: {
    includeDescriptions?: boolean;
  },
): Record<string, unknown> => {
  const type = inferParamType(param);

  if (type === "array") {
    return {
      type: "array",
      items: buildArrayItemsSchema(param, options),
      ...(options?.includeDescriptions !== false && param.description
        ? { description: param.description }
        : {}),
    };
  }

  if (type === "object") {
    const nested = Array.isArray(param.params) ? param.params : [];
    const objectSchema = buildObjectSchemaFromParams(nested, options);
    return {
      ...objectSchema,
      ...(options?.includeDescriptions !== false && param.description
        ? { description: param.description }
        : {}),
    };
  }

  return {
    type: "string",
    ...(options?.includeDescriptions !== false && param.description
      ? { description: param.description }
      : {}),
  };
};

const mapAndValidateParams = (
  rawData: unknown,
  paramDefinitions: GenericToolParamDefinition[],
  partial = false,
  toolName = "",
): Record<string, unknown> => {
  if (!rawData || typeof rawData !== "object") {
    logger.warn("[parseTool] data is not object");
  }

  const finalParams: Record<string, unknown> = {};
  const missingParams: string[] = [];
  const source = rawData && typeof rawData === "object" ? (rawData as Record<string, unknown>) : {};

  for (const paramDef of paramDefinitions) {
    const rawValue = source[paramDef.name];

    if (!paramDef.optional && (rawValue === undefined || rawValue === null)) {
      if (partial) {
        continue;
      }
      missingParams.push(paramDef.name);
      continue;
    }

    if (rawValue === undefined) {
      continue;
    }

    if (paramDef.type === "array") {
      finalParams[paramDef.name] = normalizeArrayParam(rawValue, paramDef, partial, toolName);
    } else if (Array.isArray(paramDef.params) && paramDef.params.length > 0) {
      finalParams[paramDef.name] = mapAndValidateParams(rawValue, paramDef.params, partial);
    } else {
      finalParams[paramDef.name] = rawValue;
    }
  }

  if (missingParams.length > 0 && !partial) {
    throw new Error(
      `工具 '${toolName}' 缺少必需参数: ${missingParams.join(", ")}。请按照工具定义的格式提供所有必需参数。`,
    );
  }

  return finalParams;
};

const normalizeArrayParam = (
  rawValue: unknown,
  paramDef: GenericToolParamDefinition,
  partial: boolean,
  toolName: string,
): unknown[] => {
  const childDefs = Array.isArray(paramDef?.params) ? paramDef.params : [];
  if (childDefs.length !== 1) {
    if (!partial) {
      throw new Error(
        `工具 '${toolName}' 的数组参数 '${paramDef?.name}' 定义无效：必须有且仅有一个子参数定义。`,
      );
    }
    return [];
  }

  const childDef = childDefs[0]!;
  const unwrapLegacyChild = (item: unknown): unknown => {
    if (
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      typeof childDef?.name === "string" &&
      Object.hasOwn(item, childDef.name) &&
      Object.keys(item as Record<string, unknown>).length === 1
    ) {
      return (item as Record<string, unknown>)[childDef.name];
    }
    return item;
  };

  const sourceArray = Array.isArray(rawValue)
    ? rawValue
    : ensureArray(
        rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
          ? (rawValue as Record<string, unknown>)[childDef.name]
          : rawValue,
      );

  if (Array.isArray(childDef.params) && childDef.params.length > 0) {
    return sourceArray.map((item) =>
      mapAndValidateParams(unwrapLegacyChild(item), childDef.params!, partial, toolName),
    );
  }

  return sourceArray.map((item) => unwrapLegacyChild(item));
};

export const buildToolParametersSchema = (
  params: GenericToolParamDefinition[] | undefined,
  options?: {
    includeDescriptions?: boolean;
  },
): Record<string, unknown> => {
  const safeParams = Array.isArray(params) ? params : [];
  if (safeParams.length === 0) {
    return {
      type: "object",
      properties: {},
    };
  }
  return buildObjectSchemaFromParams(safeParams, options);
};

export const normalizeToolCallParams = ({
  toolName,
  params,
  paramDefinitions,
}: {
  toolName: string;
  params: unknown;
  paramDefinitions: GenericToolParamDefinition[];
}): Record<string, unknown> | string => {
  if (paramDefinitions.length === 0) {
    return {};
  }

  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new Error(`工具 '${toolName}' 参数必须是对象`);
  }

  return mapAndValidateParams(params, paramDefinitions, false, toolName);
};
