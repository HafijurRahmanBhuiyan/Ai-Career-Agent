import { Request, Response, NextFunction } from "express";
import { GitHubClient } from "../integrations/github/githubClient";
import { GitHubService } from "../integrations/github/github.service";
import GitHubConnection from "../models/GitHubConnection";
import GitHubRepositoryModel from "../models/GitHubRepository";
import { encryptToken, decryptToken } from "../utils/encryption";
import {
  generateOAuthState,
  validateOAuthState,
} from "../utils/oauthState";
import { AppError } from "../middleware/errorHandler";

export const connect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.id) {
      return next(new AppError("User authentication required", 401));
    }

    const state = generateOAuthState(req.user.id);
    const authorizeUrl = GitHubClient.getOAuthAuthorizeUrl(state);

    res.status(200).json({ authorizeUrl, state });
  } catch (error) {
    next(error);
  }
};

export const callback = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { code, state } = req.query;

    if (
      !code ||
      !state ||
      typeof code !== "string" ||
      typeof state !== "string"
    ) {
      return next(
        new AppError("Missing authorization code or state", 400)
      );
    }

    /*
     * IMPORTANT:
     * GitHub redirects the browser directly to this callback URL.
     * Therefore req.user is NOT available here.
     *
     * The OAuth state was created before redirecting to GitHub and
     * contains the userId. We recover the userId from the validated state.
     */
    const stateValidation = validateOAuthState(state);

    if (!stateValidation.valid || !stateValidation.userId) {
      return next(
        new AppError(
          stateValidation.error || "Invalid OAuth state",
          400
        )
      );
    }

    const userId = stateValidation.userId;

    // Exchange GitHub authorization code for access token
    const tokenResponse =
      await GitHubClient.exchangeCodeForToken(code);

    if (!tokenResponse.access_token) {
      return next(
        new AppError(
          "Failed to obtain GitHub access token",
          400
        )
      );
    }

    // Create GitHub API client
    const githubClient = new GitHubService(
      tokenResponse.access_token
    );

    // Get authenticated GitHub user's profile
    const githubUser =
      await githubClient.getAuthenticatedUser();

    if (!githubUser?.id || !githubUser?.login) {
      return next(
        new AppError(
          "Failed to retrieve GitHub user profile",
          502
        )
      );
    }

    // Encrypt token before saving to database
    const encryptedToken = encryptToken(
      tokenResponse.access_token
    );

    // Save or update GitHub connection
    await GitHubConnection.findOneAndUpdate(
      { user: userId },
      {
        user: userId,
        githubUserId: githubUser.id,
        username: githubUser.login,
        profileUrl: githubUser.html_url,
        avatarUrl: githubUser.avatar_url,
        accessToken: encryptedToken,
        scope: tokenResponse.scope,
        connectedAt: new Date(),
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
      }
    );

    // Redirect user back to frontend
    const clientUrl =
      process.env.CLIENT_URL ||
      "http://localhost:5173";

    res.redirect(
      `${clientUrl}/dashboard/integrations?github=connected`
    );
  } catch (error) {
    next(error);
  }
};

export const disconnect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.id) {
      return next(new AppError("User authentication required", 401));
    }

    const connection =
      await GitHubConnection.findOneAndDelete({
        user: req.user.id,
      });

    if (!connection) {
      return next(
        new AppError(
          "GitHub account not connected",
          404
        )
      );
    }

    await GitHubRepositoryModel.deleteMany({
      user: req.user.id,
    });

    res.status(200).json({
      message: "GitHub account disconnected",
    });
  } catch (error) {
    next(error);
  }
};

