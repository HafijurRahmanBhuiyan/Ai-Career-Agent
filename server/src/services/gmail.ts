import {
  GmailClient,
  GmailMessageFull,
  getGmailScopes,
} from "../integrations/gmail/gmailClient";
import GmailConnection from "../models/GmailConnection";
import Profile from "../models/Profile";
import { CareerEmail, ICareerEmail } from "../models/CareerEmail";
import { Application } from "../models/Application";
import { AppError } from "../middleware/errorHandler";
import { encryptToken, decryptToken } from "../utils/encryption";
import { generateOAuthState } from "../utils/oauthState";
import { ClaudeService } from "../integrations/claude/claude.service";
import { EmailClassification } from "../integrations/claude/emailClassification.types";
import { ApplicationEventType } from "../models/ApplicationEvent";
import { createGmailEvent } from "./applicationTimeline";
import { resolveCareerStatus } from "./careerStatusDetection";
import {
  HIGH_CONFIDENCE,
  isAllowedStatusTransition,
} from "./careerStatusTransitions";
import { Types } from "mongoose";

const MAX_BODY_CHARS = 6000;

// Phase 2 Step 5: incremental Gmail sync window. Each sync scans only messages
// received within this window, so repeated runs stay cheap. Defaults to 1440
// minutes (24h) and is bounded to [60, 10080] (1h..1w).
const DEFAULT_LOOKBACK_MINUTES = 1440;
const MIN_LOOKBACK_MINUTES = 60;
const MAX_LOOKBACK_MINUTES = 10080;

function defaultMaxMessages(): number {
  const raw = Number(process.env.GMAIL_SYNC_MAX_RESULTS);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return 25;
}

const CAREER_KEYWORDS = [
  "interview",
  "application",
  "applicant",
  "recruiter",
  "recruitment",
  "hiring",
  "job ",
  "opportunity",
  "offer",
  "assessment",
  "coding challenge",
  "technical interview",
  "phone screen",
  "onsite",
  "next steps",
  "rejection",
  "unfortunately",
  "congratulations",
  "candidacy",
  "candidate",
  "role with",
  "we would like to move forward",
];

const SELF_NOTIFY_CATEGORIES = new Set([
  "interview_invitation",
  "interview_reschedule",
  "offer",
  "recruiter_outreach",
]);

export class GmailService {
  private claude: ClaudeService;

  constructor(claudeService?: ClaudeService) {
    this.claude = claudeService || new ClaudeService();
  }

  getAuthorizeUrl(userId: string): { authorizeUrl: string; state: string } {
    const state = generateOAuthState(userId);
    const authorizeUrl = GmailClient.getOAuthAuthorizeUrl(state);
    return { authorizeUrl, state };
  }

  async completeConnection(userId: string, code: string): Promise<void> {
    const tokenResponse = await GmailClient.exchangeCodeForToken(code);

    if (!tokenResponse.access_token) {
      throw new AppError("Failed to obtain Gmail access token", 400);
    }

    if (!tokenResponse.refresh_token) {
      throw new AppError(
        "Gmail OAuth did not return a refresh token. Ensure the connection is set up with an offline access token.",
        400
      );
    }

    const client = new GmailClient(tokenResponse.access_token);
    const profile = await client.getProfile();

    const now = Date.now();
    const expiresInMs = (tokenResponse.expires_in || 3600) * 1000;

    const encryptedAccess = encryptToken(tokenResponse.access_token);
    const encryptedRefresh = encryptToken(tokenResponse.refresh_token);

    await GmailConnection.findOneAndUpdate(
      { user: userId },
      {
        user: userId,
        googleAccountEmail: profile.emailAddress,
        encryptedAccessToken: encryptedAccess,
        encryptedRefreshToken: encryptedRefresh,
        tokenExpiry: new Date(now + expiresInMs),
        scopes: tokenResponse.scope || getGmailScopes(),
        isActive: true,
        connectedAt: new Date(),
      },
      { upsert: true, new: true, runValidators: true }
    );
  }

  async disconnect(userId: string): Promise<void> {
    const connection = await GmailConnection.findOneAndDelete({ user: userId });
    if (!connection) {
      throw new AppError("Gmail account not connected", 404);
    }
  }

