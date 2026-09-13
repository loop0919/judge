import { z } from 'zod'
export const difficultySchema = z.number().int().min(1).max(10).nullable().default(null)
export const difficultyGrades = ['黒', '灰', '茶', '緑', '水', '青', '黄', '橙', '赤', '金'] as const