export const getStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.id) {
      return next(new AppError("User authentication required", 401));
    }

    const connection =
      await GitHubConnection.findOne({
        user: req.user.id,
      });

    if (!connection) {
      return res.status(200).json({
        connected: false,
      });
    }

    res.status(200).json({
      connected: true,
      github: {
        username: connection.username,
        profileUrl: connection.profileUrl,
        avatarUrl: connection.avatarUrl,
        connectedAt: connection.connectedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

async function getDecryptedConnection(
  userId: string
): Promise<{ accessToken: string }> {
  const connection =
    await GitHubConnection.findOne({
      user: userId,
    }).select("+accessToken");

  if (!connection) {
    throw new AppError(
      "GitHub account not connected. Please connect GitHub first.",
      400
    );
  }

  const accessToken = decryptToken(
    connection.accessToken
  );

  return { accessToken };
}

function parseRepoId(
  raw: string | string[] | undefined
): number {
  const val = Array.isArray(raw) ? raw[0] : raw;

  return parseInt(val || "", 10);
}

export const getRepositories = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.id) {
      return next(new AppError("User authentication required", 401));
    }

    const { accessToken } =
      await getDecryptedConnection(req.user.id);

    const page =
      parseInt(req.query.page as string) || 1;

    const perPage = Math.min(
      parseInt(req.query.per_page as string) || 30,
      100
    );

    const githubService =
      new GitHubService(accessToken);

    const repositories =
      await githubService.getUserRepositories(
        page,
        perPage
      );

    const safeRepos = repositories.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      htmlUrl: repo.html_url,
      homepage: repo.homepage,
      private: repo.private,
      fork: repo.fork,
      defaultBranch: repo.default_branch,
      language: repo.language,
      topics: repo.topics,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      size: repo.size,
      createdAt: repo.created_at,
      updatedAt: repo.updated_at,
      pushedAt: repo.pushed_at,
    }));

    res.status(200).json({
      repositories: safeRepos,
      page,
      perPage,
    });
  } catch (error) {
    next(error);
  }
};

export const importRepository = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.id) {
      return next(new AppError("User authentication required", 401));
    }

    const repoId = parseRepoId(
      req.params.githubRepositoryId
    );

    if (isNaN(repoId)) {
      return next(
        new AppError("Invalid repository ID", 400)
      );
    }

    const { accessToken } =
      await getDecryptedConnection(req.user.id);

    const githubService =
      new GitHubService(accessToken);

    const repositories =
      await githubService.getUserRepositories(
        1,
        100
      );

    const repoData = repositories.find(
      (r) => r.id === repoId
    );

    if (!repoData) {
      return next(
        new AppError(
          "Repository not found or not accessible",
          404
        )
      );
    }

    const existing =
      await GitHubRepositoryModel.findOne({
        user: req.user.id,
        githubRepositoryId: repoId,
      });

    if (existing) {
      return next(
        new AppError(
          "Repository already imported",
          409
        )
      );
    }

    const imported =
      await GitHubRepositoryModel.create({
        user: req.user.id,
        githubRepositoryId: repoData.id,
        name: repoData.name,
        fullName: repoData.full_name,
        description: repoData.description,
        htmlUrl: repoData.html_url,
        homepage: repoData.homepage,
        private: repoData.private,
        fork: repoData.fork,
        defaultBranch: repoData.default_branch,
        language: repoData.language,
        topics: repoData.topics,
        stars: repoData.stargazers_count,
        forks: repoData.forks_count,
        size: repoData.size,
        createdAtGithub: new Date(
          repoData.created_at
        ),
        updatedAtGithub: new Date(
          repoData.updated_at
        ),
        pushedAtGithub: new Date(
          repoData.pushed_at
        ),
      });

    res.status(201).json({
      repository: imported,
    });
  } catch (error) {
    next(error);
  }
};

export const syncRepository = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.id) {
      return next(new AppError("User authentication required", 401));
    }

    const repoId = parseRepoId(
      req.params.githubRepositoryId
    );

    if (isNaN(repoId)) {
      return next(
        new AppError("Invalid repository ID", 400)
      );
    }

    const imported =
      await GitHubRepositoryModel.findOne({
        user: req.user.id,
        githubRepositoryId: repoId,
      });

    if (!imported) {
      return next(
        new AppError(
          "Repository not imported",
          404
        )
      );
    }

    const { accessToken } =
      await getDecryptedConnection(req.user.id);

    const githubService =
      new GitHubService(accessToken);

    const [owner, repo] =
      imported.fullName.split("/");

    const repoData =
      await githubService.getRepository(
        `${owner}/${repo}`
      );

    imported.name = repoData.name;
    imported.description = repoData.description;
    imported.homepage = repoData.homepage;
    imported.private = repoData.private;
    imported.fork = repoData.fork;
    imported.defaultBranch =
      repoData.default_branch;
    imported.language = repoData.language;
    imported.topics = repoData.topics;
    imported.stars =
      repoData.stargazers_count;
    imported.forks = repoData.forks_count;
    imported.size = repoData.size;
    imported.updatedAtGithub =
      new Date(repoData.updated_at);
    imported.pushedAtGithub =
      new Date(repoData.pushed_at);

    await imported.save();

    res.status(200).json({
      repository: imported,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteRepository = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.id) {
      return next(new AppError("User authentication required", 401));
    }

    const repoId = parseRepoId(
      req.params.githubRepositoryId
    );

    if (isNaN(repoId)) {
      return next(
        new AppError("Invalid repository ID", 400)
      );
    }

    const deleted =
      await GitHubRepositoryModel.findOneAndDelete({
        user: req.user.id,
        githubRepositoryId: repoId,
      });

    if (!deleted) {
      return next(
        new AppError(
          "Imported repository not found",
          404
        )
      );
    }

    res.status(200).json({
      message: "Repository import removed",
    });
  } catch (error) {
    next(error);
  }
};