  async getStatus(userId: string): Promise<Record<string, unknown>> {
    const connection = await GmailConnection.findOne({ user: userId });

    if (!connection) {
      return {
        connected: false,
      };
    }

    return {
      connected: true,
      gmail: {
        email: connection.googleAccountEmail,
        isActive: connection.isActive,
        connectedAt: connection.connectedAt,
        lastSyncedAt: connection.lastSyncedAt,
      },
    };
  }

  async syncEmails(userId: string, maxMessages?: number): Promise<SyncResult> {
    const connection = await GmailConnection.findOne({ user: userId }).select(
      "+encryptedAccessToken +encryptedRefreshToken"
    );

    if (!connection) {
      throw new AppError(
        "Gmail account not connected. Connect Gmail before syncing.",
        400
      );
    }

    const accessToken = await this.ensureValidAccessToken(connection);

    const client = new GmailClient(accessToken);

    const accountEmail = (
      connection as unknown as { googleAccountEmail?: string }
    ).googleAccountEmail;

    const cap = Math.min(
      Math.max(1, Math.min(maxMessages || defaultMaxMessages(), 100)),
      100
    );
    const lookbackMinutes = this.resolveLookbackMinutes();
    const query = this.buildGmailLookbackQuery(lookbackMinutes);
    const messageList = await client.listMessages(cap, query);

    const profile = await Profile.findOne({ user: userId });
    const autoStatusEnabled = profile?.gmailAutoStatusEnabled === true;

    const result: SyncResult = {
      synced: 0,
      careerEmails: 0,
      classified: 0,
      skipped: 0,
      failed: 0,
      autoUpdated: 0,
    };

    for (const message of messageList) {
      result.synced += 1;

      const alreadyProcessed = await CareerEmail.exists({
        user: userId,
        gmailMessageId: message.id,
      });

      if (alreadyProcessed) {
        result.skipped += 1;
        continue;
      }

      let meta;
      try {
        meta = await client.getMessageMeta(message.id);
      } catch {
        result.failed += 1;
        continue;
      }

      // Never reclassify our own self-notification emails (loop prevention).
      if (this.isFromSelfOrAgent(meta.from, meta.subject, accountEmail)) {
        result.skipped += 1;
        continue;
      }

      if (!this.isCareerCandidate(meta.subject, meta.from)) {
        result.skipped += 1;
        continue;
      }

      result.careerEmails += 1;

      let full: GmailMessageFull;
      try {
        full = await client.getMessageFull(message.id);
      } catch {
        result.failed += 1;
        continue;
      }

      const body = this.extractBodyText(full);

      let classification: EmailClassification;
      try {
        classification = await this.claude.classifyCareerEmail({
          subject: meta.subject,
          from: meta.from,
          to: meta.to,
          date: meta.date,
          snippet: meta.snippet,
          body,
        });
      } catch {
        result.failed += 1;
        continue;
      }

      let careerStatus;
      try {
        careerStatus = await resolveCareerStatus({
          subject: meta.subject,
          from: meta.from,
          snippet: meta.snippet,
          body,
          companyName: classification.companyName,
          jobTitle: classification.jobTitle,
        });
      } catch {
        careerStatus = null;
      }

      const matchedApplicationId = await this.matchApplication(
        userId,
        classification,
        meta.from
      );

      const careerEmail = new CareerEmail({
        user: userId,
        gmailMessageId: message.id,
        threadId: meta.threadId,
        from: meta.from,
        to: meta.to,
        subject: meta.subject,
        receivedAt: this.parseEmailDate(meta.date),
        snippet: meta.snippet,
        category: classification.category,
        confidence: classification.confidence,
        summary: classification.summary,
        companyName: classification.companyName || undefined,
        jobTitle: classification.jobTitle || undefined,
        suggestedApplicationStatus:
          classification.applicationStatus || null,
        interviewDate: this.parseIso(classification.interviewDate),
        interviewType: classification.interviewType || undefined,
        interview: this.buildInterviewInfo(classification),
        actionRequired: classification.actionRequired,
        actionDeadline: this.parseIso(classification.actionDeadline),
        extractedApplicationHints: classification.extractedApplicationHints || {},
        application: matchedApplicationId || null,
        classificationStatus: "classified",
        classifiedAt: new Date(),
        rawMetadata: {},
        careerStatus: careerStatus?.status || null,
        careerStatusConfidence: careerStatus?.confidence || null,
        careerStatusDetectedAt: careerStatus ? new Date() : null,
        autoStatusApplied: false,
        autoStatusReason: null,
      });

      try {
        await careerEmail.save();
        result.classified += 1;

        let statusChange: { from: string; to: string } | null = null;

        // Automatic tracking (opt-in, Profile.gmailAutoStatusEnabled): only a
        // HIGH-confidence detected stage may advance the linked application,
        // and only along an explicitly allowed transition. Never sets
        // "applied" and never touches "withdrawn".
        if (
          autoStatusEnabled &&
          matchedApplicationId &&
          careerStatus?.status &&
          careerStatus.confidence >= HIGH_CONFIDENCE
        ) {
          const application = await Application.findOne({
            _id: matchedApplicationId,
            user: userId,
          });
          if (
            application &&
            isAllowedStatusTransition(
              application.status,
              careerStatus.status
            )
          ) {
            const from = application.status;
            application.status = careerStatus.status;
            await application.save();
            statusChange = { from, to: careerStatus.status };

            careerEmail.autoStatusApplied = true;
            careerEmail.autoStatusReason =
              careerStatus.reason ||
              `${careerStatus.category} signal detected in Gmail`;
            await careerEmail.save();
            result.autoUpdated += 1;
          }
        }

        if (matchedApplicationId) {
          await this.createEventForEmail(
            userId,
            careerEmail,
            matchedApplicationId,
            classification,
            statusChange
          );
        }

        await this.maybeSendSelfNotification(
          userId,
          careerEmail,
          connection,
          profile,
          statusChange
        );
      } catch {
        result.failed += 1;
      }
    }

    await GmailConnection.updateOne(
      { user: userId },
      { $set: { lastSyncedAt: new Date(), isActive: true } }
    );

    return result;
  }

