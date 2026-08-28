import { Request, Response, NextFunction } from "express";
import Profile from "../models/Profile";
import { getJobSource, getSourceIds } from "../integrations/jobs/jobSourceRegistry";

function adzunaConfigured(): boolean {
  return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
}

export const getSettings = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const profile = await Profile.findOne({ user: req.user!.id });

    const sources = getSourceIds().map((id) => {
      const source = getJobSource(id);
      let configured = true;
      if (id === "adzuna") {
        configured = adzunaConfigured();
      }
      return {
        id,
        name: source?.name ?? id,
        configured,
      };
    });

    res.status(200).json({
      sources,
      jobSearchPreferences: profile?.jobSearchPreferences ?? {
        roles: profile?.preferredRoles ?? [],
        locations: profile?.preferredLocations ?? [],
        remote: profile?.workPreference || "any",
      },
      notifications: {
        gmailNotifyEnabled: profile?.gmailNotifyEnabled ?? true,
        notificationEmail: profile?.notificationEmail ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
};
