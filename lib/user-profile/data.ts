import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { canAssignUserRoles } from "@/lib/permissions";
import type { UserProfile, UserProfileUpdate } from "./types";

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("users")
    .select(
      `
      id,
      email,
      name,
      full_name,
      job_title,
      department,
      bio,
      phone,
      address,
      floor_number,
      date_of_birth,
      photo_url,
      linkedin_url,
      availability_status,
      work_start_time,
      work_end_time,
      role,
      is_active,
      created_at,
      updated_at
    `
    )
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Error fetching user profile:", error);
    return null;
  }

  return data as UserProfile;
}

export async function updateUserProfile(
  userId: string,
  updates: UserProfileUpdate
): Promise<{ success: boolean; error?: string }> {
  const currentUser = await getCurrentProfile();
  if (!currentUser) {
    return { success: false, error: "Usuário não autenticado" };
  }

  if (currentUser.id !== userId && !canAssignUserRoles(currentUser.role)) {
    return { success: false, error: "Permissão negada" };
  }

  // Mantém `name` (coluna usada no sidebar, listagem, tarefas e PDFs) sempre
  // sincronizada com `full_name`. Sem isso, ao editar o nome no modal, o
  // valor antigo continua sendo exibido em todas as outras telas.
  const payload: Record<string, unknown> = {
    ...updates,
    updated_at: new Date().toISOString(),
  };
  if (typeof updates.full_name === "string" && updates.full_name.trim()) {
    payload.name = updates.full_name.trim();
  }

  const { error } = await supabase
    .from("users")
    .update(payload)
    .eq("id", userId);

  if (error) {
    console.error("Error updating user profile:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function getColleaguesByDepartment(
  department: string
): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from("users")
    .select(
      `
      id,
      email,
      name,
      full_name,
      job_title,
      department,
      bio,
      phone,
      address,
      floor_number,
      date_of_birth,
      photo_url,
      linkedin_url,
      availability_status,
      work_start_time,
      work_end_time,
      role,
      is_active,
      created_at,
      updated_at
    `
    )
    .eq("department", department)
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("Error fetching colleagues:", error);
    return [];
  }

  return data as UserProfile[];
}

export async function getColleaguesByFloor(
  floorNumber: number
): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from("users")
    .select(
      `
      id,
      email,
      name,
      full_name,
      job_title,
      department,
      bio,
      phone,
      address,
      floor_number,
      date_of_birth,
      photo_url,
      linkedin_url,
      availability_status,
      work_start_time,
      work_end_time,
      role,
      is_active,
      created_at,
      updated_at
    `
    )
    .eq("floor_number", floorNumber)
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("Error fetching floor colleagues:", error);
    return [];
  }

  return data as UserProfile[];
}

export function calculateAge(dateOfBirth: string | undefined): number | null {
  if (!dateOfBirth) return null;

  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }

  return age;
}

export function getNextBirthday(dateOfBirth: string | undefined): string | null {
  if (!dateOfBirth) return null;

  const today = new Date();
  const birthDate = new Date(dateOfBirth);

  const nextBirthday = new Date(
    today.getFullYear(),
    birthDate.getMonth(),
    birthDate.getDate()
  );

  if (nextBirthday < today) {
    nextBirthday.setFullYear(today.getFullYear() + 1);
  }

  return nextBirthday.toISOString().split("T")[0];
}

export function isWorkingHours(
  workStartTime: string | undefined,
  workEndTime: string | undefined,
  availabilityStatus: string | undefined
): boolean {
  if (availabilityStatus === "offline" || !workStartTime || !workEndTime) {
    return false;
  }

  const now = new Date();
  const [startHour, startMin] = workStartTime.split(":").map(Number);
  const [endHour, endMin] = workEndTime.split(":").map(Number);

  const currentTime =
    now.getHours() * 60 + now.getMinutes();
  const startTimeInMinutes = startHour * 60 + startMin;
  const endTimeInMinutes = endHour * 60 + endMin;

  return (
    currentTime >= startTimeInMinutes &&
    currentTime <= endTimeInMinutes &&
    availabilityStatus === "available"
  );
}