  async listEmails(
    userId: string,
    options: {
      page: number;
      limit: number;
      category?: string;
      applicationStatus?: string;
      sort?: string;
    }
  ): Promise<{
    emails: Record<string, unknown>[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const filter: Record<string, unknown> = { user: userId };

    if (options.category) {
      filter.category = options.category;
    }
    if (options.applicationStatus) {
      filter.suggestedApplicationStatus = options.applicationStatus;
    }

    const sortOrder = options.sort === "oldest" ? 1 : -1;

    const [emails, total] = await Promise.all([
      CareerEmail.find(filter)
        .populate("application", "status")
        .sort({ receivedAt: sortOrder })
        .skip((options.page - 1) * options.limit)
        .limit(options.limit)
        .lean(),
      CareerEmail.countDocuments(filter),
    ]);

    return {
      emails: emails as unknown as Record<string, unknown>[],
      total,
      page: options.page,
      totalPages: Math.ceil(total / options.limit),
    };
  }

  async getEmail(userId: string, id: string): Promise<unknown> {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppError("Email intelligence not found", 404);
    }

    const email = await CareerEmail.findOne({ _id: id, user: userId }).populate(
      "application",
      "status"
    );

    if (!email) {
      throw new AppError("Email intelligence not found", 404);
    }

    return email.toObject();
  }

  private async maybeSendSelfNotification(
    userId: string,
    email: ICareerEmail,
    connection: import("mongoose").HydratedDocument<unknown>,
    profile: import("../models/Profile").IProfile | null,
    statusChange?: { from: string; to: string } | null
  ): Promise<void> {
    try {
      if (
        !email.category ||
        (!SELF_NOTIFY_CATEGORIES.has(email.category) && !statusChange)
      ) {
        return;
      }

      if (profile && profile.gmailNotifyEnabled === false) {
        return;
      }

      const conn = connection as unknown as {
        googleAccountEmail?: string;
      };
      const recipient =
        profile?.notificationEmail?.trim() || conn.googleAccountEmail;
      if (!recipient) {
        return;
      }

      const accessToken = await this.ensureValidAccessToken(connection);
      const client = new GmailClient(accessToken);

      const subject = this.buildSelfNotificationSubject(email, statusChange);
      const body = this.buildSelfNotificationBody(email, statusChange);

      await client.sendMessage(recipient, subject, body);
    } catch {
      // Self-notification is best-effort and must never fail the sync.
    }
  }

