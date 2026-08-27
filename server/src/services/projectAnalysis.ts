import GitHubConnection from "../models/GitHubConnection";
import GitHubRepositoryModel from "../models/GitHubRepository";
import ProjectAnalysis from "../models/ProjectAnalysis";
import { decryptToken } from "../utils/encryption";
import { GitHubService } from "../integrations/github/github.service";
import { ClaudeService } from "../integrations/claude/claude.service";
import { getModel, truncateReadme } from "../integrations/claude/claudeClient";
import { PROJECT_ANALYSIS_PROMPT_VERSION } from "../integrations/claude/prompts";
import { validateAnalysisResult } from "../validators/projectAnalysis";
import { AppError } from "../middleware/errorHandler";

const claudeService = new ClaudeService();

interface AnalysisInput {
  userId: string;
  githubRepositoryId: number;
}

async function verifyOwnership(userId: string, githubRepositoryId: number) {
  const connection = await GitHubConnection.findOne({ user: userId }).select("+accessToken");
  if (!connection) {
    throw new AppError("GitHub account not connected", 400);
  }

  const repository = await GitHubRepositoryModel.findOne({
    user: userId,
    githubRepositoryId,
  });
  if (!repository) {
    throw new AppError("Repository not imported", 404);
  }

  const accessToken = decryptToken(connection.accessToken);
  const githubService = new GitHubService(accessToken);

  return { connection, repository, githubService };
}

export async function analyzeGitHubRepository({
  userId,
  githubRepositoryId,
}: AnalysisInput) {
  const { repository, githubService } = await verifyOwnership(
    userId,
    githubRepositoryId
  );

  const [languages, readmeRaw] = await Promise.all([
    githubService.getRepositoryLanguages(repository.fullName),
    githubService
      .getRepositoryReadme(repository.fullName)
      .then((r) => Buffer.from(r.content, r.encoding as BufferEncoding).toString("utf8"))
      .catch(() => null),
  ]);

  const { content: readme, truncated } = truncateReadme(
    readmeRaw || ""
  );

  const analysisResult = await claudeService.analyzeProject({
    repository: {
      name: repository.name,
      fullName: repository.fullName,
      description: repository.description,
      language: repository.language,
      topics: repository.topics,
      defaultBranch: repository.defaultBranch,
      stars: repository.stars,
      forks: repository.forks,
      size: repository.size,
    },
    languages,
    readme: readmeRaw ? readme : null,
  });

  const validation = validateAnalysisResult(analysisResult);
  if (!validation.success) {
    throw new AppError(
      `Analysis validation failed: ${validation.error}`,
      422
    );
  }

  const model = getModel();

  const saved = await ProjectAnalysis.create({
    user: userId,
    githubRepository: repository._id,
    projectSummary: validation.data.projectSummary,
    problemStatement: validation.data.problemStatement,
    keyFeatures: validation.data.keyFeatures,
    technologies: validation.data.technologies,
    programmingLanguages: validation.data.programmingLanguages,
    frameworks: validation.data.frameworks,
    databases: validation.data.databases,
    tools: validation.data.tools,
    cloudServices: validation.data.cloudServices,
    architecture: validation.data.architecture,
    developmentHighlights: validation.data.developmentHighlights,
    skillsDemonstrated: validation.data.skillsDemonstrated,
    difficultyLevel: validation.data.difficultyLevel,
    developerRole: validation.data.developerRole,
    resumeDescription: validation.data.resumeDescription,
    linkedinDescription: validation.data.linkedinDescription,
    suggestedTags: validation.data.suggestedTags,
    aiModel: model,
    promptVersion: PROJECT_ANALYSIS_PROMPT_VERSION,
    analyzedAt: new Date(),
  });

  return { analysis: saved, readmeTruncated: truncated };
}

export async function getLatestAnalysis({
  userId,
  githubRepositoryId,
}: AnalysisInput) {
  const repository = await GitHubRepositoryModel.findOne({
    user: userId,
    githubRepositoryId,
  });
  if (!repository) {
    throw new AppError("Repository not imported", 404);
  }

  const analysis = await ProjectAnalysis.findOne({
    user: userId,
    githubRepository: repository._id,
  }).sort({ analyzedAt: -1 });

  if (!analysis) {
    throw new AppError("No analysis found for this repository", 404);
  }

  return { analysis };
}

export async function getAnalysisHistory({
  userId,
  githubRepositoryId,
}: AnalysisInput) {
  const repository = await GitHubRepositoryModel.findOne({
    user: userId,
    githubRepositoryId,
  });
  if (!repository) {
    throw new AppError("Repository not imported", 404);
  }

  const analyses = await ProjectAnalysis.find({
    user: userId,
    githubRepository: repository._id,
  }).sort({ analyzedAt: -1 });

  return { analyses };
}

export async function reanalyzeRepository({
  userId,
  githubRepositoryId,
}: AnalysisInput) {
  return analyzeGitHubRepository({ userId, githubRepositoryId });
}
