import { z } from 'zod';

const currentYear = new Date().getFullYear();

/** Helpers to accept "", null, undefined → null, otherwise coerce to number */
const toNullableNumber = (v: unknown) => (v === '' || v === undefined || v === null ? null : v);

const optionalPositiveInt = z
  .preprocess(toNullableNumber, z.number().int().positive().nullable())
  .optional();

const optionalPositiveNumber = z
  .preprocess(toNullableNumber, z.number().positive().nullable())
  .optional();

/** REQUIRED fields */
const NameSchema = z.string().trim().min(1, 'Name is required').max(100);

const BirthYearSchema = z.coerce
  .number()
  .int('Birth year must be an integer')
  .gte(1900, 'Birth year seems too old')
  .lte(currentYear, 'Birth year cannot be in the future');

/** Main form schema (accepts nullables; numbers may arrive as strings) */
export const RegisterFormSchema = z.object({
  // required
  name: NameSchema,
  birthYear: BirthYearSchema,

  // optional (nullable on form)
  clerkId: z.string().min(1).max(255).nullable().optional(),
  email: z.string().email('Invalid email').max(255).nullable().optional(),

  raceId: optionalPositiveInt,
  sexId: optionalPositiveInt,

  heightNum: optionalPositiveNumber,
  heightUnitId: optionalPositiveInt,

  weightNum: optionalPositiveNumber,
  weightUnitId: optionalPositiveInt,

  measurementSystemId: optionalPositiveInt,

  roleId: optionalPositiveInt, // single role

  // multiselect
  healthConditionIds: z.array(z.coerce.number().int().positive()).default([]).optional(),
});

export type RegisterFormInput = z.infer<typeof RegisterFormSchema>;

/** Transform to backend payload: drop null/empty optionals */
export const RegisterPostSchema = RegisterFormSchema.transform((v) => ({
  ...(v.clerkId ? { clerkId: v.clerkId } : {}),
  ...(v.email ? { email: v.email } : {}),
  name: v.name,
  birthYear: v.birthYear,
  ...(v.raceId ? { raceId: v.raceId } : {}),
  ...(v.sexId ? { sexId: v.sexId } : {}),
  ...(typeof v.heightNum === 'number' ? { heightNum: v.heightNum } : {}),
  ...(v.heightUnitId ? { heightUnitId: v.heightUnitId } : {}),
  ...(typeof v.weightNum === 'number' ? { weightNum: v.weightNum } : {}),
  ...(v.weightUnitId ? { weightUnitId: v.weightUnitId } : {}),
  ...(v.measurementSystemId ? { measurementSystemId: v.measurementSystemId } : {}),
  ...(v.roleId ? { roleId: v.roleId } : {}),
  ...(v.healthConditionIds && v.healthConditionIds.length
    ? { healthConditionIds: v.healthConditionIds }
    : {}),
}));
export type RegisterPostBody = z.infer<typeof RegisterPostSchema>;