  private buildSelfNotificationSubject(
    email: ICareerEmail,
    statusChange?: { from: string; to: string } | null
  ): string {
    const company = email.companyName ? ` at ${email.companyName}` : "";
    if (statusChange) {
      return `[Career Agent] Status updated to ${statusChange.to}${company}`;
    }
    const milestone = (email.category || "").replace(/_/g, " ");
    return `[Career Agent] ${milestone}${company}`;
  }

  private buildSelfNotificationBody(
    email: ICareerEmail,
    statusChange?: { from: string; to: string } | null
  ): string {
    const lines: string[] = [];

    if (statusChange) {
      lines.push(
        `Application status updated automatically: ${statusChange.from} -> ${statusChange.to} (high-confidence email detection).`
      );
    } else {
      const category = (email.category || "").replace(/_/g, " ");
      lines.push(`Career milestone detected: ${category}`);
    }

    if (email.companyName) lines.push(`Company: ${email.companyName}`);
    if (email.jobTitle) lines.push(`Role: ${email.jobTitle}`);
    if (email.careerStatusConfidence != null) {
      lines.push(
        `Detection confidence: ${Math.round(email.careerStatusConfidence * 100)}%`
      );
    }
    if (email.interview?.scheduledAt) {
      lines.push(
        `Interview: ${this.parseIso(String(email.interview.scheduledAt))?.toUTCString() ?? email.interview.scheduledAt.toUTCString()}`
      );
    }
    if (email.actionRequired) {
      lines.push(`Action required: yes${email.actionDeadline ? ` (by ${email.actionDeadline.toUTCString()})` : ""}`);
    }
    if (email.summary) lines.push("");
    if (email.summary) lines.push(email.summary.slice(0, 400));
    lines.push("");
    lines.push("This notification was sent by your Career Agent's automatic email sync.");

    return lines.join("\n");
  }

  private async ensureValidAccessToken(
    connection: import("mongoose").HydratedDocument<unknown>
  ): Promise<string> {
    const conn = connection as unknown as {
      encryptedAccessToken: string;
      encryptedRefreshToken: string;
      tokenExpiry: Date;
      isActive: boolean;
    };

    if (conn.isActive !== false && conn.tokenExpiry && conn.tokenExpiry.getTime() > Date.now()) {
      return decryptToken(conn.encryptedAccessToken);
    }

    const refreshToken = decryptToken(conn.encryptedRefreshToken);

    let refreshed;
    try {
      refreshed = await GmailClient.refreshAccessToken(refreshToken);
    } catch {
      await GmailConnection.updateOne(
        { _id: (connection as unknown as { _id: Types.ObjectId })._id },
        { $set: { isActive: false } }
      );
      throw new AppError(
        "Gmail access token could not be refreshed. Please reconnect your account.",
        401
      );
    }

    if (!refreshed.access_token) {
      await GmailConnection.updateOne(
        { _id: (connection as unknown as { _id: Types.ObjectId })._id },
        { $set: { isActive: false } }
      );
      throw new AppError(
        "Gmail access token could not be refreshed. Please reconnect your account.",
        401
      );
    }

    const encryptedAccess = encryptToken(refreshed.access_token);
    const expiresInMs = (refreshed.expires_in || 3600) * 1000;

    await GmailConnection.updateOne(
      { _id: (connection as unknown as { _id: Types.ObjectId })._id },
      {
        $set: {
          encryptedAccessToken: encryptedAccess,
          tokenExpiry: new Date(Date.now() + expiresInMs),
          isActive: true,
        },
      }
    );

    return refreshed.access_token;
  }

  private isCareerCandidate(subject?: string, from?: string): boolean {
    const haystack = `${subject || ""} ${from || ""}`.toLowerCase();

    return CAREER_KEYWORDS.some((keyword) => haystack.includes(keyword));
  }

  private resolveLookbackMinutes(): number {
    const raw = Number(process.env.GMAIL_SYNC_LOOKBACK_MINUTES);
    const value =
      Number.isFinite(raw) && raw > 0
        ? Math.floor(raw)
        : DEFAULT_LOOKBACK_MINUTES;
    return Math.min(
      MAX_LOOKBACK_MINUTES,
      Math.max(MIN_LOOKBACK_MINUTES, value)
    );
  }

