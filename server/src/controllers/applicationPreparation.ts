import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { Application } from "../models/Application";
import { InterviewPreparation, CHECKLIST_KEYS } from "../models/InterviewPreparation";
import { AppError } from "../middleware/errorHandler";
import { generatePrepAssist } from "../services/prepAssist";
import {
  CreatePreparationInput,
  UpdatePreparationInput,
  ChecklistItemInput,
} from "../validators/interviewPreparation";

const DEFAULT_CHECKLIST_LABELS: Record<string, string> = {
  resume_reviewed: "Resume reviewed",
  job_description_reviewed: "Job description reviewed",
  company_researched: "Company researched",
  star_stories_prepared: "STAR stories prepared",
  technical_topics_prepared: "Technical topics prepared",
  behavioral_topics_prepared: "Behavioral topics prepared",
  interviewer_questions_prepared: "Interviewer questions prepared",
};

const ensureApplicationOwned = async (
  userId: string,
  appId: string
): Promise<Types.ObjectId> => {
  if (!Types.ObjectId.isValid(appId)) {
    throw new AppError("Application not found", 404);
  }
  const app = await Application.exists({ _id: appId, user: userId });
  if (!app) {
    throw new AppError("Application not found", 404);
  }
  return new Types.ObjectId(appId);
};

export const getPreparation = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const appId = await ensureApplicationOwned(userId, String(req.params.id));

    const prep = await InterviewPreparation.findOne({
      user: userId,
      application: appId,
    }).lean();

    res.status(200).json({
      preparation: prep
        ? toSafePreparation(prep)
        : defaultPreparation(String(appId)),
    });
  } catch (error) {
    next(error);
  }
};

export const assistPreparation = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const appId = String(req.params.id);

    if (!Types.ObjectId.isValid(appId)) {
      throw new AppError("Application not found", 404);
    }
    const exists = await Application.exists({ _id: appId, user: userId });
    if (!exists) {
      throw new AppError("Application not found", 404);
    }

    // Suggestions are generated for the user's review only; nothing is persisted.
    const suggestions = await generatePrepAssist(userId, appId);

    res.status(200).json({ suggestions });
  } catch (error) {
    next(error);
  }
};

export const upsertPreparation = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const appId = await ensureApplicationOwned(userId, String(req.params.id));
    const body = req.body as UpdatePreparationInput;

    const update: Record<string, unknown> = {};
    if (body.notes !== undefined) update.notes = body.notes;
    if (body.goals !== undefined) update.goals = body.goals;
    if (body.talkingPoints !== undefined) update.talkingPoints = body.talkingPoints;
    if (body.questionsToAsk !== undefined) update.questionsToAsk = body.questionsToAsk;
    if (body.companyResearchNotes !== undefined)
      update.companyResearchNotes = body.companyResearchNotes;
    if (body.rolePreparationNotes !== undefined)
      update.rolePreparationNotes = body.rolePreparationNotes;

    if (body.checklist !== undefined) {
      update.checklist = body.checklist.map(normalizeChecklistItem);
    }

    const prep = await InterviewPreparation.findOneAndUpdate(
      { user: userId, application: appId },
      { $set: update },
      { new: true, runValidators: true, upsert: true }
    );

    res.status(200).json({ preparation: toSafePreparation(prep) });
  } catch (error) {
    next(error);
  }
};

function normalizeChecklistItem(item: ChecklistItemInput) {
  return {
    key: item.key,
    label: item.label,
    completed: item.completed,
    completedAt: item.completed ? new Date() : null,
  };
}

function defaultPreparation(applicationId: string): Record<string, unknown> {
  return {
    application: applicationId,
    notes: null,
    goals: [],
    talkingPoints: [],
    questionsToAsk: [],
    companyResearchNotes: null,
    rolePreparationNotes: null,
    checklist: CHECKLIST_KEYS.map((key) => ({
      key,
      label: DEFAULT_CHECKLIST_LABELS[key] ?? key,
      completed: false,
      completedAt: null,
    })),
  };
}

function toSafePreparation<T extends object>(
  prep: T
): Record<string, unknown> {
  const source =
    prep &&
    typeof (prep as { toObject?: unknown }).toObject === "function"
      ? (prep as unknown as { toObject: () => Record<string, unknown> }).toObject()
      : prep;
  const { __v, user, _id, ...safe } = source as Record<string, unknown>;
  void __v;
  void user;
  void _id;
  return safe;
}
