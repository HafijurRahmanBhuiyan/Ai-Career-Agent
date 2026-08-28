import { Types } from "mongoose";
import Job from "../models/Job";
import Profile from "../models/Profile";
import { Application } from "../models/Application";
import LinkedInDraft from "../models/LinkedInDraft";
import { CareerEmail } from "../models/CareerEmail";
import { prepareMatchProfile } from "./jobMatchProfile";
import { prepareMatchJob } from "./jobMatchJob";
import { computeDeterministicMatch } from "./deterministicMatch";
import { classifyApplyCapability } from "./applyCapability";

const HIGH_MATCH_SCORE = 75;
const MAX_HIGH_MATCH = 20;
const MAX_DRAFTS = 20;
const MAX_HANDOFFS = 20;
const MAX_EMAILS = 20;

export interface NotificationCenterResult {
  since: Date | null;
  promos: {
    highMatchOpportunities: Array<Record<string, unknown>>;
    linkedinDrafts: Array<Record<string, unknown>>;
    unconfirmedHandoffs: Array<Record<string, unknown>>;
    careerEmails: Array<Record<string, unknown>>;
  };
  counts: {
    highMatchOpportunities: number;
    linkedinDrafts: number;
    unconfirmedHandoffs: number;
    careerEmails: number;
    total: number;
  };
}

export async function getNotificationCenter(userId: string): Promise<NotificationCenterResult> {
  const numericUserId = new Types.ObjectId(userId);

  const profile = await Profile.findOne({ user: numericUserId });
  const since: Date | null =
    profile?.notificationsSeenAt || profile?.createdAt || null;

  const sinceFilter: Record<string, unknown> = {};
  if (since) {
    sinceFilter.$gte = since;
  }

  const [highMatchOpportunities, linkedinDrafts, unconfirmedHandoffs, careerEmails] =
    await Promise.all([
      getHighMatchOpportunities(numericUserId, sinceFilter),
      getLinkedInDrafts(numericUserId, sinceFilter),
      getUnconfirmedHandoffs(numericUserId, sinceFilter),
      getCareerEmails(numericUserId, sinceFilter),
    ]);

  const counts = {
    highMatchOpportunities: highMatchOpportunities.promos,
    linkedinDrafts: linkedinDrafts.promos,
    unconfirmedHandoffs: unconfirmedHandoffs.promos,
    careerEmails: careerEmails.promos,
  };

  return {
    since,
    promos: {
      highMatchOpportunities: highMatchOpportunities.list,
      linkedinDrafts: linkedinDrafts.list,
      unconfirmedHandoffs: unconfirmedHandoffs.list,
      careerEmails: careerEmails.list,
    },
    counts: {
      ...counts,
      total:
        highMatchOpportunities.promos +
        linkedinDrafts.promos +
        unconfirmedHandoffs.promos +
        careerEmails.promos,
    },
  };
}

async function getHighMatchOpportunities(
  userId: Types.ObjectId,
  sinceFilter: Record<string, unknown>
): Promise<{ list: Array<Record<string, unknown>>; promos: number }> {
  const filter: Record<string, unknown> = { isActive: true };
  if (Object.keys(sinceFilter).length > 0) {
    filter.discoveredAt = sinceFilter;
  }

  const jobs = await Job.find(filter)
    .sort({ discoveredAt: -1 })
    .limit(MAX_HIGH_MATCH * 4)
    .lean();

  const { payload: profilePayload } = await prepareMatchProfile(String(userId));
  if (!profilePayload) {
    return { list: [], promos: 0 };
  }

  const highMatch: Array<Record<string, unknown>> = [];
  for (const job of jobs) {
    const match = computeDeterministicMatch(profilePayload, prepareMatchJob(job));
    if (match.score >= HIGH_MATCH_SCORE) {
      highMatch.push({
        job: toSafe(job),
        match: {
          score: match.score,
          matchLevel: match.matchLevel,
          recommendation: match.recommendation,
          recommendationReason: match.recommendationReason,
        },
      });
      if (highMatch.length >= MAX_HIGH_MATCH) break;
    }
  }

  return { list: highMatch, promos: highMatch.length };
}

async function getLinkedInDrafts(
  userId: Types.ObjectId,
  sinceFilter: Record<string, unknown>
): Promise<{ list: Array<Record<string, unknown>>; promos: number }> {
  const filter: Record<string, unknown> = {
    user: userId,
    status: { $in: ["reviewed", "approved"] },
  };
  if (Object.keys(sinceFilter).length > 0) {
    filter.updatedAt = sinceFilter;
  }

  const drafts = await LinkedInDraft.find(filter)
    .sort({ updatedAt: -1 })
    .limit(MAX_DRAFTS)
    .lean();

  return {
    list: drafts.map((d) => ({
      id: d._id,
      status: d.status,
      hook: d.hook,
      updatedAt: d.updatedAt,
    })),
    promos: drafts.length,
  };
}

async function getUnconfirmedHandoffs(
  userId: Types.ObjectId,
  sinceFilter: Record<string, unknown>
): Promise<{ list: Array<Record<string, unknown>>; promos: number }> {
  const filter: Record<string, unknown> = { user: userId, status: "saved" };
  if (Object.keys(sinceFilter).length > 0) {
    filter.updatedAt = sinceFilter;
  }

  const applications = await Application.find(filter)
    .select("job status updatedAt")
    .sort({ updatedAt: -1 })
    .limit(MAX_HANDOFFS)
    .lean();

  const jobIds = applications.map((a) => a.job);
  const jobs = await Job.find({ _id: { $in: jobIds } })
    .select("title companyName location applyUrl applyCapability")
    .lean();
  const jobMap = new Map(jobs.map((j) => [String(j._id), j]));

  const handoffs: Array<Record<string, unknown>> = [];
  for (const app of applications) {
    const job = jobMap.get(String(app.job));
    if (!job) continue;
    const capability = classifyApplyCapability(job);
    if (capability.handoffUrl) {
      handoffs.push({
        applicationId: app._id,
        updatedAt: app.updatedAt,
        job: {
          title: job.title,
          companyName: job.companyName,
          location: job.location,
          handoffUrl: capability.handoffUrl,
        },
      });
    }
  }

  return { list: handoffs.slice(0, MAX_HANDOFFS), promos: handoffs.length };
}

async function getCareerEmails(
  userId: Types.ObjectId,
  sinceFilter: Record<string, unknown>
): Promise<{ list: Array<Record<string, unknown>>; promos: number }> {
  const filter: Record<string, unknown> = {
    user: userId,
    category: {
      $in: ["interview_invitation", "interview_reschedule", "offer", "recruiter_outreach"],
    },
  };
  if (Object.keys(sinceFilter).length > 0) {
    filter.receivedAt = sinceFilter;
  }

  const emails = await CareerEmail.find(filter)
    .sort({ receivedAt: -1 })
    .limit(MAX_EMAILS)
    .lean();

  return {
    list: emails.map((e) => ({
      id: e._id,
      category: e.category,
      subject: e.subject,
      snippet: e.snippet,
      companyName: e.companyName,
      jobTitle: e.jobTitle,
      receivedAt: e.receivedAt,
      interviewDate: e.interviewDate,
      actionRequired: e.actionRequired,
    })),
    promos: emails.length,
  };
}

function toSafe(obj: Record<string, unknown>): Record<string, unknown> {
  const { rawSource, __v, ...rest } = obj;
  void rawSource;
  void __v;
  return rest;
}
