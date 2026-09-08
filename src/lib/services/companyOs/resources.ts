/**
 * API のリソース定義。
 *
 * タスク・課題・決定・未決事項・会議・目標・メンバー・株主・書類は、
 * どれも「作る／直す／消す」の形が同じ。個別にルートファイルを書くと
 * 同じ検証と権限チェックを何度も書くことになり、必ずどこかで抜ける。
 *
 * ここに1か所だけ定義し、/api/company-os/[resource] が引いて使う。
 */
import { z } from 'zod'

import type { CompanyContext } from './context'
import {
  createDocument, createMember, createShareholder, deleteDocument, deleteMember, deleteShareholder,
  documentSchema, memberSchema, shareholderSchema, updateDocument, updateMember, updateShareholder,
} from './company'
import {
  createDecision, createIssue, createMeeting, createObjective, createQuestion,
  decisionSchema, deleteDecision, deleteIssue, deleteMeeting, deleteObjective, deleteQuestion,
  issueSchema, meetingSchema, objectiveSchema, questionSchema,
  updateDecision, updateIssue, updateMeeting, updateObjective, updateQuestion,
} from './management'
import {
  createMilestone, createProject, deleteMilestone, deleteProject, milestoneSchema, projectSchema,
  setMilestoneDone, updateProject,
} from './projects'
import { createTask, deleteTask, taskSchema, updateTask } from './tasks'

export interface ResourceDef {
  /** 作成時の検証 */
  schema: z.ZodTypeAny
  /** 更新時の検証。省略時は schema の partial */
  updateSchema?: z.ZodTypeAny
  create?: (ctx: CompanyContext, companyId: string, input: never) => Promise<unknown>
  update?: (ctx: CompanyContext, companyId: string, id: string, input: never) => Promise<unknown>
  remove?: (companyId: string, id: string) => Promise<boolean>
  /** 会社の骨格（会社情報・メンバー・株主）は管理者だけが触れる */
  adminOnly?: boolean
}

/** 型合わせのための薄い包み。呼び出し側は any を書かずに済む */
function res<S extends z.ZodTypeAny>(def: {
  schema: S
  updateSchema?: z.ZodTypeAny
  create?: (ctx: CompanyContext, companyId: string, input: z.infer<S>) => Promise<unknown>
  update?: (ctx: CompanyContext, companyId: string, id: string, input: Partial<z.infer<S>>) => Promise<unknown>
  remove?: (companyId: string, id: string) => Promise<boolean>
  adminOnly?: boolean
}): ResourceDef {
  return def as unknown as ResourceDef
}

export const RESOURCES: Record<string, ResourceDef> = {
  tasks: res({
    schema: taskSchema,
    create: (_ctx, companyId, input) => createTask(companyId, input),
    update: (_ctx, companyId, id, input) => updateTask(companyId, id, input),
    remove: deleteTask,
  }),
  projects: res({
    schema: projectSchema,
    create: (_ctx, companyId, input) => createProject(companyId, input),
    update: (_ctx, companyId, id, input) => updateProject(companyId, id, input),
    remove: deleteProject,
  }),
  milestones: res({
    schema: milestoneSchema,
    updateSchema: z.object({ done: z.boolean() }),
    create: (_ctx, companyId, input) => createMilestone(companyId, input),
    update: (_ctx, companyId, id, input) => setMilestoneDone(companyId, id, input.done ?? false),
    remove: deleteMilestone,
  }),
  issues: res({
    schema: issueSchema,
    create: (_ctx, companyId, input) => createIssue(companyId, input),
    update: (_ctx, companyId, id, input) => updateIssue(companyId, id, input),
    remove: deleteIssue,
  }),
  decisions: res({
    schema: decisionSchema,
    create: (_ctx, companyId, input) => createDecision(companyId, input),
    update: (ctx, companyId, id, input) => updateDecision(companyId, id, input, ctx.userName),
    remove: deleteDecision,
  }),
  questions: res({
    schema: questionSchema,
    create: (_ctx, companyId, input) => createQuestion(companyId, input),
    update: (_ctx, companyId, id, input) => updateQuestion(companyId, id, input),
    remove: deleteQuestion,
  }),
  meetings: res({
    schema: meetingSchema,
    create: (_ctx, companyId, input) => createMeeting(companyId, input),
    update: (_ctx, companyId, id, input) => updateMeeting(companyId, id, input),
    remove: deleteMeeting,
  }),
  objectives: res({
    schema: objectiveSchema,
    create: (_ctx, companyId, input) => createObjective(companyId, input),
    update: (_ctx, companyId, id, input) => updateObjective(companyId, id, input),
    remove: deleteObjective,
  }),
  members: res({
    schema: memberSchema,
    adminOnly: true,
    create: (_ctx, companyId, input) => createMember(companyId, input),
    update: (_ctx, companyId, id, input) => updateMember(companyId, id, input),
    remove: deleteMember,
  }),
  shareholders: res({
    schema: shareholderSchema,
    adminOnly: true,
    create: (_ctx, companyId, input) => createShareholder(companyId, input),
    update: (_ctx, companyId, id, input) => updateShareholder(companyId, id, input),
    remove: deleteShareholder,
  }),
  documents: res({
    schema: documentSchema,
    create: (_ctx, companyId, input) => createDocument(companyId, input),
    update: (_ctx, companyId, id, input) => updateDocument(companyId, id, input),
    remove: deleteDocument,
  }),
}

export function findResource(name: string): ResourceDef | null {
  return Object.prototype.hasOwnProperty.call(RESOURCES, name) ? (RESOURCES[name] as ResourceDef) : null
}

/** 更新用のスキーマ。指定が無ければ作成用を部分適用する */
export function updateSchemaOf(def: ResourceDef): z.ZodTypeAny {
  if (def.updateSchema) return def.updateSchema
  const schema = def.schema
  if (schema instanceof z.ZodObject) return schema.partial()
  return schema
}
