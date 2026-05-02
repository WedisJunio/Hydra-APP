export type UserProfile = {
  id: string;
  email: string;
  name: string;
  full_name?: string;
  job_title?: string;
  department?: string;
  bio?: string;
  phone?: string;
  address?: string;
  floor_number?: number;
  date_of_birth?: string; // ISO date YYYY-MM-DD
  photo_url?: string;
  linkedin_url?: string;
  availability_status?: "available" | "busy" | "away" | "offline";
  work_start_time?: string; // HH:mm format
  work_end_time?: string; // HH:mm format
  role: string; // admin, manager, coordinator, leader, employee
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SimpleUserProfile = Pick<
  UserProfile,
  "id" | "name" | "photo_url" | "job_title" | "department"
>;

export type UserProfileUpdate = Partial<
  Pick<
    UserProfile,
    | "full_name"
    | "bio"
    | "phone"
    | "address"
    | "floor_number"
    | "date_of_birth"
    | "linkedin_url"
    | "work_start_time"
    | "work_end_time"
    | "availability_status"
    | "photo_url"
    | "role"
  >
>;

export const AVAILABILITY_LABELS: Record<
  NonNullable<UserProfile["availability_status"]>,
  string
> = {
  available: "Disponível",
  busy: "Ocupado",
  away: "Ausente",
  offline: "Offline",
};

export const AVAILABILITY_COLORS: Record<
  NonNullable<UserProfile["availability_status"]>,
  string
> = {
  available: "var(--success)",
  busy: "var(--warning)",
  away: "var(--info)",
  offline: "var(--muted-fg)",
};

export { ROLE_LABELS } from "@/lib/permissions";