export const getLanguages = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.id) {
      return next(new AppError("User authentication required", 401));
    }

    const repoId = parseRepoId(
      req.params.githubRepositoryId
    );

    if (isNaN(repoId)) {
      return next(
        new AppError("Invalid repository ID", 400)
      );
    }

    const imported =
      await GitHubRepositoryModel.findOne({
        user: req.user.id,
        githubRepositoryId: repoId,
      });

    if (!imported) {
      return next(
        new AppError(
          "Repository not imported",
          404
        )
      );
    }

    const { accessToken } =
      await getDecryptedConnection(req.user.id);

    const githubService =
      new GitHubService(accessToken);

    const languages =
      await githubService.getRepositoryLanguages(
        imported.fullName
      );

    res.status(200).json({
      languages,
    });
  } catch (error) {
    next(error);
  }
};

export const getReadme = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.id) {
      return next(new AppError("User authentication required", 401));
    }

    const repoId = parseRepoId(
      req.params.githubRepositoryId
    );

    if (isNaN(repoId)) {
      return next(
        new AppError("Invalid repository ID", 400)
      );
    }

    const imported =
      await GitHubRepositoryModel.findOne({
        user: req.user.id,
        githubRepositoryId: repoId,
      });

    if (!imported) {
      return next(
        new AppError(
          "Repository not imported",
          404
        )
      );
    }

    const { accessToken } =
      await getDecryptedConnection(req.user.id);

    const githubService =
      new GitHubService(accessToken);

    try {
      const readme =
        await githubService.getRepositoryReadme(
          imported.fullName
        );

      const content = Buffer.from(
        readme.content,
        readme.encoding as BufferEncoding
      ).toString("utf8");

      res.status(200).json({
        name: readme.name,
        content,
        size: content.length,
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        "response" in error &&
        (
          error as {
            response?: {
              status?: number;
            };
          }
        ).response?.status === 404
      ) {
        return res.status(200).json({
          name: null,
          content: null,
          size: 0,
        });
      }

      throw error;
    }
  } catch (error) {
    next(error);
  }
};

export const getImportedRepositories = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.id) {
      return next(new AppError("User authentication required", 401));
    }

    const repositories =
      await GitHubRepositoryModel.find({
        user: req.user.id,
      }).sort({
        updatedAtGithub: -1,
      });

    res.status(200).json({
      repositories,
    });
  } catch (error) {
    next(error);
  }
};

export const setRepositoryApproved = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.id) {
      return next(new AppError("User authentication required", 401));
    }

    const repoId = parseRepoId(
      req.params.githubRepositoryId
    );

    if (isNaN(repoId)) {
      return next(
        new AppError("Invalid repository ID", 400)
      );
    }

    const approved =
      req.body?.approved === true;

    const imported =
      await GitHubRepositoryModel.findOneAndUpdate(
        {
          user: req.user.id,
          githubRepositoryId: repoId,
        },
        {
          approvedForProfessionalUse: approved,
          approvedAt: approved
            ? new Date()
            : null,
        },
        {
          new: true,
          runValidators: true,
        }
      );

    if (!imported) {
      return next(
        new AppError(
          "Repository not imported",
          404
        )
      );
    }

    res.status(200).json({
      repository: {
        _id: imported._id,
        githubRepositoryId:
          imported.githubRepositoryId,
        name: imported.name,
        fullName: imported.fullName,
        approvedForProfessionalUse:
          imported.approvedForProfessionalUse,
        approvedAt: imported.approvedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};