import {
  SkillHubMarketCatalogInputSchema,
  type SkillHubMarketClient,
  SkillHubMarketImportInputSchema,
  SkillHubMarketSearchInputSchema,
} from "../../skills/skillHubMarket";
import type { SkillStore } from "../../skills/skillStore";
import { parseJsonBody } from "../shared/request";
import { errorResponse, jsonResponse } from "../shared/response";

const parseCatalogQuery = (url: URL) =>
  SkillHubMarketCatalogInputSchema.parse({
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
    offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    sort: url.searchParams.get("sort") || undefined,
    category: url.searchParams.get("category") || undefined,
  });

export const getSkillMarketStatusController = async (client: SkillHubMarketClient) =>
  jsonResponse({
    configured: client.isConfigured(),
    provider: "skillhub-cli",
  });

export const browseSkillMarketController = async (req: Request, client: SkillHubMarketClient) => {
  try {
    const input = parseCatalogQuery(new URL(req.url));
    return jsonResponse(await client.browseCatalog(input));
  } catch (error) {
    return errorResponse(error, {
      status: 400,
      code: "BROWSE_SKILL_MARKET_FAILED",
      logLabel: "[AmigoHttp] browse skill market 失败",
    });
  }
};

export const searchSkillMarketController = async (req: Request, client: SkillHubMarketClient) => {
  try {
    const body = await parseJsonBody(
      req,
      SkillHubMarketSearchInputSchema,
      "INVALID_SKILL_MARKET_SEARCH",
    );
    return jsonResponse(await client.searchSkills(body));
  } catch (error) {
    return errorResponse(error, {
      status: 400,
      code: "SEARCH_SKILL_MARKET_FAILED",
      logLabel: "[AmigoHttp] search skill market 失败",
    });
  }
};

export const importSkillFromMarketController = async (
  req: Request,
  client: SkillHubMarketClient,
  skillStore: SkillStore,
) => {
  try {
    const body = await parseJsonBody(
      req,
      SkillHubMarketImportInputSchema,
      "INVALID_SKILL_IMPORT_REQUEST",
    );
    return jsonResponse(await client.importSkill(body, skillStore));
  } catch (error) {
    return errorResponse(error, {
      status: 400,
      code: "IMPORT_SKILL_FROM_MARKET_FAILED",
      logLabel: "[AmigoHttp] import skill from market 失败",
    });
  }
};