  private buildGmailLookbackQuery(minutes: number): string {
    const since = new Date(Date.now() - minutes * 60 * 1000);
    const y = since.getUTCFullYear();
    const m = String(since.getUTCMonth() + 1).padStart(2, "0");
    const d = String(since.getUTCDate()).padStart(2, "0");
    return `after:${y}/${m}/${d}`;
  }

  // Loop prevention: never re-process emails we sent ourselves (either to the
  // connected account, or the "[Career Agent]" self-notifications).
  private isFromSelfOrAgent(
    from?: string,
    subject?: string,
    accountEmail?: string
  ): boolean {
    const subjectLower = (subject || "").toLowerCase();
    if (
      subjectLower.startsWith("[career agent]") ||
      subjectLower.includes("re: [career agent]")
    ) {
      return true;
    }

    const acc = (accountEmail || "").toLowerCase();
    if (!acc || !from) return false;
    return from.toLowerCase().includes(acc);
  }

  private buildInterviewInfo(
    classification: EmailClassification
  ): Record<string, unknown> | null {
    const interview = classification.interview;

    if (!interview) {
      const legacyDate = this.parseIso(classification.interviewDate);
      const legacyType = classification.interviewType || null;
      if (!legacyDate && !legacyType) return null;

      return {
        type: legacyType,
        scheduledAt: legacyDate || null,
        interviewer: null,
        meetingUrl: null,
        location: null,
        notes: null,
      };
    }

    const built: Record<string, unknown> = {
      type: interview.type || undefined,
      scheduledAt: this.parseIso(interview.scheduledAt),
      interviewer: interview.interviewer || undefined,
      meetingUrl: interview.meetingUrl || undefined,
      location: interview.location || undefined,
      notes: interview.notes || undefined,
    };

    const hasAny = Object.values(built).some((v) => v !== undefined);
    if (!hasAny) return null;

    return built;
  }

  private eventTypeForCategory(category: string): ApplicationEventType | null {
    switch (category) {
      case "interview_invitation":
      case "interview_reschedule":
        return "interview_scheduled";
      case "recruiter_outreach":
        return "recruiter_contact";
      case "assessment":
        return "assessment";
      case "offer":
        return "offer_received";
      case "rejection":
        return "rejection_received";
      default:
        return null;
    }
  }

  private async createEventForEmail(
    userId: string,
    email: ICareerEmail,
    applicationId: Types.ObjectId,
    classification: EmailClassification,
    statusChange?: { from: string; to: string } | null
  ): Promise<void> {
    const eventType = statusChange
      ? ("status_changed" as const)
      : this.eventTypeForCategory(classification.category);
    if (!eventType) return;

    const eventDate =
      statusChange
        ? email.receivedAt || new Date()
        : this.parseIso(classification.interviewDate) || email.receivedAt || new Date();

    let title: string;
    let description: string | undefined;

    if (statusChange) {
      title = `Status changed to ${statusChange.to}`;
      const confidence =
        email.careerStatusConfidence != null
          ? ` (confidence ${Math.round(email.careerStatusConfidence * 100)}%)`
          : "";
      description = `Detected "${classification.category}" in a Gmail message (${
        email.threadId || email.gmailMessageId
      }). Application status moved ${statusChange.from} -> ${statusChange.to}${confidence}. ${
        email.autoStatusReason || ""
      }`;
    } else {
      title = email.subject
        ? email.subject.slice(0, 300)
        : `${classification.category.replace(/_/g, " ")} update`;
      description = classification.summary || undefined;
    }

    await createGmailEvent(userId, String(applicationId), {
      type: eventType,
      title,
      description: description ? description.slice(0, 5000) : undefined,
      eventDate,
      sourceId: email.gmailMessageId,
    });
  }

  private extractBodyText(message: GmailMessageFull): string {
    const parts = message.payload?.parts || [];
    const bodyText = this.collectText(parts, message.payload?.body?.data);

    return bodyText.slice(0, MAX_BODY_CHARS);
  }

  private collectText(
    parts: { body?: { data?: string }; mimeType?: string; parts?: { body?: { data?: string }; mimeType?: string; parts?: unknown }[] }[],
    rootData?: string
  ): string {
    const chunks: string[] = [];

    if (rootData) {
      chunks.push(this.decodeBase64Url(rootData));
    }

    for (const part of parts) {
      if (part.body?.data) {
        chunks.push(this.decodeBase64Url(part.body.data));
      }
      if (part.parts && Array.isArray(part.parts)) {
        chunks.push(
          this.collectText(
            part.parts as unknown as {
              body?: { data?: string };
              mimeType?: string;
              parts?: { body?: { data?: string }; mimeType?: string; parts?: unknown }[];
            }[],
            part.body?.data
          )
        );
      }
    }

    return chunks.join("\n");
  }

