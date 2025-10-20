import { z } from 'zod';
import { RegisterFormSchema, RegisterPostSchema, type RegisterPostBody } from '../../utils/validation';
import { buildUrl, fetchJson } from '../http/base';

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas for masters (align with your table columns)
// ─────────────────────────────────────────────────────────────────────────────
// const RaceSchema = z.object({
//   RaceId: z.number().int(),
//   RaceCode: z.string().nullable().optional(),
//   DisplayName: z.string().nullable().optional(),
// });
// const SexSchema = z.object({
//   SexId: z.number().int(),
//   SexCode: z.string().nullable().optional(),
//   DisplayName: z.string().nullable().optional(),
// });
// const MeasurementSystemSchema = z.object({
//   MeasurementSystemId: z.number().int(),
//   MeasurementSystemCode: z.string().nullable().optional(),
//   DisplayName: z.string().nullable().optional(),
// });
// const UnitSchema = z.object({
//   UnitId: z.number().int(),
//   UnitCode: z.string().nullable().optional(),
//   DisplayName: z.string().nullable().optional(),
//   UcumCode: z.string().nullable().optional(),
//   Type: z.string().nullable().optional(),
// });
// const HealthConditionSchema = z.object({
//   HealthConditionId: z.number().int(),
//   Code: z.string().nullable().optional(),
//   DisplayName: z.string().nullable().optional(),
//   IsActive: z.boolean().optional(),
// });

type AnyRec = Record<string, any>;
const pick = (o: AnyRec, keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined) return o[k];
  return undefined;
};

