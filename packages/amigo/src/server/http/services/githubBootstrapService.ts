import { bootstrapGithubRepository, cancelGithubBootstrapByRepo } from "@amigo-llm/backend";

export const bootstrapGithubRepo = async (input: { repoUrl: string; branch?: string }) => {
  return bootstrapGithubRepository(input);
};

export const cancelGithubBootstrap = async (input: { repoUrl: string; branch?: string }) => {
  await cancelGithubBootstrapByRepo(input);
  return {
    success: true,
    repoUrl: input.repoUrl,
    branch: input.branch,
  };
};