  private decodeBase64Url(data: string): string {
    let b64 = data.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) {
      b64 += "=";
    }
    try {
      return Buffer.from(b64, "base64").toString("utf8");
    } catch {
      return "";
    }
  }

  private async matchApplication(
    userId: string,
    classification: EmailClassification,
    from?: string
  ): Promise<Types.ObjectId | null> {
    const hints = classification.extractedApplicationHints || {};
    const companyRaw = classification.companyName || hints.companyName;
    const titleRaw = classification.jobTitle || hints.jobTitle;

    if (!companyRaw && !titleRaw) {
      return null;
    }

    const companyNorm = companyRaw ? this.normalize(companyRaw) : "";
    const titleNorm = titleRaw ? this.normalize(titleRaw) : "";
    const senderDomain = this.senderDomainLabel(from);

    const applications = await Application.find({ user: userId })
      .populate("job", "companyName title")
      .lean();

    const exact: Types.ObjectId[] = [];
    const titleOnly: Types.ObjectId[] = [];
    const companyOnly: Types.ObjectId[] = [];

    for (const app of applications) {
      const job = (app as unknown as { job?: { companyName?: string; title?: string } }).job;
      if (!job) continue;

      const jobCompany = this.normalize(job.companyName || "");
      const jobTitle = this.normalize(job.title || "");

      const companyMatches =
        Boolean(companyNorm) &&
        Boolean(jobCompany) &&
        jobCompany === companyNorm;
      const titleMatches =
        Boolean(titleNorm) && Boolean(jobTitle) && jobTitle === titleNorm;

      if (companyMatches && titleMatches) {
        exact.push(app._id);
      } else if (titleMatches) {
        titleOnly.push(app._id);
      } else if (companyMatches) {
        companyOnly.push(app._id);
      }
    }

    const unambiguous = (
      ids: Types.ObjectId[]
    ): Types.ObjectId | null => (ids.length === 1 ? ids[0] : null);

    const viaExact = unambiguous(exact);
    if (viaExact) return viaExact;

    if (exact.length === 0) {
      const viaTitle = unambiguous(titleOnly);
      if (viaTitle) return viaTitle;
    }

    if (exact.length === 0 && titleOnly.length === 0) {
      const viaCompany = unambiguous(companyOnly);
      if (viaCompany) return viaCompany;

      // Sender-domain fallback, only when nothing else matched and there is a
      // company signal: the sender's domain label must appear in the job's
      // company name, and exactly one application may qualify.
      if (senderDomain && companyNorm) {
        const domainMatches = applications.filter((app) => {
          const job = (app as unknown as { job?: { companyName?: string; title?: string } }).job;
          if (!job) return false;
          return this.normalize(job.companyName || "").includes(senderDomain);
        });
        if (domainMatches.length === 1) return domainMatches[0]._id;
      }
    }

    return null;
  }

  private senderDomainLabel(from?: string): string | null {
    if (!from) return null;
    const at = from.lastIndexOf("@");
    if (at === -1) return null;
    let host = from.slice(at + 1).trim().toLowerCase();
    host = host.replace(/[>),;\s]/g, "");
    if (!host) return null;
    const labels = host.split(".").filter(Boolean);
    if (labels.length === 0) return null;
    let idx = labels.length - 1;
    if (idx > 0) {
      const last = labels[idx];
      const secondLast = labels[idx - 1];
      if (last.length !== 2 || secondLast.length !== 2) {
        idx -= 1;
      } else {
        idx -= 2;
      }
    }
    if (idx < 0) idx = 0;
    return labels[idx] || null;
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .trim();
  }

  private parseIso(value: string | null | undefined): Date | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return date;
  }

  private parseEmailDate(value?: string): Date | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return date;
  }
}

export interface SyncResult {
  synced: number;
  careerEmails: number;
  classified: number;
  skipped: number;
  failed: number;
  autoUpdated: number;
}

export default GmailService;
