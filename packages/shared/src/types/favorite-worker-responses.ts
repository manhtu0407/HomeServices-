export type FavoriteWorkerForMatching = {
  id: string
  avatar_url: string | null
  display_name: string | null
  rating: number | null
  total_jobs: number
  availability: 'available' | 'unavailable'
  availability_reason: 'not_available_for_this_request' | null
}

export type FavoriteWorkersForMatchingResponse = {
  job_id: string
  workers: FavoriteWorkerForMatching[]
}
