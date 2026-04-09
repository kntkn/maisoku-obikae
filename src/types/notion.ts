export interface NotionListing {
  id: string
  reinsId: string
  userId: string
  round: number | null
  adStatus: boolean
  bukakuPf: string
  bukakuStatus: string
  bukakuResult: string
  completedUrl: string | null
  proposalStatus: string | null
}
