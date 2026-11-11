import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import {
  connectors,
  expertConnectors,
  expertKnowledgeBases,
  expertSkills,
  experts,
  knowledgeBases,
  skills,
} from '@/server/db/schema';
import { newId } from '@/server/ids';
import { isAdmin } from '@/server/auth/rbac';
import { ApiError } from '@/server/http';
import type { AuthContext } from '@/server/auth/session';

export const ExpertInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(600).default(''),
  icon: z.string().max(40).default('spark'),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, '颜色需为 #RRGGBB')
    .default('#7c6cff'),
  category: z.string().max(40).default('通用'),
  systemPrompt: z.string().max(30_000).default(''),
  providerId: z.string().nullable().optional(),
  modelId: z.string().max(160).default(''),
  temperature: z.number().min(0).max(2).default(0.4),
  maxSteps: z.number().int().min(1).max(24).default(8),
  toolPolicy: z.enum(['never', 'dangerous', 'always']).default('dangerous'),
  defaultMode: z.enum(['ask', 'plan', 'agent']).default('agent'),
  visibility: z.enum(['private', 'team', 'public']).default('team'),
  skillIds: z.array(z.string()).max(24).optional(),
  kbIds: z.array(z.string()).max(24).optional(),
  connectorIds: z.array(z.string()).max(24).optional(),
});

export type ExpertInputType = z.infer<typeof ExpertInput>;

export function assertExpertEditable(auth: AuthContext, expert: typeof experts.$inferSelect): void {
  if (isAdmin(auth.role)) return;
  if (expert.createdBy === auth.user.id && expert.visibility !== 'public') return;
  throw new ApiError(403, '只有管理员或创建者可以修改该专家', 'forbidden');
}

export function canViewExpert(auth: AuthContext, expert: typeof experts.$inferSelect): boolean {
  if (expert.visibility !== 'private') return true;
  return expert.createdBy === auth.user.id || isAdmin(auth.role);
}

export async function syncBindings(
  orgId: string,
  expertId: string,
  input: Pick<ExpertInputType, 'skillIds' | 'kbIds' | 'connectorIds'>,
): Promise<void> {
  const db = await getDb();

  if (input.skillIds) {
    const owned = input.skillIds.length
      ? await db
          .select({ id: skills.id })
          .from(skills)
          .where(and(eq(skills.orgId, orgId), inArray(skills.id, input.skillIds)))
      : [];
    if (owned.length !== input.skillIds.length) throw new ApiError(422, '包含无效的技能 ID');
    await db.delete(expertSkills).where(eq(expertSkills.expertId, expertId));
    if (input.skillIds.length) {
      await db.insert(expertSkills).values(
        input.skillIds.map((skillId) => ({
          id: newId('esk'),
          orgId,
          expertId,
          skillId,
          version: 0,
          enabled: true,
        })),
      );
    }
  }

  if (input.kbIds) {
    const owned = input.kbIds.length
      ? await db
          .select({ id: knowledgeBases.id })
          .from(knowledgeBases)
          .where(and(eq(knowledgeBases.orgId, orgId), inArray(knowledgeBases.id, input.kbIds)))
      : [];
    if (owned.length !== input.kbIds.length) throw new ApiError(422, '包含无效的知识库 ID');
    await db.delete(expertKnowledgeBases).where(eq(expertKnowledgeBases.expertId, expertId));
    if (input.kbIds.length) {
      await db.insert(expertKnowledgeBases).values(
        input.kbIds.map((knowledgeBaseId) => ({
          id: newId('ekb'),
          orgId,
          expertId,
          knowledgeBaseId,
          topK: 6,
        })),
      );
    }
  }

  if (input.connectorIds) {
    const owned = input.connectorIds.length
      ? await db
          .select({ id: connectors.id })
          .from(connectors)
          .where(and(eq(connectors.orgId, orgId), inArray(connectors.id, input.connectorIds)))
      : [];
    if (owned.length !== input.connectorIds.length) throw new ApiError(422, '包含无效的连接器 ID');
    await db.delete(expertConnectors).where(eq(expertConnectors.expertId, expertId));
    if (input.connectorIds.length) {
      await db.insert(expertConnectors).values(
        input.connectorIds.map((connectorId) => ({
          id: newId('ecn'),
          orgId,
          expertId,
          connectorId,
          enabled: true,
        })),
      );
    }
  }
}

export async function expertBindings(orgId: string, expertId: string) {
  const db = await getDb();
  const [skillRows, kbRows, connectorRows] = await Promise.all([
    db
      .select({ id: expertSkills.skillId, name: skills.name, version: expertSkills.version })
      .from(expertSkills)
      .innerJoin(skills, eq(skills.id, expertSkills.skillId))
      .where(and(eq(expertSkills.orgId, orgId), eq(expertSkills.expertId, expertId))),
    db
      .select({ id: expertKnowledgeBases.knowledgeBaseId, name: knowledgeBases.name })
      .from(expertKnowledgeBases)
      .innerJoin(knowledgeBases, eq(knowledgeBases.id, expertKnowledgeBases.knowledgeBaseId))
      .where(
        and(eq(expertKnowledgeBases.orgId, orgId), eq(expertKnowledgeBases.expertId, expertId)),
      ),
    db
      .select({ id: expertConnectors.connectorId, name: connectors.name })
      .from(expertConnectors)
      .innerJoin(connectors, eq(connectors.id, expertConnectors.connectorId))
      .where(and(eq(expertConnectors.orgId, orgId), eq(expertConnectors.expertId, expertId))),
  ]);
  return {
    skills: skillRows,
    knowledgeBases: kbRows,
    connectors: connectorRows,
  };
}
