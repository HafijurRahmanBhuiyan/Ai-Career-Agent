export type ApplicationStatus =
  | "saved"
  | "applied"
  | "screening"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn";

export interface ApplicationJob {
  _id?: string;
  title?: string;
  companyName?: string;
  location?: string | null;
  locations?: string[];
  remoteType?: string;
  employmentType?: string;
  source?: string;
}

export interface Application {
  _id: string;
  job?: ApplicationJob;
  status: ApplicationStatus;
  appliedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