const LooseUnit = z.object({
  UnitId: z.number().optional(),
  unitId: z.number().optional(),
  UnitCode: z.string().nullable().optional(),
  unitCode: z.string().nullable().optional(),
  DisplayName: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
  UcumCode: z.string().nullable().optional(),
  ucumCode: z.string().nullable().optional(),
  Type: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  IsActive: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const LooseRace = z.object({
  RaceId: z.number().optional(),
  raceId: z.number().optional(),
  RaceCode: z.string().nullable().optional(),
  raceCode: z.string().nullable().optional(),
  DisplayName: z.string().nullable().optional(),
  raceDisplayName: z.string().nullable().optional(),
});

const LooseSex = z.object({
  SexId: z.number().optional(),
  sexId: z.number().optional(),
  SexCode: z.string().nullable().optional(),
  sexCode: z.string().nullable().optional(),
  DisplayName: z.string().nullable().optional(),
  sexDisplayName: z.string().nullable().optional(),
});

const LooseMsys = z.object({
  MeasurementSystemId: z.number().optional(),
  measurementSystemId: z.number().optional(),
  MeasurementSystemCode: z.string().nullable().optional(),
  measurementSystemCode: z.string().nullable().optional(),
  DisplayName: z.string().nullable().optional(), // API sometimes uses capital D
  displayName: z.string().nullable().optional(),
});

const LooseHealth = z.object({
  HealthConditionId: z.number().optional(),
  healthConditionId: z.number().optional(),
  Code: z.string().nullable().optional(),
  code: z.string().nullable().optional(),
  DisplayName: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
  IsActive: z.boolean().optional(),
  isActive: z.boolean().optional(),
});


// response from users_create
const CreatedUserRes = z.object({
  userId: z.number().int(),
  clerkId: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  name: z.string(),
  birthYear: z.number().int(),
  raceId: z.number().int().nullable().optional(),
  raceCode: z.string().nullable().optional(),
  raceDisplayName: z.string().nullable().optional(),
  sexId: z.number().int().nullable().optional(),
  sexCode: z.string().nullable().optional(),
  sexDisplayName: z.string().nullable().optional(),
  heightNum: z.number().nullable().optional(),
  heightUnitId: z.number().int().nullable().optional(),
  weightNum: z.number().nullable().optional(),
  weightUnitId: z.number().int().nullable().optional(),
  measurementSystemId: z.number().int().nullable().optional(),
  roleId: z.number().int().nullable().optional(),
  healthConditionIds: z.array(z.number().int()).default([]).optional(),
  healthConditions: z
    .array(
      z.object({
        healthConditionId: z.number().int(),
        code: z.string().nullable().optional(),
        displayName: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .default([])
    .optional(),
  isActive: z.boolean().optional(),
  createdBy: z.number().int().optional(),
  createdOn: z.string().optional(),
});
export type CreatedUser = z.infer<typeof CreatedUserRes>;

// Generic option type for dropdowns
export type Option = { id: number; label: string; code?: string | null };

// ─────────────────────────────────────────────────────────────────────────────
// Masters fetchers (use your edge functions; no auth headers per your contract)
// ─────────────────────────────────────────────────────────────────────────────
export async function getUnits(): Promise<Option[]> {
  const url = buildUrl('units');
  const { ok, json, status, text } = await fetchJson('GET', url);
  if (!ok || !json) throw new Error(`units ${status} ${String(text ?? '')}`);
  const arr = z.array(LooseUnit).parse(json);
  return arr.map((u) => {
    const id = pick(u, ['unitId', 'UnitId']);
    const code = pick(u, ['unitCode', 'UnitCode']) ?? null;
    const name = pick(u, ['displayName', 'DisplayName']) ?? code ?? String(id);
    return { id: Number(id), label: String(name), code };
  });
}

export async function getRaces(): Promise<Option[]> {
  const url = buildUrl('races');
  const { ok, json, status, text } = await fetchJson('GET', url);
  if (!ok || !json) throw new Error(`races ${status} ${String(text ?? '')}`);
  const arr = z.array(LooseRace).parse(json);
  return arr.map((r) => {
    const id = pick(r, ['raceId', 'RaceId']);
    const code = pick(r, ['raceCode', 'RaceCode']) ?? null;
    const name = pick(r, ['raceDisplayName', 'DisplayName']) ?? code ?? String(id);
    return { id: Number(id), label: String(name), code };
  });
}

export async function getSexes(): Promise<Option[]> {
  const url = buildUrl('sexes');
  const { ok, json, status, text } = await fetchJson('GET', url);
  if (!ok || !json) throw new Error(`sexes ${status} ${String(text ?? '')}`);
  const arr = z.array(LooseSex).parse(json);
  return arr.map((s) => {
    const id = pick(s, ['sexId', 'SexId']);
    const code = pick(s, ['sexCode', 'SexCode']) ?? null;
    const name = pick(s, ['sexDisplayName', 'DisplayName']) ?? code ?? String(id);
    return { id: Number(id), label: String(name), code };
  });
}

export async function getMeasurementSystems(): Promise<Option[]> {
  const url = buildUrl('measurement_systems');
  const { ok, json, status, text } = await fetchJson('GET', url);
  if (!ok || !json) throw new Error(`measurement_systems ${status} ${String(text ?? '')}`);
  const arr = z.array(LooseMsys).parse(json);
  return arr.map((m) => {
    const id = pick(m, ['measurementSystemId', 'MeasurementSystemId']);
    const code = pick(m, ['measurementSystemCode', 'MeasurementSystemCode']) ?? null;
    const name = pick(m, ['displayName', 'DisplayName']) ?? code ?? String(id);
    return { id: Number(id), label: String(name), code };
  });
}

export type HealthConditionOption = {
  id: number;
  label: string;
  code?: string | null;
  active?: boolean;
};

export async function getHealthConditions(): Promise<HealthConditionOption[]> {
  const url = buildUrl('health_conditions');
  const { ok, json, status, text } = await fetchJson('GET', url);
  if (!ok || !json) throw new Error(`health_conditions ${status} ${String(text ?? '')}`);
  const arr = z.array(LooseHealth).parse(json);
  return arr.map((h) => {
    const id = pick(h, ['healthConditionId', 'HealthConditionId']);
    const code = pick(h, ['code', 'Code']) ?? null;
    const name = pick(h, ['displayName', 'DisplayName']) ?? code ?? String(id);
    const active = pick(h, ['isActive', 'IsActive']);
    return { id: Number(id), label: String(name), code, active: active as boolean | undefined };
  });
}
// ─────────────────────────────────────────────────────────────────────────────
// Create user
// ─────────────────────────────────────────────────────────────────────────────
export async function createUser(input: unknown): Promise<CreatedUser> {
  // Validate full form, transform to post body (omit nulls)
  const body: RegisterPostBody = RegisterPostSchema.parse(
    RegisterFormSchema.parse(input)
  );

  const url = buildUrl('users_create');
  const { ok, status, json, text } = await fetchJson('POST', url, body);
  if (!ok || !json) {
    throw new Error(`users_create ${status} ${String((json as any)?.message ?? text ?? '')}`);
  }
  return CreatedUserRes.parse(json);
}



// ─────────────────────────────────────────────────────────────────────────────
// Profile GET/PATCH (NEW)
// ─────────────────────────────────────────────────────────────────────────────
const RaceZ = z.object({
  RaceId: z.number(),
  RaceCode: z.string().nullable().optional(),
  DisplayName: z.string().nullable().optional(),
});
const SexZ = z.object({
  SexId: z.number(),
  SexCode: z.string().nullable().optional(),
  DisplayName: z.string().nullable().optional(),
});
const UnitZ = z.object({
  UnitId: z.number(),
  UnitCode: z.string().nullable().optional(),
  DisplayName: z.string().nullable().optional(),
  UcumCode: z.string().nullable().optional(),
  Type: z.string().nullable().optional(),
});
const MsysZ = z.object({
  MeasurementSystemId: z.number(),
  MeasurementSystemCode: z.string().nullable().optional(),
  DisplayName: z.string().nullable().optional(),
});
const RoleZ = z.object({
  RoleId: z.number(),
  RoleCode: z.string().nullable().optional(),
  DisplayName: z.string().nullable().optional(),
});
const HealthConditionItemZ = z.object({
  UserHealthConditionId: z.number(),
  HealthConditionId: z.number(),
  Code: z.string().nullable().optional(),
  DisplayName: z.string().nullable().optional(),
  Description: z.string().nullable().optional(),
});

export const UserProfileZ = z.object({
  UserId: z.number(),
  ClerkId: z.string().nullable().optional(),
  Email: z.string().nullable().optional(),
  Name: z.string(),
  BirthYear: z.number(),
  RaceId: z.number().nullable().optional(),
  SexId: z.number().nullable().optional(),
  HeightNum: z.number().nullable().optional(),
  HeightUnitId: z.number().nullable().optional(),
  WeightNum: z.number().nullable().optional(),
  WeightUnitId: z.number().nullable().optional(),
  MeasurementSystemId: z.number().nullable().optional(),
  IsActive: z.boolean(),
  CreatedOn: z.string(),
  ModifiedOn: z.string().nullable().optional(),
  RoleId: z.number().nullable().optional(),

  Race: RaceZ.nullable().optional(),
  Sex: SexZ.nullable().optional(),
  HeightUnit: UnitZ.nullable().optional(),
  WeightUnit: UnitZ.nullable().optional(),
  MeasurementSystem: MsysZ.nullable().optional(),
  Role: RoleZ.nullable().optional(),

  HealthConditions: z.array(HealthConditionItemZ),
});
export type UserProfile = z.infer<typeof UserProfileZ>;

const GetProfileResZ = z.object({ ok: z.literal(true), user: UserProfileZ });
const GetProfileErrZ = z.object({ ok: z.literal(false), error: z.string() });

export async function getUserProfile(userId: number): Promise<UserProfile> {
  const url = buildUrl("users_profile", { userId });
  const { ok, json, status, text } = await fetchJson("GET", url);
  if (!ok || !json) throw new Error(`users_profile ${status} ${String(text ?? "")}`);
  const parsed =
    GetProfileResZ.safeParse(json).success
      ? GetProfileResZ.parse(json)
      : (() => {
          const e = GetProfileErrZ.parse(json);
          throw new Error(e.error);
        })();
  return parsed.user;
}

export type PatchUserBody = Partial<{
  ClerkId: string | null;
  Email: string | null;
  Name: string;
  BirthYear: number;
  RaceId: number | null;
  SexId: number | null;
  HeightNum: number | null;
  HeightUnitId: number | null;
  WeightNum: number | null;
  WeightUnitId: number | null;
  MeasurementSystemId: number | null;
  IsActive: boolean;
  RoleId: number | null;
  ModifiedBy: number | null;
  HealthConditions: number[]; // A1 semantics
}> & { userId: number };

const PatchResZ = z.object({ ok: z.literal(true), user: UserProfileZ });
const PatchErrZ = z.object({
  ok: z.literal(false),
  error: z.string(),
  invalidIds: z.array(z.number()).optional(),
});

export async function patchUser(body: PatchUserBody): Promise<UserProfile> {
  const url = buildUrl("users_update");
  const { ok, status, json, text } = await fetchJson("PATCH", url, body);
  if (!ok || !json) throw new Error(`users_update ${status} ${String(text ?? "")}`);
  const parsed =
    PatchResZ.safeParse(json).success
      ? PatchResZ.parse(json)
      : (() => {
          const e = PatchErrZ.parse(json);
          throw new Error(e.error);
        })();
  return parsed.user;
}

/* ────────────────────────────────────────────────────────────────────────────
   Soft UI validation for edits (used by the store). We validate but DO NOT block.
──────────────────────────────────────────────────────────────────────────── */
export const ProfileEditSchema = z.object({
  Name: z.string().min(1, "Name is required").optional(),
  Email: z
    .union([z.string().email("Invalid email").min(1), z.literal("").transform(() => null)])
    .nullable()
    .optional(),
  BirthYear: z
    .number()
    .int()
    .gte(1900, "Birth year too small")
    .lte(new Date().getFullYear(), "Birth year in the future?")
    .optional(),
  RaceId: z.number().int().nullable().optional(),
  SexId: z.number().int().nullable().optional(),
  HeightNum: z.number().nullable().optional(),
  HeightUnitId: z.number().int().nullable().optional(),
  WeightNum: z.number().nullable().optional(),
  WeightUnitId: z.number().int().nullable().optional(),
  MeasurementSystemId: z.number().int().nullable().optional(),
  RoleId: z.number().int().nullable().optional(),
  selectedHealthConditionIds: z.array(z.number().int()).optional(),
});
export type ProfileEdit = z.infer<typeof ProfileEditSchema>;