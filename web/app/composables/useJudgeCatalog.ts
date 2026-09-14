export const judgeMaintenanceMessage = 'ジャッジ機能のメンテナンスを行っています。この期間中は提出等ができません。'

export function useJudgeCatalog() {
  return useFetch('/api/runtimes', { key: 'judge-catalog' })
}
