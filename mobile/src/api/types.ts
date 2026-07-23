export type JobStatus =
  | "ASSIGNED"
  | "ACCEPTED"
  | "ARRIVED"
  | "PICKED_UP"
  | "ON_THE_WAY"
  | "DELIVERED"
  | "CANCELLED";
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
  // Live position, updated on every location ping while clocked in.
  currentLat?: number | null;
  currentLng?: number | null;
  currentLocationAt?: string | null;
  // Cumulative distance (km) across today's shift(s), staff-view only.
  todayDistanceKm?: number;
  // The open shift's clock-in selfie, staff-view only — null once the shift
  // has been open more than 12h (see backend SHIFT_PHOTO_EXPIRY_MS) or if
  // the driver isn't currently clocked in.
  clockInAt?: string | null;
  clockInPhoto?: string | null;
  clockInPhotoExpired?: boolean;
  // The driver's most recently created not-yet-finished job — which stage
  // of Accept -> Arrived -> Picked Up -> On the Way -> Delivered they're on.
  // Null if they have no active job right now.
  currentJobTitle?: string | null;
  currentJobStatus?: JobStatus | null;
}

export interface RoutePoint {
  lat: number;
  lng: number;
  recordedAt: string;
}

export interface DriverLocationDetail {
  driver: { id: string; name: string };
  current: { lat: number; lng: number; at: string | null } | null;
  today: {
    distanceKm: number;
    shifts: { id: string; clockInAt: string; clockOutAt: string | null; distanceKm: number }[];
  };
  route: RoutePoint[];
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

export interface JobStop {
  id: string;
  address: string;
  sequence: number;
}

export interface Job {
  id: string;
  title: string;
  status: JobStatus;
  pickupAddress: string | null;
  // Any number of delivery locations, in route order.
  dropoffStops: JobStop[];
  notes: string | null;
  createdAt: string;
  // One timestamp per stage of the driver progress flow: Accept -> Arrived
  // -> Picked Up -> On the Way -> Delivered.
  acceptedAt: string | null;
  arrivedAt: string | null;
  pickedUpAt: string | null;
  onTheWayAt: string | null;
  deliveredAt: string | null;
  // Proof-of-pickup / proof-of-delivery photos, captured by the driver at
  // the ARRIVED->PICKED_UP and ON_THE_WAY->DELIVERED transitions. Null for
  // jobs that haven't reached that stage yet, or predate this feature.
  pickupPhoto: string | null;
  deliveryPhoto: string | null;
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
  distanceKm: number;
  // The selfie captured when this shift started — kept indefinitely (unlike
  // the live view on the Drivers screen, which withholds it once the shift
  // has been open too long or has closed), so Selfie Reports can look back
  // at any past day. Staff-view only.
  clockInPhoto?: string | null;
}

export interface HoursReport {
  id: string;
  reportNumber: string;
  driverId: string;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  totalDistanceKm: number;
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

export interface NotClockedInDriver {
  id: string;
  name: string;
  employeeCode: string;
}

export interface HoursByBusinessRow {
  businessId: string;
  businessName: string;
  driverId: string;
  driverName: string;
  jobCount: number;
  totalHours: number;
}
