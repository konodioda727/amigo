import { z } from "zod";
import { bootstrapGithubRepo, cancelGithubBootstrap } from "../services/githubBootstrapService";
import { parseJsonBody } from "../shared/request";
import { errorResponse, jsonResponse } from "../shared/response";

const githubBootstrapRequestSchema = z.object({
  repoUrl: z.string().min(1),
  branch: z.string().min(1).optional(),
});

export const bootstrapGithubController = async (req: Request) => {
  try {
    const body = await parseJsonBody(
      req,
      githubBootstrapRequestSchema,
      "INVALID_GITHUB_BOOTSTRAP_REQUEST",
    );
    return jsonResponse({
      success: true,
      ...(await bootstrapGithubRepo(body)),
    });
  } catch (error) {
    return errorResponse(error, {
      status: 502,
      code: "GITHUB_BOOTSTRAP_FAILED",
      logLabel: "[AmigoHttp] github bootstrap 失败",
    });
  }
};

export const cancelGithubBootstrapController = async (req: Request) => {
  try {
    const body = await parseJsonBody(
      req,
      githubBootstrapRequestSchema,
      "INVALID_GITHUB_BOOTSTRAP_CANCEL_REQUEST",
    );
    return jsonResponse(await cancelGithubBootstrap(body));
  } catch (error) {
    return errorResponse(error, {
      status: 409,
      code: "BOOTSTRAP_CANCEL_FAILED",
    });
  }
};
