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
import { Types } from "mongoose";

const MAX_BODY_CHARS = 6000;
const DEFAULT_MAX_MESSAGES = 25;

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

    const messageList = await client.listMessages(
      Math.max(1, Math.min(maxMessages || DEFAULT_MAX_MESSAGES, 100))
    );

    const result: SyncResult = {
      synced: 0,
      careerEmails: 0,
      classified: 0,
      skipped: 0,
      failed: 0,
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

      const matchedApplicationId = await this.matchApplication(userId, classification);

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
      });

      try {
        await careerEmail.save();
        result.classified += 1;

        if (matchedApplicationId) {
          await this.createEventForEmail(
            userId,
            careerEmail,
            matchedApplicationId,
            classification
          );
        }

        await this.maybeSendSelfNotification(userId, careerEmail, connection);
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
    connection: import("mongoose").HydratedDocument<unknown>
  ): Promise<void> {
    try {
      if (!email.category || !SELF_NOTIFY_CATEGORIES.has(email.category)) {
        return;
      }

      const profile = await Profile.findOne({ user: userId });
      if (profile && profile.gmailNotifyEnabled === false) {
        return;
      }

      const conn = connection as unknown as {
        googleAccountEmail?: string;
      };
      const recipient = profile?.notificationEmail?.trim() || conn.googleAccountEmail;
      if (!recipient) {
        return;
      }

      const accessToken = await this.ensureValidAccessToken(connection);
      const client = new GmailClient(accessToken);

      const subject = this.buildSelfNotificationSubject(email);
      const body = this.buildSelfNotificationBody(email);

      await client.sendMessage(recipient, subject, body);
    } catch {
      // Self-notification is best-effort and must never fail the sync.
    }
  }

  private buildSelfNotificationSubject(email: ICareerEmail): string {
    const milestone = (email.category || "").replace(/_/g, " ");
    const company = email.companyName ? ` at ${email.companyName}` : "";
    return `[Career Agent] ${milestone}${company}`;
  }

  private buildSelfNotificationBody(email: ICareerEmail): string {
    const lines: string[] = [];
    const category = (email.category || "").replace(/_/g, " ");

    lines.push(`Career milestone detected: ${category}`);
    if (email.companyName) lines.push(`Company: ${email.companyName}`);
    if (email.jobTitle) lines.push(`Role: ${email.jobTitle}`);
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
    classification: EmailClassification
  ): Promise<void> {
    const eventType = this.eventTypeForCategory(classification.category);
    if (!eventType) return;

    const eventDate =
      this.parseIso(classification.interviewDate) || email.receivedAt || new Date();

    const title = email.subject
      ? email.subject.slice(0, 300)
      : `${classification.category.replace(/_/g, " ")} update`;

    await createGmailEvent(userId, String(applicationId), {
      type: eventType,
      title,
      description: classification.summary || undefined,
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
    classification: EmailClassification
  ): Promise<Types.ObjectId | null> {
    const hints = classification.extractedApplicationHints || {};
    const companyRaw = classification.companyName || hints.companyName;
    const titleRaw = classification.jobTitle || hints.jobTitle;

    if (!companyRaw || !titleRaw) {
      return null;
    }

    const companyNorm = this.normalize(companyRaw);
    const titleNorm = this.normalize(titleRaw);

    const applications = await Application.find({ user: userId })
      .populate("job", "companyName title")
      .lean();

    const exact: Types.ObjectId[] = [];
    const companyOnly: Types.ObjectId[] = [];

    for (const app of applications) {
      const job = (app as unknown as { job?: { companyName?: string; title?: string } }).job;
      if (!job) continue;

      const jobCompany = this.normalize(job.companyName || "");
      const jobTitle = this.normalize(job.title || "");

      if (jobCompany && companyNorm && jobCompany === companyNorm) {
        if (titleNorm && jobTitle && jobTitle === titleNorm) {
          exact.push(app._id);
        } else {
          companyOnly.push(app._id);
        }
      }
    }

    if (exact.length === 1) {
      return exact[0];
    }
    if (exact.length === 0 && companyOnly.length === 1) {
      return companyOnly[0];
    }
    return null;
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
}

export default GmailService;
