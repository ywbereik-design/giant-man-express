export type JobStatus = "ASSIGNED" | "ACCEPTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type StaffRole = "ADMIN" | "DISPATCH";

export interface Driver {
  id: string;
  name: string;
  employeeCode: string;
  phone: string | null;
  active: boolean;
  // Present when fetched by staff (admin or dispatch) — whether the driver
  // currently has an open (not yet clocked out) shift.
  clockedIn?: boolean;
}

export interface JobType {
  id: string;
  name: string;
  active: boolean;
}

export interface Business {
  id: string;
  name: string;
  // Dispatch gets a read-only, financial-detail-free view of businesses
  // (id/name/address only) — these fields are absent, not just null, on
  // that response shape.
  contactName?: string | null;
  contactEmail?: string | null;
  address?: string | null;
  billingRate?: number | null;
}

export interface Job {
  id: string;
  title: string;
  status: JobStatus;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  notes: string | null;
  createdAt: string;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  // Set together when the driver taps "Arrived" — a timestamp and a
  // compressed selfie (data:image/jpeg;base64,...) proving they're on-site.
  arrivedAt: string | null;
  arrivalPhoto: string | null;
  jobType: JobType;
  driver?: Driver;
  business?: Business | null;
}

export interface TimeEntry {
  id: string;
  driverId: string;
  clockInAt: string;
  clockInLat: number | null;
  clockInLng: number | null;
  clockOutAt: string | null;
  clockOutLat: number | null;
  clockOutLng: number | null;
}

export interface HoursReport {
  id: string;
  reportNumber: string;
  driverId: string;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  generatedAt: string;
  driver?: { name: string; employeeCode: string };
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  businessId: string;
  periodStart: string;
  periodEnd: string;
  totalAmount: number;
  status: "DRAFT" | "FINAL";
  generatedAt: string;
  business?: { name: string };
}

export interface StaffAccount {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
}
